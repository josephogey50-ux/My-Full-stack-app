# AKWABA 001 — Frontend (React/Vite rebuild)

This is a full frontend rewrite of the AKWABA 001 (Nigerian Passport Travels) site,
carrying over the visual language from the approved Figma design onto the site's
**real, live content and registration flow**. The Node/Express backend
(`server.js` and everything in `routes/`) is unchanged — this project only
replaces `index.html` / `dashboard.html` / `app.js` / `style.css`.

## Stack

- React 19 + TypeScript + Vite
- React Router (client-side routing: `/`, `/dashboard`, `/admin`)
- Tailwind CSS v4, themed with the Figma design's color/type tokens

## Project structure

```
src/
  lib/api.ts          Single source of truth for every backend call
  components/          Nav, Hero, TripInfo, Pricing, RegisterPanel, Footer, Toast
  pages/
    Landing.tsx         Marketing site + registration + login (was index.html)
    Dashboard.tsx        Participant dashboard (was dashboard.html)
    Admin.tsx            NEW — organizer panel (the old admin API had no UI)
  App.tsx               Route definitions
```

## What was preserved exactly

- All registration form fields, validation, and the 3-step flow
  (Profile → Logistics → Checkout) matching `routes/register.js`.
- Real bank transfer details, WhatsApp contact number, document types, and
  the two real pricing plans (Full Payment ₦385,000 / Installment ₦100,000
  deposit) — **not** the placeholder itinerary/pricing content from the
  Figma mockup.
- The rotating hero taglines from the current site.
- Local draft autosave for in-progress registrations (so a refresh doesn't
  lose progress).
- The Paystack payment flow, including the `?reference=` redirect handling
  on the dashboard.

## What's new

- **Admin panel (`/admin`)** — the backend already had `routes/admin.js`
  (stats, search, payment confirmation) but no UI ever existed for it; it
  was presumably operated via Postman/curl. This adds a real interface:
  key-gated login, trip stats, a searchable/filterable/paginated registrant
  table, and a per-registrant drawer to view receipts and update payment
  status.
- **Fixed receipt viewing.** The previous frontend linked directly to
  `/api/participant/me/receipt`, which requires a bearer token the browser
  never sent on a plain link click — that link would have always 401'd.
  The new version fetches the receipt with the auth header and opens it as
  a blob, both for participants and for admins.
- Registration PIN values are no longer written to `localStorage` in the
  autosaved draft (previously the whole form, including the 4-digit PIN,
  was persisted in plaintext local storage). Everything else in the draft
  still autosaves as before.

## Running locally

```bash
npm install
npm run dev
```

The app talks to `http://localhost:5000` when run from `localhost`, and to
`https://akwaba-back-end.onrender.com` otherwise — same logic the old
`app.js` used. Change `API_BASE` in `src/lib/api.ts` if either URL changes.

## Building for production

```bash
npm run build
```

Outputs static files to `dist/` — deploy this anywhere that serves static
sites (Vercel, Netlify, Render static site, S3+CloudFront, etc.), same as
the old `index.html`/`dashboard.html` were served.

## Backend change required before going live

The backend's CORS allow-list (`ALLOWED_ORIGINS` env var) currently allows
whatever origin the old static site was served from. Add the new frontend's
deployed origin to that list, or requests will be rejected by `cors()` in
`server.js`. No other backend change is needed — every endpoint this app
calls already exists.

## Admin access note

`/admin` uses the same shared `x-admin-key` secret the backend already
expects (`ADMIN_API_KEY`). The key is kept in `sessionStorage` only (cleared
when the tab closes) and is never written to `localStorage` or logged. This
mirrors the backend's existing "shared secret for a small number of
organizers" design — if the organizer list grows, the backend's
`requireAdmin` middleware (in `middleware/auth.js`) is the place to swap in
real per-user accounts, and this panel already calls the API the same way a
future login form would.
