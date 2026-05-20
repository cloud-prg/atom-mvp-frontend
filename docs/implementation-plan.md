# Atom MVP Frontend Implementation Plan

Goal: build a minimum viable GPT-like workbench frontend that can run independently in demo mode and later connect to the FastAPI backend through `VITE_API_BASE_URL`.

Architecture:

- React + Vite + TypeScript.
- React Router v7 for `/login`, `/chat`, and `/chat/:conversationId`.
- Ant Design with neutral Atoms-inspired theme tokens.
- CSS Modules for component-level styling.
- Demo API adapter backed by localStorage for login, conversations, messages, drafts, mock search, and mock streaming.
- Real API adapter boundary prepared for later backend connection.

Verification:

- `npm run typecheck`
- `npm run build`
- `npm run test`

