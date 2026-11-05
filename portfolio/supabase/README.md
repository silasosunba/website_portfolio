# Portfolio content management

News, Projects, Articles, and Books live in separate Supabase tables. Public pages render on the Next.js server; the browser does not query Supabase. The homepage biography, About story, research publications, documents, and visual design remain repository-managed.

## Hosting

Deploy from GitHub to **Cloudflare Workers** with the OpenNext adapter. Set the dashboard Root directory to `portfolio`, Build command to `npm run build:cloudflare`, and Deploy command to `npm run deploy:cloudflare`. The Worker name is `silas-portfolio`. See the [complete Workers deployment settings](../../README.md#cloudflare-dashboard-github-to-workers) for bindings, Node version, environment handling, and verification.

SSR, authentication, Server Actions, publishing, and private media run on the Worker. Static assets in `public/` remain included. The repository's `ci.yml` validates both the Next.js build and the Worker bundle without deploying. Keep the existing Supabase schema and data when changing hosts.

## Environment

Set these in both Workers Builds **Build variables and secrets** and the Worker runtime **Variables & Secrets**, and in `portfolio/.env.local` for local development. Values below are placeholders only:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

Set `NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN` in build variables for production metadata. `NODE_VERSION=22` selects the Node build environment. See the root README for the distinction between build and runtime variables.

No service-role key, database password, or secret key is required by this application. Only a publishable key is accepted. Sessions use Secure (production), HttpOnly, SameSite=Lax cookies. The browser sends forms and Server Actions to the Next.js server. The middleware refreshes sessions only for admin and media requests. Every read of the dashboard and every write/upload independently verifies the user with Supabase Auth and checks their exact ID against `portfolio_owner`.

## Database installation / migration

Back up your existing database before applying schema changes. In the Supabase SQL Editor:

1. Run `005_portfolio_cms.sql`. It is self-contained for a fresh project and also supports databases created by migrations 001–004. It creates four tables, private image storage, owner policies, version triggers, and supporting indexes. Existing Books rows are copied with their IDs, notes, reading states, order, and publication status. The old `portfolio_content` table is retained but API grants are revoked to prevent split writes.
2. For a new database, run `006_initial_content.sql`. It contains a retained snapshot of 20 News entries, 8 Projects, and 1 Medium article. Matching seed keys are never overwritten. This is initial migration content, not a public-page fallback or a backup of subsequent CMS edits. Do not re-run it to update content after you begin managing entries; a deleted seeded entry could be re-created. Manage ongoing content through `/admin`.
3. Run `007_content_ordering.sql` to enable atomic drag-to-reorder, insertion, and deletion with automatic numbering. Do not re-run the seed on existing installations.
4. Run `008_in_app_writings.sql` to enable Medium and in-app publishing. Existing writings remain Medium entries. It adds structured article bodies, unique URL slugs, and publication-aware access to inline images.
5. Run `009_visual_writing_formatting.sql` to preserve visual-editor formatting in headings, quotes, and list items. Existing plain-text blocks remain valid.
6. Run `010_github_username.sql` to update existing CMS GitHub links from the previous username to `silasosunba`. This migration preserves repository paths, query strings, publication states, and ordering. Updating the seed alone does not update existing database rows.
7. If you already have a row in `portfolio_owner`, keep it. Otherwise create your email/password account under Authentication → Users, confirm it, and register its UUID:

```sql
insert into public.portfolio_owner (singleton, user_id)
values (true, 'YOUR_AUTH_USER_UUID');
```

The table permits exactly one owner. The application cannot add or change owners. No role hierarchy or visitor accounts are implemented. Under Authentication settings, disable new-user sign-ups. Enable MFA on your owner account through your Supabase setup if required; the application currently uses password sign-in.

Migration 005 never deletes legacy data. External HTTP image/book links from legacy records are cleared because the site accepts HTTPS links. Existing valid HTTPS links and local `/images/` paths are preserved. The migration enforces the editor's field limits, so exceptionally long legacy book notes (>30,000 characters) must be addressed before migration. SQL files are not applied automatically; this checkout has no management/database credentials.

## Owner workflow

Open `/admin` and sign in at `/admin/login`. Choose News, Projects, Articles, or Books.

- Save as a draft or publish. Uncheck Published and save to unpublish.
- News, Projects, and Books: drag an entry by its grip to reorder it (mouse or touch). Use the up/down buttons or focus the grip and press arrow keys for keyboard access. Drop to save automatically; Escape cancels an active drag.
- Writings are always newest first by publication date in both the dashboard and public listing. Creation time and ID break same-date ties. Manual reordering controls are hidden for Writings.
- New entries in manually ordered sections default to position 0. Choose an insertion position in the editor if needed; an occupied position shifts following entries down. Saving, reordering, and deleting renumber the section from 0 without gaps. Drafts participate in the same order; public pages show only published entries.
- Migration 007 performs each mutation and all position updates in a single PostgreSQL transaction. It verifies owner access, retains RLS, serializes writes per section, and checks the complete list of IDs/versions to reject stale tabs. The dashboard receives the updated list and versions after every successful mutation. A failed transaction leaves the database unchanged; a lost response needs a reload before retrying.
- News uses paragraphs of text/link segments, with optional bold and italics. It is stored as validated versioned JSON and rendered as React elements, never raw HTML.
- Writings offer **Publish location → On Medium / On this website**. Medium entries retain their external URL and manual reading time. In-app writings use an article URL slug and visual text editor (select text to apply bold/italics/links, headings, quotes, lists, and uploaded images; undo/redo and keyboard shortcuts are available). Reading time is calculated at 200 words per minute.
- Leave the slug blank to generate it from the title when first saving. Saved slugs remain stable when titles change; editing a slug changes the public URL and does not create a redirect for old links. Slugs must be unique, including drafts. Preview shows the complete in-app article without publishing it.
- Public in-app articles render server-side at `/articles/[slug]` using a published-only anonymous query. Unpublished or deleted articles return a not-found page, even when the owner visits the public URL. Use admin Preview for drafts. Publication changes revalidate the listing and article routes.
- Switching an entry to Medium clears its saved in-app body and slug; retain a copy before changing an existing in-app writing to Medium. Switching to in-app requires an article body before publication.
- Upload a PNG, JPEG, WebP, or GIF up to 5 MB. New images are upload-only; existing covers may be retained. Uploaded media bytes and MIME types are checked on the server. SVG and HTML uploads are rejected.
- Preview uses the same list components as the public pages. Entries require valid fields before previewing; drafts can omit project/article covers until publication.
- Edits remain in the form after a failed save. A version check prevents overwriting a record changed in another tab. Reload the dashboard and select the latest record after a conflict.
- Deletion requires confirmation. Deleting an entry does not delete its image, which may be shared by another entry. Unattached uploads remain private. You can remove unused objects through the Supabase Storage dashboard.

New content appears without code changes or a deployment. Public lists query Supabase on every server render using an anonymous client and no persistent content cache. Successful writes revalidate the affected routes. Changes made from another deployment or directly in Supabase are visible on the next fresh page request when both environments use the same Supabase project. Refresh an already-open public page to see updates; pages do not subscribe to live changes. Public reads never use your owner session. Failed queries show a small unavailable state and are not replaced with old static content.

## Images and privacy

`portfolio-media` is a private bucket. Only the owner can upload and remove files within their UUID folder. Storage policies allow public reads only for objects referenced by published entries (including image blocks in published in-app writings); owner reads also allow draft previews. `/media/...` proxies downloads on the server using the requesting session and the same RLS rules, with `private, no-store` headers. Image preview URLs contain object paths rather than long-lived signed tokens. Unpublishing removes anonymous access through this route. Previously downloaded images cannot be recalled.

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

## Enabling in-app writings on an existing deployment

Apply `008_in_app_writings.sql` followed by `009_visual_writing_formatting.sql` in the connected Supabase project's SQL Editor after migration 007, then deploy the updated application and refresh `/admin`. The migration does not publish drafts or replace existing writings. Do not re-run migration 005 after 008: migration 005 installs the original cover-only Storage policy; if accidentally re-run, reapply 008 then 009 to restore inline-image access and formatting validation. No new environment variables are needed. The visual editor uses Tiptap, which is included in the package manifest and lockfile.

Verify a Medium entry still opens Medium; save and preview an in-app draft; confirm its public URL and images are unavailable anonymously; publish and read it; then unpublish and confirm access is removed. Article text is structured JSON rendered with React elements, never unrestricted HTML. Each writing supports up to 100 blocks and 100,000 text characters. Body images require descriptions before publication and share the existing private upload bucket. Writings listings fetch summaries only; full bodies load on the article page.

The visual editor opens immediately when **On this website** is selected. Type directly into the writing area; select words and click Bold, Italic, or Link. Toolbar buttons preserve the text selection. Use Undo/Redo or standard keyboard shortcuts, and Preview to inspect the final article. Uploaded images are inserted after the current text block; select an image to edit its accessible description and caption. External image pastes are rejected in favor of the existing private upload flow. Simple lists and quotes are supported; nested structures show an actionable error and block saving rather than silently dropping text. Server rendering uses validated structured JSON, not editor HTML. Migration 009 retains compatibility with earlier article bodies.
