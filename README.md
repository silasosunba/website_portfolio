# Silas Osunba's portfolio

A Next.js portfolio deployed from GitHub to **Cloudflare Workers** using OpenNext. News, Projects, Writings, and Books are managed through the owner-only `/admin` dashboard and rendered on the server from Supabase. Writings can link to Medium or be published as full articles on this website. Resume and Academic CV PDFs can also be updated under **Admin > Documents** using Supabase Storage. Visitors do not need accounts.

The app keeps SSR, React Server Components, Server Actions, cookie-based Supabase authentication, publishing, private image uploads, and server-side Resend contact delivery. It is not a static export. Images, CSS, JavaScript, and downloadable PDFs remain included.

## Adapter choice and compatibility

Cloudflare currently recommends [vinext](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) as its default Next.js deployment path. vinext is a beta reimplementation of the Next.js API on Vite. Adopting it would replace the runtime/toolchain for an existing application.

This project instead uses the documented [OpenNext adapter path](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/), which adapts the output of `next build`. Versions are pinned in `package.json` and `package-lock.json`: OpenNext **1.20.16**, Wrangler **4.157.0**, and Next.js **16.4.5**. The original Next.js 16.3.5 does not satisfy the current adapter's peer requirement (`>=15.5.29 <16 || >=16.4.5`); updating within Next.js 16 avoids forcing an incompatible adapter or migrating frameworks.

OpenNext's Node.js `proxy.ts` bundling is experimental and unsupported by its maintainers. The existing Supabase interceptor was moved to the supported `src/middleware.ts` convention with the same cookie refresh, private response headers, and redirect behavior. Next.js 16 emits a deprecation warning for that filename; retain it until the adapter supports the Node proxy path. Pages, route handlers, and Server Actions still use the Node.js runtime provided by Workers' `nodejs_compat` support.

## Cloudflare dashboard: GitHub to Workers

Create/connect a **Worker**, not a Pages project, using the existing GitHub repository. Enter these settings under the Worker's build configuration:

| Setting | Exact value |
| --- | --- |
| Worker name | `silas-portfolio` |
| Production branch | `main` |
| Root directory | `portfolio` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Dependency installation | Automatic npm installation using `package-lock.json` |
| Build variable `NODE_VERSION` | `22` |

The root directory contains the package and Wrangler configuration, so commands do not need a `cd portfolio` prefix in the dashboard. The adapter build invokes the existing `npm run build` itself. The deploy command uses the already-built artifact and `--keep-vars` to retain dashboard-managed runtime variables; it does not rebuild.

There is no Pages output-directory field to configure. `wrangler.jsonc` specifies `.open-next/worker.js` and `.open-next/assets`. Keep the dashboard Worker name, Wrangler `name`, and self-reference service name identical. Leave non-production/branch preview builds disabled until separate preview authentication origins and environment values have been configured. The local `preview:cloudflare` script is not a deploy command for Cloudflare branch previews.

Official references: [Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [build image and Node version](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), and [OpenNext environment handling](https://opennext.js.org/cloudflare/howtos/env-vars).

## Environment variables, secrets, and bindings

Set the following names in **Settings > Build > Build variables and secrets**. These example values are placeholders only:

```dotenv
NODE_VERSION=22
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
```

`NEXT_PUBLIC_SITE_URL` must be your final HTTPS origin, such as your assigned Workers hostname or custom domain. It controls canonical/social metadata and replaces the former hard-coded hosting URL. The localhost fallback is for local development only.

Also set the following in **Settings > Variables & Secrets** for the Worker runtime:

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API origin |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key; never use a service-role or secret key |
| `RESEND_API_KEY` | **Secret**: Resend sending-access API key, restricted to the verified sending domain |
| `CONTACT_FROM_EMAIL` | Text: sender on the verified domain, e.g. `Your Name <contact@mail.YOUR_DOMAIN>` |
| `CONTACT_TO_EMAIL` | Text: inbox that receives contact submissions, e.g. `YOUR_INBOX@example.com` |

Build settings and runtime settings are distinct. Supply matching Supabase values in both. Next.js can inline `NEXT_PUBLIC_` values during compilation, so rebuild when changing them; runtime changes alone cannot replace inlined values. These are public configuration values, even if entered as encrypted dashboard secrets. No Supabase database password or service-role key is required.

Workers Builds manages its Cloudflare deployment authorization through the connected repository integration. Do not add Cloudflare API tokens to application code or Wrangler config. A separate local CLI deployment would require your own Cloudflare login or deployment credentials, but neither is needed for local preview.

Bindings are declared in `portfolio/wrangler.jsonc`:

| Binding | Configuration |
| --- | --- |
| `ASSETS` | Static assets from `.open-next/assets`, uploaded with the Worker |
| `WORKER_SELF_REFERENCE` | Service binding targeting this same `silas-portfolio` Worker |
| `CONTACT_RATE_LIMITER` | Native Workers rate limiter: up to 5 valid submissions per visitor IP per 60 seconds per Cloudflare location, namespace `9471023` |

No D1, KV, R2, Images, or Durable Object resources are required by the current app. CMS reads use `no-store` on every server request and media is stored in Supabase. The app uses normal image elements, not `next/image` optimization. OpenNext uses its default disabled cache backends; configure persistent caching explicitly if ISR or cached data is introduced later. Static hashed assets have an immutable cache rule in `public/_headers`.

## Local development and Workers preview

Use Node.js 22.18 or newer. From the repository root:

```sh
cd portfolio
npm ci
cp .env.example .env.local
cp .dev.vars.example .dev.vars
```

Replace the placeholders in `.env.local` with your own Supabase values. Set the local site origin to `http://localhost:3000` for Next.js development, or your local preview origin when checking generated metadata. `.dev.vars` selects the development environment for the adapter's Next.js environment-file loading. Add the three server-only mail variables to `.env.local` for `next dev` and `.dev.vars` for Workers preview. Keep only placeholders in `.env.example` and `.dev.vars.example`; example files are tracked and are not loaded as credentials. Both private local files and all generated Worker output/state are ignored by Git. Never overwrite existing private values when copying examples.

For normal development:

```sh
npm run dev
```

For a production bundle running locally on **workerd**, with no deployment:

```sh
npm run build:cloudflare
npm run preview:cloudflare -- -- --local --ip 127.0.0.1 --port 8787
```

Open `http://localhost:8787`. Rebuild after changing code or build-time variables; the preview script serves the most recent bundle. Local HTTP does not reproduce production HTTPS cookie behavior, so check owner authentication over HTTPS after deployment as well.

The explicit deployment script is `npm run deploy:cloudflare`, used after the build. Running it uploads and publishes the Worker. It has not been run as part of this setup.

## Supabase and contact-form setup

Follow [database and owner setup](portfolio/supabase/README.md). Keep the current database, owner ID, RLS policies, and private media bucket. No database reseeding or migration is required just to change hosts.

Manually set Supabase Auth's Site URL to the final production origin and add its exact `/auth/callback` URL to the redirect allowlist. Allow `http://localhost:8787/auth/callback` if testing recovery locally; production cookies require HTTPS. Check custom recovery email templates for old hosting URLs. These external settings have not been changed.

The contact form sends JSON to the same-origin `POST /api/contact` route. That server route validates the fields and checks the request origin, then calls Resend's HTTPS API using native `fetch`. The API key stays on the server. `CONTACT_FROM_EMAIL` must use the exact domain verified in Resend; `CONTACT_TO_EMAIL` can be an existing Gmail inbox. The visitor's email becomes `Reply-To`, so replying in your inbox addresses the visitor. The visitor cannot override the configured sender or recipient. Messages are sent as plain text and are not stored in Supabase.

In **Resend > API Keys**, create a sending-access key scoped to your verified domain. In **Cloudflare > Workers & Pages > silas-portfolio > Settings > Variables and Secrets**, add the three mail settings above, select **Secret** for `RESEND_API_KEY`, and apply them. They are runtime values, not build requirements. Local Next.js uses `.env.local`; local Workers preview uses `.dev.vars`. The rate-limit binding is declared in Wrangler and is included on the next code deployment; normal `next dev/start` has no Workers rate limiter. Its limit is approximate per Cloudflare location, not a global quota or a CAPTCHA. Use a different namespace ID if `9471023` is already used by another rate limiter in your Cloudflare account.

On success, the form clears only after Resend returns an email ID. On failure or timeout, entered values remain available and the form offers a direct email link. Provider acceptance does not guarantee inbox delivery: check Resend's Emails dashboard for delivery or bounce events and check Gmail's inbox/spam folder. EmailJS is no longer used by the application. No email has been sent and no external account settings have been changed as part of this migration.

Resend migration verification: all 109 automated tests, TypeScript, lint, and the Next.js/OpenNext production build passed. Browser checks at 375, 768, and 1440 pixels confirmed pending feedback, custom subjects, error/input retention, retry, success/reset, and responsive layout. A local workerd check exercised the built route with fake runtime settings and intercepted provider calls, including the sixth-submission rate limit. No live Resend request or Gmail delivery was tested.

## Server-side error reporting

Application errors use `portfolio/src/lib/server-logger.ts`. It emits structured server records with a stable event name, error level, timestamp, and generated request ID. Only approved diagnostic fields (provider HTTP status or CMS content kind) are included; submitted messages, email addresses, IP addresses, credentials, raw errors, and provider response bodies are excluded from these application-authored records. Validation feedback remains in the form; routine validation failures and successful submissions do not produce application error logs.

Contact responses include `X-Request-Id`. For a failed submission, find this header in the browser Network panel and match it to the log's `requestId`. The server generates the identifier and does not trust a supplied request-ID header. Public CMS load failures use `cms.public_content_unavailable` with the affected content kind.

After deployment, open **Cloudflare > Workers & Pages > silas-portfolio > Observability** and filter by `event` or `requestId`. Wrangler's existing observability setting captures these records. A single `console.error` inside the logger is the Workers output transport; ESLint prevents direct console calls elsewhere in application code. No external logging account or package is required. [Cloudflare structured logging guidance](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#logging-structured-json-objects)

## Validation and GitHub CI

`.github/workflows/ci.yml` ("Validate portfolio") retains tests, Next.js type generation, type checking, linting, and the standard Next.js production build. It additionally bundles that validated output for Cloudflare with `--skipNextBuild`; CI never deploys.

```sh
npm test
npx next typegen
npm run typecheck
npm run lint
npm run build:cloudflare
```

The Cloudflare build includes the standard Next.js production build. Local Workers verification should cover public page rendering, unauthenticated admin redirects, invalid recovery links, private media denial, static JS/PDF delivery, and a Server Action POST. With real service configuration, also verify owner login, password recovery, uploads, draft saves, publication/unpublication, deletion, and actual Resend delivery. Embedded database tests validate owner policies but cannot replace those hosted-service checks.

Setup verification passed all 19 tests, type generation, type checking, linting, the Next.js/OpenNext build, and local Workers HTTP checks. The local preview used no real Supabase credentials; CMS pages showed their unavailable state. Placeholder-only runtime bindings were used to check middleware redirects, and a blank login POST checked Server Action validation. Live owner login, database publishing/uploads, recovery email delivery, and contact email delivery were not tested. Dependency installation reported 18 audit findings (1 low, 8 moderate, 9 high); no force-upgrades were applied.

### Resume and Academic CV

Apply `portfolio/supabase/011_portfolio_documents.sql` in Supabase SQL Editor, deploy the updated app, then open **Admin > Documents**. Upload a PDF up to 5 MB to replace either document without editing the repository or rebuilding the website. The current PDF stays available while a replacement uploads. Successful publication updates the public CV viewer; selected PDFs and errors remain visible if the operation cannot be confirmed.

Uploads use a separate private `portfolio-documents` bucket and owner-only publishing policies. The public `/api/documents/resume` and `/api/documents/cv` routes serve only the current referenced PDF. Existing bundled PDFs remain the fallback before the first upload. No new secrets or Cloudflare bindings are required. See the [document upload guide](portfolio/supabase/README.md#resume-and-academic-cv-uploads) for setup, privacy, replacement conflicts, and cleanup behavior.

### In-app writings

Apply `portfolio/supabase/008_in_app_writings.sql`, then `portfolio/supabase/009_visual_writing_formatting.sql`, after migration 007 before deploying this feature. In `/admin` → Writings, choose **On Medium** for an external link or **On this website** for a full article with a shareable `/articles/[slug]` URL. In-app articles use a visual formatting editor. Writings display newest first by publication date; other sections retain manual ordering. Draft privacy, private image uploads, and owner authorization are preserved. See the [CMS guide](portfolio/supabase/README.md#enabling-in-app-writings-on-an-existing-deployment) for setup and verification.
