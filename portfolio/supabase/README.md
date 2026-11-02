# Portfolio content management

News, Projects, Articles, and Books live in separate Supabase tables. Public pages render on the Next.js server; the browser does not query Supabase. The homepage biography, About story, research publications, documents, and visual design remain repository-managed.

## Hosting

Deploy `portfolio/` to a host that runs Next.js (for example your existing Vercel project). Build with `npm run build` and run with `npm start` when self-hosting. GitHub Pages and `output: 'export'` cannot run authentication, Server Actions, or SSR. The repository workflow validates changes; it does not deploy a static export.

## Environment

Set these on the Next.js server and in `portfolio/.env.local` for local development:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

No service-role key, database password, or secret key is required by this application. Only a publishable key is accepted. Sessions use Secure (production), HttpOnly, SameSite=Lax cookies. The browser sends forms and Server Actions to the Next.js server. The proxy refreshes sessions only for admin and media requests. Every read of the dashboard and every write/upload independently verifies the user with Supabase Auth and checks their exact ID against `portfolio_owner`.

## Database installation / migration

Back up your existing database before applying schema changes. In the Supabase SQL Editor:

1. Run `005_portfolio_cms.sql`. It is self-contained for a fresh project and also supports databases created by migrations 001–004. It creates four tables, private image storage, owner policies, version triggers, and supporting indexes. Existing Books rows are copied with their IDs, notes, reading states, order, and publication status. The old `portfolio_content` table is retained but API grants are revoked to prevent split writes.
2. For a new database, run `006_initial_content.sql`. It contains a retained snapshot of 20 News entries, 8 Projects, and 1 Medium article. Matching seed keys are never overwritten. This is initial migration content, not a public-page fallback or a backup of subsequent CMS edits. Do not re-run it to update content after you begin managing entries; a deleted seeded entry could be re-created. Manage ongoing content through `/admin`.
3. If you already have a row in `portfolio_owner`, keep it. Otherwise create your email/password account under Authentication → Users, confirm it, and register its UUID:

```sql
insert into public.portfolio_owner (singleton, user_id)
values (true, 'YOUR_AUTH_USER_UUID');
```

The table permits exactly one owner. The application cannot add or change owners. No role hierarchy or visitor accounts are implemented. Under Authentication settings, disable new-user sign-ups. Enable MFA on your owner account through your Supabase setup if required; the application currently uses password sign-in.

Migration 005 never deletes legacy data. External HTTP image/book links from legacy records are cleared because the site accepts HTTPS links. Existing valid HTTPS links and local `/images/` paths are preserved. The migration enforces the editor's field limits, so exceptionally long legacy book notes (>30,000 characters) must be addressed before migration. SQL files are not applied automatically; this checkout has no management/database credentials.

## Owner workflow

Open `/admin` and sign in at `/admin/login`. Choose News, Projects, Articles, or Books.

- Save as a draft or publish. Uncheck Published and save to unpublish.
- Use Display order to reorder entries (lower numbers appear first).
- News uses paragraphs of text/link segments, with optional bold and italics. It is stored as validated versioned JSON and rendered as React elements, never raw HTML.
- Articles store the title, excerpt, date, cover, reading time, and Medium URL; full article authoring remains on Medium.
- Upload a PNG, JPEG, WebP, or GIF up to 5 MB, or use an existing HTTPS image URL / `/images/` path. Uploaded media bytes and MIME types are checked on the server. SVG and HTML uploads are rejected.
- Preview uses the same list components as the public pages. Entries require valid fields before previewing; drafts can omit project/article covers until publication.
- Edits remain in the form after a failed save. A version check prevents overwriting a record changed in another tab. Reload the dashboard and select the latest record after a conflict.
- Deletion requires confirmation. Deleting an entry does not delete its image, which may be shared by another entry. Unattached uploads remain private. You can remove unused objects through the Supabase Storage dashboard.

New content appears without code changes or a deployment. Public lists query Supabase on every server render using an anonymous client and no persistent content cache. Successful writes revalidate the affected routes. Changes made from another deployment or directly in Supabase are visible on the next fresh page request when both environments use the same Supabase project. Refresh an already-open public page to see updates; pages do not subscribe to live changes. Public reads never use your owner session. Failed queries show a small unavailable state and are not replaced with old static content.

## Images and privacy

`portfolio-media` is a private bucket. Only the owner can upload and remove files within their UUID folder. Storage policies allow public reads only for objects referenced by published entries; owner reads also allow draft previews. `/media/...` proxies downloads on the server using the requesting session and the same RLS rules, with `private, no-store` headers. Image preview URLs contain object paths rather than long-lived signed tokens. Unpublishing removes anonymous access through this route. Previously downloaded images cannot be recalled.

Images entered as external URLs or existing files under `public/images/` are inherently public and should not contain confidential draft material. Use uploads for private draft covers.

## Tests

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The test suite checks content validation, migration preservation/idempotency, and PostgreSQL RLS with owner/non-owner/anonymous identities. The embedded PostgreSQL tests emulate the Supabase Auth/Storage schemas; they do not test the hosted Supabase Auth and Storage HTTP services. Before launch, verify real owner login, rejected non-owner access, draft privacy, image upload, publication, unpublication, and cross-tab version conflicts in a staging Supabase project.

`006_initial_content.sql` is retained for initial database setup and migration tests. The original TypeScript seed data and generator have been removed; live content is managed through the CMS. Back up Supabase to preserve changes made after the initial snapshot.

## Password recovery

The recovery email contains a link, not a replacement password. Use **Forgot your password?** at `/admin/login`, or visit `/admin/reset-password`.

In Supabase → Authentication → URL Configuration:

- Set Site URL to your deployed portfolio origin.
- Add your exact production callback URL, for example `https://YOUR-DOMAIN/auth/callback`, to Redirect URLs.
- For local development, also add `http://localhost:3000/auth/callback` (adjust the port if needed).

Request the reset from the app and open the newest email in the same browser/profile; the server-side PKCE flow uses a verifier cookie. `/auth/callback` verifies the code and owner identity, then opens `/admin/update-password`. Enter and confirm a new password (12–128 characters); after saving, sign in again with it. Requests use a generic response to avoid disclosing which emails have accounts.

Dashboard-generated legacy recovery links that redirect with a `#access_token=...&type=recovery` fragment are also handled: the app removes the fragment and exchanges it for an HttpOnly server session through a same-origin Server Action. Recovery fragments are not stored in local storage. Token-hash email templates can target `/auth/callback?token_hash={{ .TokenHash }}&type=recovery` as an alternative.

If the link opens your deployed website, the deployed app must include these recovery pages. If it is expired/already used or was requested in another browser, request a new link from the app. Do not share the recovery URL or its tokens.
