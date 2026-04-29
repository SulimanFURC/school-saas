# PostgreSQL Row-Level Security (RLS) — rollout design

This document describes how to add **database-enforced tenant isolation** to School SaaS without changing the multi-tenant model (`tenant_id` on each row). **Policies are not enabled in the application yet**; this is the planned rollout.

## Goals

- Catch accidental cross-tenant reads/writes even if application code omits `tenant_id` in a `WHERE` clause.
- Keep the **platform** / `super_admin` story explicit (reserved `platform` tenant + `x-tenant-id` header).

## Session variable strategy

Per-request tenant context must align with `req.tenant.id` (UUID), not with client-supplied body/query `tenant_id`.

Recommended pattern when RLS is enabled:

1. At the start of each HTTP request (after `tenantMiddleware` resolves `req.tenant`), open a Sequelize **transaction** and run:

   ```sql
   SET LOCAL app.tenant_id = '<uuid>';
   ```

2. Run all queries for that request **inside the same transaction** so `SET LOCAL` applies.

**Connection pooling caveat:** `SET` on a pooled connection leaks to the next request unless it is **scoped to a transaction** (`SET LOCAL`) and the connection is not returned to the pool until the transaction ends. That implies:

- either one transaction per request for all routes once RLS is on, or
- middleware that borrows a dedicated connection for the request (heavier).

Today the app uses the default pool without request-scoped transactions; **do not** run a global `SET app.tenant_id` on connect without RLS policies and without per-request transactions.

## Baseline policy template (tenant-scoped tables)

For tables that **always** have `tenant_id UUID NOT NULL`:

```sql
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE your_table FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON your_table
  FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_insert ON your_table
  FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_update ON your_table
  FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_delete ON your_table
  FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));
```

Adjust naming and policy granularity (single policy vs split) to match your migration style.

## Global / catalog tables

Do **not** enable tenant RLS on:

- `modules` (global catalog)
- Any table without `tenant_id` that is intentionally shared

`tenants` is special: only super-admin tooling should manage it; use a separate **restricted DB role** or policies keyed off a role flag (e.g. `current_setting('app.is_platform', true)`), not a tenant UUID.

## Super admin bypass

Options (pick one for production):

1. **Separate database role** for the app user vs migration/admin user; policies use `CURRENT_USER` or membership in a `platform_admin` role to bypass or use a broader `USING (true)` policy only for that role.
2. **Second connection string** for platform-only jobs (not mixed in the school traffic pool).
3. **`SET LOCAL`** to a sentinel or skip flag only inside routes guarded by `authorize('super_admin')`, after strict JWT + role checks in the app — still risky if mis-scoped; prefer (1) or (2).

## Rollout checklist

1. Add versioned SQL migrations (replace reliance on `sync({ alter: true })` for production).
2. Enable RLS table-by-table in staging; run integration tests per module.
3. Introduce request-scoped `SET LOCAL app.tenant_id` in middleware + Sequelize transaction wrapper.
4. Verify **every** raw SQL (if any) sets context or uses tenant-safe views.
5. Load-test connection pool behavior under transactional middleware.
6. Document operational runbooks: how to run seeds/backfills with a role that can bypass RLS safely.

## Application-level scaffolding (optional future)

A feature-flagged hook may call `sequelize.transaction(async (t) => { await sequelize.query('SET LOCAL app.tenant_id = ...', { transaction: t }); ... })` for **all** tenant routes once RLS is enabled. Until then, **tenant isolation remains application-enforced** via `req.tenant.id` in controllers.
