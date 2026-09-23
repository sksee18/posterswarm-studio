# Posterswarm Studio contributor notes

This is the free, open source, local-only edition of Posterswarm.

## Product boundary

- Keep it single-user and local-first.
- Do not add accounts, hosted sync, billing, scheduling, social publishing, analytics, or Posterswarm-operated services.
- Store structured data in the embedded PGlite database and media in `public/uploads`.
- AI access uses a key supplied by the user in Settings.
- Never commit `.data`, `public/uploads`, environment files, credentials, or user content.

## Next.js

This version of Next.js has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing framework APIs, conventions, or file structure. Follow deprecation notices.

`@electric-sql/pglite` and `@resvg/resvg-js` must remain in `serverExternalPackages` in `next.config.ts`.

PGlite is single-process. Never open `.data/pglite` from another process while the development or production server is running.

## Product language and style

- Product name and metadata live in `src/lib/brand.ts`.
- Use the bee, hive, and honeycomb identity with electric orange on graphite.
- Never use an em dash or en dash in code, comments, UI text, documentation, or commits.
- Prefer the smallest solution that works. Avoid speculative abstractions and hosted dependencies.

## Verification

Run `npm run lint`, `npm test`, and `npm run build` before submitting a change. Run `npm run db:push` after schema changes.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
