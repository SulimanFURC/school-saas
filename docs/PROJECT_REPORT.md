# School SaaS — Project Report (Executive Version)

This report reflects implemented functionality in `client/` and `server/` as of the latest RBAC rollout.

---

## 1) Executive Summary

School SaaS is a multi-tenant school management platform for school operations and platform-level administration.

- **Frontend:** Angular 19 standalone architecture
- **Backend:** Express 5 API with Sequelize 6
- **Database:** PostgreSQL
- **Isolation model:** strict tenant scoping using `tenant_id`
- **Access model:** role + feature + permission-based controls

Primary roles in active use:

- `super_admin`: platform-level control
- `admin`: full tenant administration
- `teacher`: teacher workflows and self-service
- `student`: student-facing exam workflows

---

## 2) Business Capability Coverage

### Platform (Super Admin)

- Tenant onboarding and lifecycle management
- Tenant feature toggle management
- Platform settings and tenant branding controls
- Audit-log visibility

### Tenant (School)

- Academic setup: classes, sections, academic years, subjects
- Student lifecycle: registration, listing, detail, edit, promotion
- Teacher lifecycle: CRUD, assignment flows, self profile
- Finance: fee collection and expense tracking
- Exams: grading schemes, exam setup, timetable, marks, recheck flows
- Reporting: enrollment, fee, defaulter, expense, and related operational reports
- Settings: school profile, academic, notifications, password, roles & permissions

### Partial / Placeholder Areas

- Attendance is currently partial (placeholder/report stub level)
- Library, transport, and standalone results are in catalog scope but not fully delivered as modules

---

## 3) Architecture Snapshot

### Frontend

- Standalone components with lazy route loading in `app.routes.ts`
- Role and feature guards across protected pages
- API authorization via token + tenant header interceptor
- Permission-awareness via `authorization.service.ts` and `/roles/me`

### Backend

- `POST /auth/signup` mounted before tenant resolution middleware
- Tenant context resolved centrally, then protected route stack enforced
- Key route groups include `/auth`, `/modules`, `/roles`, `/super-admin`, `/dashboard`, `/settings`, `/reports`
- Module APIs mounted for classes, students, teachers, exams, notifications, fees, and expenses

### Security & Access Pattern

- Tenant context (`tenantMiddleware`) -> authentication (`authMiddleware`) -> access checks (`authorize(...)` and `requirePermission(...)`) -> feature checks (`checkFeature(...)`)
- All tenant business data is scoped by `tenant_id`
- `super_admin` cross-tenant operations supported through `x-tenant-id`

---

## 4) Data Model and API Scope

Core implemented model domains:

- Tenant/auth domain (`tenants`, `users`, token models)
- Feature/branding domain (`modules`, `tenant_modules`, `tenant_branding`)
- Academic domain (`classes`, `sections`, `academic_years`, `subjects`)
- Student domain (profile, enrollment, guardian, documents, promotions)
- Teacher domain (profile + academic assignments)
- Finance domain (fee collections, expenses)
- Exam domain (exam lifecycle, timetable, marks, grading, rechecks)
- Notification/settings domain
- Audit logging

Tenant RBAC data foundation:

- `tenant_roles`
- `tenant_permissions`
- `tenant_role_permissions`
- `user_tenant_roles`

Representative access APIs:

- `GET /modules`
- `GET /tenant-branding`
- `GET /roles/me`
- `/roles/*` (role management, permission matrix, assignment flows)
- `/super-admin/*` (platform operations)

---

## 5) Recent Delivered Changes

### A) Tenant Status Enforcement in Authentication

- Login now blocks `inactive` and `pending` tenants with explicit messages
- Refresh rotation is rejected for non-active tenants and relevant tokens are revoked
- Protected APIs enforce active-tenant checks, preventing stale access
- Super-admin tenant status downgrade invalidates sessions by revoking refresh tokens and bumping user `token_version`

### B) Tenant RBAC Rollout

- Added migration `20260507131500-create-tenant-rbac-tables.js`
- Seeded system roles (`admin`, `teacher`, `student`, `accountant`, `transport_manager`, `receptionist`)
- Seeded permission catalog using `module.action` codes
- Seeded initial role-permission mappings and tenant user-role links
- Added role access resolution service and `requirePermission(...)` middleware
- Added `/roles` APIs for role CRUD, permission assignment, user-role assignment, and current-user permission snapshot
- Added tenant settings UI for role and permission administration

### C) Super Admin Dialog UX Consistency

- Tenant create/edit flows moved from drawer pattern to centered modal dialogs
- Drawer-specific styles removed
- Dialog body constraints relaxed to reduce nested-scroll UX issues

---

## 6) Delivery Risks / Remaining Gaps

- Attendance, library, transport, and standalone results remain incomplete
- Automated test coverage still trails implemented module breadth
- Production hardening still requires stricter CORS policy and deployment environment finalization

---

## 7) Environment & Runbook Reference

- Backend environment template: `server/.env.example`
- Client environment files:
  - `client/src/environments/environment.ts`
  - `client/src/environments/environment.development.ts`
- Root setup reference: `README.md`

---

*End of report.*
