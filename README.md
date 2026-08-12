# AKWABA 001 — Project (combined)

This zip merges the fixed backend and the new React frontend into one
project folder.

```
akwaba-001/
  backend/            Node/Express API (server.js, routes/, model/, middleware/, utils/)
  frontend/           React/Vite frontend (Figma redesign) — the one to deploy
```

## Setup

**Backend**
```bash
cd backend
npm install
npm start          # or: npm run dev (auto-restart)
```
`.env` contains live credentials (Mongo URI, JWT secret, admin key,
Paystack key). Never commit it, zip it, paste it into chat, or share it
by any channel other than a secrets manager — if a credential in it is
ever exposed that way, treat it as burned and rotate it immediately
(Mongo: Atlas → Database Access; JWT_SECRET/ADMIN_API_KEY: generate new
random values with `openssl rand -hex 32` and redeploy).

**Frontend**
```bash
cd frontend
npm install
npm run dev         # local development
npm run build        # production build → frontend/dist
```

## Before deploying

Add the new frontend's deployed URL to `ALLOWED_ORIGINS` in `backend/.env`
(or wherever it's set in production) — the backend's CORS check will
otherwise reject requests from it.

**`NODE_ENV=production` must be set on the deployed backend (e.g. Render).**
Auth (participant JWT, admin session, CSRF token) is stored in cookies —
see `backend/utils/cookies.js`. Frontend and backend are on different
domains, so these are cross-site cookies, which browsers only accept over
HTTPS with `SameSite=None; Secure`. That flag is what switches the cookies
from the dev-friendly `SameSite=Lax`/non-Secure setting to
`SameSite=None; Secure`. If `NODE_ENV` isn't `production`, login will
appear to succeed (the cookie gets set) but the browser will silently
drop it on the next cross-site request — the dashboard/admin panel will
look broken with no obvious error. Render sets this automatically for most
services, but double-check it after deploying.
