# School SaaS (monorepo)

- **`client/`** — Angular 19 (standalone) + Bootstrap 5 + PrimeNG
- **`server/`** — Express + Sequelize + PostgreSQL
- **`docs/`** — project documentation

## Prerequisites

- Node.js and npm
- PostgreSQL (create database matching `DB_NAME` in `server/.env`)

## Backend

```bash
cd server
cp .env.example .env   # edit credentials
npm install
npm run dev
```

API: `http://localhost:5000` (default). The server starts even if PostgreSQL is not running; you will see `DB error` in the console until the database is available and credentials in `.env` are correct.
Normal startup does not run seed/backfill jobs.

Bootstrap seed/backfill is explicit:

```bash
cd server
npm run seed:bootstrap
```

Run this only when you intentionally want to ensure platform super-admin, module catalog, tenant module rows, and tenant academic-year rows.

## Frontend

```bash
cd client
npm install
npm start
```

App: `http://127.0.0.1:4300` (default dev port; see `angular.json` → `serve.options` if you need to change it). On some Windows setups port `4200` can fail with `EACCES`; use another port via `ng serve --port <port>`.

The app calls the API on startup and logs the response in the browser console when the backend is reachable.

## Environment

Copy `server/.env.example` to `server/.env` and set `DB_*` and `JWT_SECRET`.
