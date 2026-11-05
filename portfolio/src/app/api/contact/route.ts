import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleContactRequest, type ContactRateLimiter } from "../../../lib/contact";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let rateLimiter: ContactRateLimiter | undefined;
  try {
    const { env } = getCloudflareContext();
    rateLimiter = (env as unknown as { CONTACT_RATE_LIMITER?: ContactRateLimiter }).CONTACT_RATE_LIMITER;
  } catch {
    // Plain next dev/start has no Workers context. The binding is available in Workers preview/deployment.
  }

  return handleContactRequest(request, {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.CONTACT_FROM_EMAIL,
    toEmail: process.env.CONTACT_TO_EMAIL,
  }, fetch, rateLimiter);
}
