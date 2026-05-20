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
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Checks

```bash
npm run typecheck
npm run test
npm run build
```

## Demo Mode

With `VITE_DEMO_MODE=true` or no `VITE_API_BASE_URL`, the app uses a local mock data layer. Login, conversations, streaming, search cards, retry states, and refresh recovery all work without a backend.

