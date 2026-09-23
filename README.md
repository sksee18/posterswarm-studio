# Posterswarm Studio

Posterswarm Studio is a free, open source slideshow maker that runs on your computer. It turns a script into vertical image slides, helps you find backgrounds, stores reusable templates, and exports every finished slideshow as a ZIP.

This repository is the lightweight, local edition of Posterswarm. It does not include accounts, cloud sync, scheduling, social publishing, analytics, or billing.

## What it includes

- Manual and AI-assisted slideshow creation
- Batch campaign generation
- Local image uploads
- Reusable visual templates and text presets
- A local slideshow library with editing, duplication, tags, and saved slides
- PNG rendering and downloadable ZIP exports
- A self-provided AI API key, encrypted on disk with a machine-local secret
- Local storage through PGlite and the filesystem
- 16 interface languages

## Requirements

- Node.js 20.9 or newer
- npm

## Quick start

```bash
git clone https://github.com/sksee18/posterswarm-studio.git
cd posterswarm-studio
npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then visit Settings to add your AI API key.

No environment variables or external database are required.

## AI configuration

Posterswarm Studio talks to an OpenAI Responses API-compatible endpoint. In Settings, provide:

- Your API key
- The API base URL, such as `https://api.openai.com/v1`
- The model name available from that provider

Compatible gateways can be used by changing the base URL and model. Your key is encrypted before it is written to the local database. The encryption secret is generated automatically in `.data/secret` and never needs to be pasted into an environment file.

## Local data

All persistent data stays inside the repository folder:

- `.data/pglite` contains the database
- `.data/secret` contains the local encryption secret
- `public/uploads` contains imported and rendered images

These paths are ignored by Git. Back up both `.data` and `public/uploads` together if you want to move your library to another computer. To reset the app, stop the development server and remove those two folders.

PGlite supports one app process at a time. Stop the development server before running database maintenance or opening the same database from another process.

## Commands

```bash
npm run dev       # Start the local development server
npm run build     # Create a production build
npm start         # Run the production build
npm run db:push   # Create or update the local database schema
npm test          # Run the self-check suite
npm run lint      # Check the source
```

## Contributing

Issues and pull requests are welcome. Keep the local edition focused: features should work without accounts, hosted services, or a Posterswarm-operated backend.

Before opening a pull request, run:

```bash
npm run lint
npm test
npm run build
```

## License

Licensed under the [Apache License 2.0](LICENSE).
