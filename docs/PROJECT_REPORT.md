# School SaaS — Project Report (Implementation-Aligned)

Updated to match the current code in `client/` and `server/`.  
Removed outdated/unused claims and kept only implemented features or clearly marked placeholders.

---

## 1) Project Overview

School SaaS is a multi-tenant school management platform:

- **Frontend:** Angular 19 standalone app (`client/`)
- **Backend:** Node.js + Express 5 API (`server/`)
- **Database:** PostgreSQL via Sequelize 6
- **Isolation model:** tenant-level row isolation using `tenant_id`

### Primary user roles

- **super_admin**: platform-level tenant/module/branding management
- **admin**: school-level academic and operations management
- **teacher**: self-profile + teacher exam workflows
- **student**: student exam/result/recheck workflows

---

## 2) Stack Summary

### Frontend (`client/package.json`)

- Angular 19 (`@angular/*`)
- PrimeNG 19 + PrimeIcons + `@primeuix/themes`
- Bootstrap 5 + Bootstrap Icons + Popper
- RxJS, Zone.js
- Standalone components + route lazy loading
- Guards and interceptor based access control

### Backend (`server/package.json`)

- Express 5 (`express`)
- Sequelize 6 + `pg`
- JWT auth (`jsonwebtoken`)
- Validation with Zod
- Rate limiting (`express-rate-limit`)
- Uploads (`multer`)
- Image processing (`sharp`)
- Logging (`pino`)

### Testing/tooling

- Client tests: Karma + Jasmine
- Server tests: Node test runner (`node --test`)
- DB migrations: `sequelize-cli` (`db:migrate`, `db:migrate:undo`, `db:migrate:status`)

---

## 3) Active Modules (Implemented)

### Platform / Super Admin

- Super-admin dashboard
- Tenant list/create
- Tenant module toggles
- Platform settings
- Tenant branding settings and logo upload

### School (Tenant) Modules

- Dashboard (`/home`) with role-based data
- Classes, sections, academic years
- Subjects
- Students (register, list, detail, edit, promote)
- Teachers (admin CRUD + assignments + self profile/dashboard)
- Fees
- Expenses
- Exams (grading schemes, exam lifecycle, timetable, marks, PDF cards, rechecks)
- Reports (enrollment, fee collection, defaulters, expenses, exam result, teacher assignment)
- Settings (school profile, academic snippet, notifications, password)
- Notifications

### Placeholder / not full business implementation

- **Attendance**: currently placeholder route/UI and attendance report stub
- **Library / Transport / Results (standalone)**: in module catalog but no full frontend module implementation

---

## 4) Frontend Architecture (`client/src/app`)

### Routing and layouts

- `app.routes.ts` uses standalone lazy-loaded components
- Main shells:
  - `layout/main-layout`
  - `layout/super-admin-layout`
- Public auth routes: login, signup, forgot password, reset password
- Dedicated `/404` route and wildcard redirect

### Guards used

- `authGuard`
- `guestGuard`
- `superAdminGuard`
- `featureGuard`
- role guards (`adminRoleGuard`, `teacherRoleGuard`, `studentRoleGuard`)
- settings guards (`settingsTenantAdminGuard`, `settingsNotificationsGuard`)

### Core services

- `auth.service.ts`
- `feature.service.ts`
- `branding.service.ts`
- `student.service.ts`
- `teacher.service.ts`
- `exam.service.ts`
- `fee.service.ts`
- `settings.service.ts`
- `report.service.ts`
- `dashboard.service.ts`
- `notification.service.ts`
- `theme.service.ts`

---

## 5) Backend Architecture (`server/src`)

### App composition (`server/src/index.js`)

- `POST /auth/signup` mounted **before** tenant middleware
- `tenantMiddleware` applied globally after signup route
- Route mounts include:
  - `/auth`
  - `/modules`
  - `/super-admin`
  - `/dashboard`
  - `/settings`
  - `/reports`
  - root-mounted module routers for classes/subjects/students/teachers/exams/notifications
  - `/fees`
  - `/expenses`

### Middleware pattern

- `tenantMiddleware` -> `authMiddleware` -> `authorize(...)` -> `checkFeature(...)` as needed
- Validation middleware via Zod schemas in module routes
- Global error middleware returns safe internal errors

---

## 6) API Surface (High-Level)

### Auth

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/logout`

### Core tenant/super-admin

- `GET /modules`
- `GET /tenant-branding`
- `/super-admin/*` for tenant management, platform settings, and branding

### Academic + operations

- Classes/sections/academic years
- Subjects
- Students + enrollments
- Teachers + assignments + self endpoints
- Fees and expenses
- Exams (admin/teacher/student flows)
- Notifications
- Reports
- Dashboard
- Settings

---

## 7) Data Model Coverage

Major implemented model groups include:

- Tenant/user/auth: `tenants`, `users`, auth token-related models
- Feature/branding: `modules`, `tenant_modules`, `tenant_branding`
- Academic: `classes`, `sections`, `academic_years`, `subjects`
- Students: student profile + enrollments + guardians + docs + promotions
- Teachers: teacher profile + academic assignments
- Finance: fee collections + expenses
- Exams: exams, classes, timetable, marks, audits, grading, rechecks
- Notifications and settings models
- Audit log

---

## 8) Multi-Tenant and Access Control

- Tenant context resolved in `tenant.middleware.js`
- Tenant data isolation done by filtering with `tenant_id`
- `super_admin` can operate cross-tenant using `x-tenant-id`
- Frontend interceptor injects auth token and tenant header
- Feature gating is enforced on both backend (`checkFeature`) and frontend (`featureGuard`)

---

## 9) Environment Configuration

### Server (`server/.env.example`)

- `PORT`
- `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_HOST`
- `JWT_SECRET`
- `JSON_BODY_LIMIT`
- `SUPER_ADMIN_PASSWORD`
- `STUDENT_DEFAULT_PASSWORD`
- rate-limit env vars (login/signup and related)

### Client

- `client/src/environments/environment.ts`
- `client/src/environments/environment.development.ts`

---

## 10) Current Gaps / Planned Items

- Attendance remains partial (placeholder + report stub)
- Catalog keys exist for library/transport/results without full module UI/API coverage
- Test coverage is still limited compared to module breadth

---

## 11) Recent Implemented Updates

### Tenant status enforcement in auth flow

- Tenant `inactive` and `pending` states now block login with explicit user-facing messages.
- Refresh token rotation is rejected for non-active tenants, with refresh token revocation.
- Protected APIs enforce tenant active status in auth middleware, cutting off existing sessions when tenant status is no longer active.
- Super-admin tenant status change from `active` to `inactive/pending` now invalidates all tenant sessions by:
  - revoking active refresh tokens
  - incrementing `token_version` for tenant users

### Super admin tenant dialog consistency

- Tenant **Edit** UI was migrated from PrimeNG drawer to centered PrimeNG modal dialog.
- Tenant **Create** UI was migrated from PrimeNG drawer to centered PrimeNG modal dialog.
- Drawer-specific code/styles for these dialogs were removed in favor of modal-specific styles.
- Dialog body height constraints were relaxed (no forced min/max height on `.ct-dialog__body`) to avoid nested scroll behavior.

---

*End of report.*
