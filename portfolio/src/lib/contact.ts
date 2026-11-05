import { reportServerError } from "./server-logger.ts";

type ContactConfig = {
  apiKey?: string;
  fromEmail?: string;
  toEmail?: string;
};

export type ContactRateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

const MAX_BODY_BYTES = 32 * 1024;
const deliveryError = "Your message could not be sent. Please try again, or email me directly.";
const unavailableError = "The contact form is temporarily unavailable. Please email me directly.";
const emailPattern = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
function containsControlCharacters(value: string, allowLineBreaks = false) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 || code === 127) && !(allowLineBreaks && [9, 10, 13].includes(code));
  });
}

function jsonResponse(status: number, requestId: string, error?: string) {
  return Response.json(error ? { ok: false, error } : { ok: true }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  if (origin === target.origin) return true;
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const loopback = ["localhost", "127.0.0.1", "[::1]"];
    // Workers preview can normalize 127.0.0.1 to localhost in the Next.js request URL.
    return origin === source.origin && source.protocol === "http:"
      && loopback.includes(source.hostname) && loopback.includes(target.hostname)
      && source.port === target.port;
  } catch {
    return false;
  }
}

async function readPayload(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing body");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Body too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

export async function handleContactRequest(
  request: Request,
  config: ContactConfig,
  send: typeof fetch = fetch,
  rateLimiter?: ContactRateLimiter,
): Promise<Response> {
  // Generate IDs on the server; incoming headers cannot inject identifiers into logs.
  const requestId = crypto.randomUUID();
  const respond = (status: number, error?: string) => jsonResponse(status, requestId, error);

  // The browser must submit from this site's contact form. This is not bot authentication.
  if (!hasValidOrigin(request)) {
    return respond(403, "Please send your message using this website’s contact form.");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return respond(415, "Please submit the contact form again.");
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return respond(413, "Your message is too long. Please shorten it and try again.");
  }

  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return error instanceof RangeError
      ? respond(413, "Your message is too long. Please shorten it and try again.")
      : respond(400, "Please check your message and try again.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return respond(400, "Please check your message and try again.");
  }
  const fields = payload as Record<string, unknown>;
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const email = typeof fields.email === "string" ? fields.email.trim() : "";
  const subject = typeof fields.subject === "string" ? fields.subject.trim() : "";
  const message = typeof fields.message === "string" ? fields.message.trim() : "";

  if (!name || name.length > 100 || containsControlCharacters(name)) {
    return respond(400, "Please enter a name of up to 100 characters.");
  }
  if (!email || email.length > 254 || !emailPattern.test(email) || containsControlCharacters(email)) {
    return respond(400, "Please enter a valid email address.");
  }
  if (!subject || subject.length > 160 || containsControlCharacters(subject)) {
    return respond(400, "Please enter a subject of up to 160 characters.");
  }
  if (!message || message.length > 5000 || containsControlCharacters(message, true)) {
    return respond(400, "Please enter a message of up to 5,000 characters.");
  }

  const apiKey = config.apiKey?.trim();
  const fromEmail = config.fromEmail?.trim();
  const toEmail = config.toEmail?.trim();
  if (!apiKey || !fromEmail || !toEmail || !emailPattern.test(toEmail)
    || containsControlCharacters(fromEmail) || containsControlCharacters(toEmail)) {
    reportServerError("contact.configuration_missing", { requestId });
    return respond(503, unavailableError);
  }

  if (rateLimiter) {
    try {
      const visitor = request.headers.get("cf-connecting-ip") || "local-preview";
      const { success } = await rateLimiter.limit({ key: `contact:${visitor}` });
      if (!success) {
        return respond(429, "You’ve sent several messages. Please wait a minute before trying again.");
      }
    } catch {
      reportServerError("contact.rate_limiter_unavailable", { requestId });
      return respond(503, unavailableError);
    }
  }

  try {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject: `[Portfolio] ${subject}`,
        // Plain text preserves the visitor's message without interpreting supplied HTML.
        text: `New portfolio contact message\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      // Provider responses can contain submitted data; keep them out of logs and the browser.
      reportServerError("contact.provider_rejected", { requestId, providerStatus: response.status });
      return respond(502, deliveryError);
    }
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("id" in result)
      || typeof result.id !== "string" || !result.id.trim()) {
      reportServerError("contact.provider_response_invalid", { requestId });
      return respond(502, deliveryError);
    }
    // Acceptance by Resend does not confirm delivery to the recipient's inbox.
    return respond(200);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      reportServerError("contact.delivery_timeout", { requestId });
      return respond(504, "Sending took too long to confirm. Please email me directly if needed.");
    }
    reportServerError("contact.delivery_failed", { requestId });
    return respond(502, deliveryError);
  }
}
