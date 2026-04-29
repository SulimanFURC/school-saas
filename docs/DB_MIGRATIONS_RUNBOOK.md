# Database Migrations Runbook

This project now uses explicit Sequelize migrations for production-safe schema evolution.

## Why this exists

- Runtime `sequelize.sync({ alter: true })` is unsafe in production.
- Schema changes must be reviewed, versioned, and applied intentionally.

## Commands

Run from `server/`:

- `npm run db:migrate` - apply pending migrations
- `npm run db:migrate:undo` - roll back last migration
- `npm run db:migrate:status` - show migration state

## Deployment checklist

1. Take a database backup/snapshot.
2. Set DB env vars on target environment (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`).
3. Run `npm ci` in `server/`.
4. Run `npm run db:migrate`.
5. Start app with `npm start`.
6. Verify health endpoints and critical reports.

## Staging validation checklist

Use `EXPLAIN ANALYZE` for high-frequency tenant-scoped queries before and after migrations:

- fee daily/range summaries on `fee_collections` by `tenant_id` and `collection_date`
- fee history/defaulters by `tenant_id` + `student_id`
- enrollment list/summary by `tenant_id`, `academic_year_id`, and `status`

Expected outcome:

- query plans show index scans on new composite indexes
- no full table scans on report endpoints at normal selectivity

## Safety notes

- Do not re-introduce runtime schema sync in startup code.
- Add all future schema changes as migration files under `server/migrations/`.
- Prefer additive changes and data backfills before adding strict constraints.
