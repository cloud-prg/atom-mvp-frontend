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
VITE_API_BASE_URL=https://api.jiujiuwarehouse.com
VITE_DEMO_MODE=false
```

Vite reads `VITE_*` values when the dev server starts or when the app is built. Restart `npm run dev` after changing `.env.local`, and rebuild after changing production env values.

## Checks

```bash
npm run typecheck
npm run test
npm run build
```

## Demo Mode

With `VITE_DEMO_MODE=true` or no `VITE_API_BASE_URL`, the app uses a local mock data layer. Login, conversations, streaming, search cards, retry states, and refresh recovery all work without a backend.
