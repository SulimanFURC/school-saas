# PrimeNG-First Design System Guidelines

## Scope
- PrimeNG is the default component library for form controls, tables, dialogs, messages, and menus.
- Bootstrap is limited to layout and spacing utilities (`d-*`, `gap-*`, `row/col`, `mt-*`, etc.).

## Required Building Blocks
- **Forms:** use `app-form-shell` and `app-form-section` for consistent loading, section titles, and form grouping.
- **Tables:** use paginated responses and `app-table-pagination-footer` for all list screens.
- **Date helpers:** use shared utilities from `client/src/app/shared/utils/date-ymd.ts`; avoid per-feature date parsing helpers.

## Table Contract
- Query model: `page`, `limit`, optional `sortBy`, `sortDir`, `q`, `filters`.
- Response model: `{ data, total, page, limit, totalPages }`.
- If backend returns non-paginated payloads, normalize them in service layer before UI usage.

## Guardrails
- Do not create new ad-hoc table pagination controls in feature modules.
- Do not duplicate `parseYmd` / `formatYmd` utilities in components.
- Do not add feature-specific `::ng-deep` row-action danger styles; use shared classes/tokens.

## Migration Checklist (Per Screen)
- Uses shared form/table primitives where applicable.
- Pagination exists and page transitions correctly.
- Loading/empty/error states remain functional after migration.
- No duplicated local utility for date formatting or validation messages.
