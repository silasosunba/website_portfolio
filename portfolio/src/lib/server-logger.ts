// Application-authored server logs use a fixed schema. Never pass raw errors or request data.
const events = [
  "contact.configuration_missing",
  "contact.rate_limiter_unavailable",
  "contact.provider_rejected",
  "contact.provider_response_invalid",
  "contact.delivery_timeout",
  "contact.delivery_failed",
  "cms.public_content_unavailable",
  "documents.public_document_unavailable",
  "documents.upload_failed",
  "documents.publish_failed",
  "documents.cleanup_failed",
] as const;

type ServerErrorEvent = typeof events[number];
type ServerErrorContext = {
  requestId?: string;
  providerStatus?: number;
  contentKind?: "news" | "projects" | "articles" | "books";
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function reportServerError(event: ServerErrorEvent, context: ServerErrorContext = {}): string {
  const requestId = typeof context.requestId === "string" && uuidPattern.test(context.requestId)
    ? context.requestId
    : crypto.randomUUID();

  // Reconstruct approved fields rather than spreading arbitrary context into production logs.
  const record = {
    level: "error",
    event: (events as readonly string[]).includes(event) ? event : "server.unexpected_error",
    timestamp: new Date().toISOString(),
    requestId,
    ...(typeof context.providerStatus === "number" && Number.isInteger(context.providerStatus)
      && context.providerStatus >= 100 && context.providerStatus <= 599
      ? { providerStatus: context.providerStatus } : {}),
    ...(typeof context.contentKind === "string" && ["news", "projects", "articles", "books"].includes(context.contentKind)
      ? { contentKind: context.contentKind } : {}),
  };

  // Cloudflare Workers captures this single object and indexes its fields in Observability.
  console.error(record);
  return requestId;
}
