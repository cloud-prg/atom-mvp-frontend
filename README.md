# Atom MVP Frontend

React MVP for the Atom AI workbench.

## Stack

- React + Vite + TypeScript
- React Router v7
- Ant Design
- CSS Modules
- Demo localStorage adapter

## Quick Start

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:5173`.

## Environment

Local development:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_DEMO_MODE=false
```

Production:

```env
VITE_API_BASE_URL=http://atom.jiujiuwarehouse.com
VITE_DEMO_MODE=false
```

Vite reads `VITE_*` values when the dev server starts or when the app is built. Restart `npm run dev` after changing `.env.local`, and rebuild after changing production env values.

## Docker Image

The Docker image defaults to `linux/amd64` for deployment on x86_64 Linux servers:

```bash
docker build --platform linux/amd64 -t atom-mvp-frontend:amd64 .
```

Production build arguments:

```bash
docker build --platform linux/amd64 \
  --build-arg IMAGE_PLATFORM=linux/amd64 \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  --build-arg VITE_DEMO_MODE=false \
  -t atom-mvp-frontend:amd64 .
```

Deployment configuration:

- `IMAGE_PLATFORM`: image platform, defaults to `linux/amd64`.
- `VITE_API_BASE_URL`: backend API URL baked into the frontend bundle at build time.
- `VITE_DEMO_MODE`: set to `false` for production API mode.

Keep real environment values, tokens, and passwords out of Git. Use `.env.local` or CI/server secrets for local and deployment-specific values. No registry credentials, SSH keys, API tokens, or account passwords are required in this repository.

## Checks

```bash
npm run typecheck
npm run test
npm run build
```

## Demo Mode

With `VITE_DEMO_MODE=true` or no `VITE_API_BASE_URL`, the app uses a local mock data layer. Login, conversations, streaming, search cards, retry states, and refresh recovery all work without a backend.
