# School SaaS — Project Details Report

Generated from a read-only scan of the current school-saas monorepo (Angular client, Express/Sequelize server, PostgreSQL).

---

## 1. Project Overview

**What is this application?**  
A **multi-tenant school management SaaS** monorepo: an **Angular 19** SPA (`client/`) talks to a **Node/Express** API (`server/`) backed by **PostgreSQL** via **Sequelize**. Tenants are schools (identified by **subdomain**). The platform supports **super admin** operations (tenant lifecycle, feature flags per tenant, branding) and school operations for **admin**, **teacher**, and **student** personas (academic structure, students, teachers, fees, exams, and notifications).

**What problem does it solve?**  
Centralizes **per-school isolation** (data + branding + feature toggles) on one stack, so multiple schools can use the same deployment with separate data and configurable modules (students, teachers, classes, fees, exams, etc.).

**End users / stakeholders**

| Stakeholder | Role in app | Notes |
|-------------|-------------|--------|
| **Super admin** | `super_admin` user on reserved tenant `platform` | Tenant CRUD, module toggles, branding upload, cross-tenant APIs via `x-tenant-id` |
| **School admin** | `admin` per tenant | Signup creates first admin; full academic + student APIs where authorized |
| **Teacher (portal user)** | `teacher` + `users.teacher_id` | Teacher self-profile and exam/marks workflows are implemented alongside admin-facing teacher management |
| **Student (portal user)** | `student` + `users.student_id` | Student exam views and recheck flows are implemented; student CRUD remains admin/super_admin only |
| **Developers / operators** | — | Run client + server per root `README.md` |

---

## 2. Tech Stack

### Frontend

| Area | Choice |
|------|--------|
| Framework | **Angular 19** (standalone components, `provideRouter`, lazy `loadComponent`) |
| UI | **Bootstrap 5.3**, **bootstrap-icons**, **@popperjs/core** |
| Animations | `@angular/platform-browser/animations/async` (`provideAnimationsAsync` in `client/src/app/app.config.ts`) |
| HTTP | `@angular/common/http` + functional interceptor |
| State | **Signals** (`AuthService`, `FeatureService`, `BrandingService`, layout signals) — **no NgRx** |
| Routing | `@angular/router` with guards |

**Note:** Root `README.md` says “Angular Material”; `client/package.json` does **not** include `@angular/material` — UI is Bootstrap-driven.

### Backend

| Area | Choice |
|------|--------|
| Runtime | **Node.js** (CommonJS, `"type": "commonjs"` in `server/package.json`) |
| Framework | **Express 5** (`express@^5.2.1`) |
| Middleware | `cors`, `express.json` (limit from `JSON_BODY_LIMIT` or default `50mb`), `multer` (logo uploads), static `/uploads` |
| Validation | **Ad hoc** in controllers (no Joi/Zod class-wide) |
| Password hashing | **bcrypt** |
| Images | **sharp** (student photo optimize to JPEG) |

### Database

| Area | Choice |
|------|--------|
| Engine | **PostgreSQL** (`pg` driver) |
| ORM | **Sequelize 6** |
| Migrations | **Not found** — schema evolves via **`sequelize.sync({ alter: true })`** on startup in `server/src/index.js` |

### Auth

| Area | Choice |
|------|--------|
| Strategy | **JWT** (`jsonwebtoken`), **Bearer** header |
| Token payload | `userId`, `tenant_id`, `role` (`server/src/modules/auth/auth.controller.js` `signToken`) |
| Expiry | `expiresIn: '1d'` |
| Refresh | **Not implemented** (no refresh endpoint) |

### DevOps / tooling

| Area | Choice |
|------|--------|
| Package managers | **npm** (separate `client/` and `server/`; **no root package.json** in repo) |
| Client build | **Angular CLI** / `@angular-devkit/build-angular` (`ng build`, output `dist/client` per `client/angular.json`) |
| Client dev server | **127.0.0.1:4300** default (`client/angular.json`) |
| Server dev | **nodemon** `npm run dev` |
| Linting | **ESLint/Prettier not found** in any `package.json` |
| Client tests | **Karma + Jasmine** (`ng test`) |
| Server tests | **Placeholder** — `"test": "echo \"Error: no test specified\" && exit 1"` |

---

## 3. Project Structure

**Monorepo layout (conceptual tree — high-signal paths):**

```text
school-saas/
├── README.md                 # Dev setup; mentions Angular Material (see §2)
├── docs/
│   ├── README.md             # Placeholder for future docs
│   └── PROJECT_REPORT.md     # This file
├── client/
│   ├── angular.json          # Build/serve (port 4300), styles, assets
│   ├── package.json
│   ├── tsconfig.json         # strict TS + angularCompilerOptions strictTemplates
│   ├── tsconfig.app.json
│   ├── tsconfig.spec.json
│   ├── public/               # Static assets (copied to build)
│   └── src/
│       ├── index.html
│       ├── main.ts
│       ├── styles.scss
│       ├── environments/
│       │   ├── environment.ts
│       │   └── environment.development.ts   # apiBaseUrl: http://localhost:5000
│       └── app/
│           ├── app.component.*
│           ├── app.config.ts                # router, HTTP + authInterceptor, APP_INITIALIZERs
│           ├── app.routes.ts                # Lazy routes, guards
│           ├── app-initializer.ts           # Feature flags after auth
│           ├── branding-initializer.ts
│           ├── config/
│           │   └── nav.config.ts            # Sidebar: module keys → paths
│           ├── guards/                      # auth, guest, superAdmin, feature
│           ├── interceptors/
│           │   └── auth.interceptor.ts      # Bearer + x-tenant-id (skips login/signup)
│           ├── layout/                      # main-layout, super-admin-layout, app-header-actions
│           ├── modules/
│           │   ├── auth/                    # login, signup
│           │   ├── home/
│           │   ├── classes/                 # class-list, class-form
│           │   ├── students/                # list, detail, register, promote
│           │   ├── teachers/                # list, form, detail, self-profile, dashboard
│           │   ├── fees/                    # fee collection + receipt
│           │   ├── expenses/                # expense list + receipt
│           │   ├── exams/                   # exams, grading, marks, student/teacher exam views
│           │   └── super-admin/             # tenants, features, branding settings
│           ├── shared/                      # placeholder-page, unauthorized, table-pagination-footer
│           ├── services/                    # api, auth, academic, student, teacher, fee, exam, feature, branding, theme, toast, notification
│           └── utils/                       # e.g. table-sort.ts
└── server/
    ├── .env.example          # PORT, DB_*, JWT_SECRET
    ├── package.json
    └── src/
        ├── index.js          # Express app, sync+seed chain, route mounting order
        ├── config/
        │   └── db.js         # Sequelize → Postgres
        ├── core/
        │   ├── middleware/   # tenant, auth, authorize, feature
        │   └── utils/
        │       └── subdomain.js
        ├── modules/
        │   ├── auth/
        │   ├── classes/      # models + academic.routes + academic.controller
        │   ├── module/
        │   ├── modules/      # tenant-visible module list
        │   ├── students/     # models, student.routes, student.controller
        │   ├── teachers/
        │   ├── fees/
        │   ├── expenses/
        │   ├── exams/
        │   ├── notifications/
        │   ├── subjects/
        │   ├── super-admin/
        │   ├── tenant/
        │   ├── tenant-branding/
        │   ├── tenant-module/
        │   └── users/
        └── seed/             # moduleSeed, canonicalClasses, academicYearsSeed
```

**Major folders**

- **`client/src/app/modules/*`** — Feature areas (auth, students, classes, super-admin).
- **`client/src/app/layout/*`** — Shells and header (theme toggle, notifications, logout).
- **`client/src/app/services/*`** — API access and cross-cutting UI state.
- **`server/src/modules/*`** — Domain models + route/controller pairs (no separate `services/` or `repositories/` layers).
- **`server/src/core/middleware/*`** — Tenant resolution, JWT, RBAC, feature flags.
- **`server/src/seed/*`** — Catalog modules, canonical classes, academic years backfill.

**Key config files**

| File | Role |
|------|------|
| `client/angular.json` | Application builder, `outputPath`, serve host/port, Karma test config |
| `client/tsconfig.json` | `strict`, ES2022, strict templates |
| `server/.env.example` | DB + JWT + PORT |
| `server/src/config/db.js` | Sequelize connection (`logging: false`) |

---

## 4. Database Design

**Tables / Sequelize models (physical `tableName`)**

| Table | Model file | Purpose |
|-------|------------|---------|
| `tenants` | `server/src/modules/tenant/tenant.model.js` | School org: `name`, `subdomain` (unique), `status`, `contact_email`, `phone`, `address` |
| `users` | `server/src/modules/users/user.model.js` | Login users: `tenant_id`, `name`, `email`, `username`, `password`, `role`, `status`, optional `student_id` and `teacher_id` |
| `modules` | `server/src/modules/module/module.model.js` | Global catalog: `name`, `key` (unique), `description`, `group` |
| `tenant_modules` | `server/src/modules/tenant-module/tenantModule.model.js` | Per-tenant toggle: `module_key`, `is_enabled` (unique on `tenant_id` + `module_key`) |
| `tenant_branding` | `server/src/modules/tenant-branding/tenantBranding.model.js` | `primary_color`, `secondary_color`, `logo_url` (one row per tenant) |
| `classes` | `server/src/modules/classes/class.model.js` | `name`, `display_order`, `code`, `is_active` |
| `sections` | `server/src/modules/classes/section.model.js` | Belongs to class; unique `(tenant_id, class_id, name)` |
| `academic_years` | `server/src/modules/classes/academicYear.model.js` | `name`, `is_active` |
| `students` | `server/src/modules/students/student.model.js` | Profile + `admission_no` unique per tenant; photo in `photo_base64` / `photo_mime` / legacy `photo_url` |
| `student_enrollments` | `server/src/modules/students/studentEnrollment.model.js` | Unique `(tenant_id, student_id, academic_year_id)`; `class_id`, `section_id`, `roll_number`, `category`, `promotion_type`, `status` |
| `student_guardians` | `server/src/modules/students/studentGuardian.model.js` | One row per student per tenant (unique `tenant_id`+`student_id`) |
| `student_previous_schools` | `server/src/modules/students/studentPreviousSchool.model.js` | Previous school info |
| `student_documents` | `server/src/modules/students/studentDocument.model.js` | `file_name`, `file_url` |
| `student_promotions` | `server/src/modules/students/studentPromotion.model.js` | Audit trail: from/to year, class, section, `kind`, `created_by_user_id` |
| `teachers` | `server/src/modules/teachers/teacher.model.js` | Teacher profile, payroll/basic employment data, status, and reporting manager/class links |
| `teacher_academic_assignments` | `server/src/modules/teachers/teacherAcademicAssignment.model.js` | Teacher assignment to class/section/subject/academic year |
| `subjects` | `server/src/modules/subjects/subject.model.js` | Tenant-scoped subject catalog mapped to class/academic year |
| `fee_collections` | `server/src/modules/fees/feeCollection.model.js` | Student fee ledger with receipt metadata and collector info |
| `expenses` | `server/src/modules/expenses/expense.model.js` | Tenant expense tracking with category, amount, and creator |
| `exams` | `server/src/modules/exams/exam.model.js` | Exam master records, status transitions, publication flags |
| `exam_classes` | `server/src/modules/exams/examClass.model.js` | Class participation per exam |
| `exam_timetables` | `server/src/modules/exams/examTimetable.model.js` | Subject schedule and paper-level timetable details |
| `exam_marks` | `server/src/modules/exams/examMark.model.js` | Marks entry, moderation, grading source data |
| `exam_mark_audits` | `server/src/modules/exams/examMarkAudit.model.js` | Audit trail of marks changes |
| `grading_schemes` / `grading_bands` | `server/src/modules/exams/gradingScheme.model.js`, `gradingBand.model.js` | Configurable grading scales |
| `exam_grading_configs` | `server/src/modules/exams/examGradingConfig.model.js` | Exam-level binding to grading scheme |
| `exam_recheck_requests` | `server/src/modules/exams/examRecheckRequest.model.js` | Student recheck workflow and assignment to teachers |
| `notifications` / `notification_reads` | `server/src/modules/notifications/*.model.js` | In-app notifications and per-user read status |

**Relationships (high level)**

- `users.tenant_id` → `tenants.id`; optional `users.student_id` → `students.id` (`server/src/index.js` `User.belongsTo(Student, …)`).
- All academic/student entities carry **`tenant_id`** for isolation.
- `student_enrollments` links `students`, `academic_years`, `classes`, `sections`.

**Enums / constants (not DB enums — application-level)**

- **Roles** (string): `super_admin`, `admin`, `teacher`, `student` (enforced by `authorize()` allow-lists on routes).
- **Module keys** (from `server/src/seed/moduleSeed.js` `CATALOG`): `students`, `teachers`, `classes`, `attendance`, `fees`, `exams`, `results`, `library`, `transport`, `reports`.
- **Enrollment categories** validated in `server/src/seed/canonicalClasses.js`: `Science`/`Arts` for classes `C9`–`C10`; `Pre-engineering`/`Medical`/`Computer science` for `C11`–`C12`.
- **Blood groups** set in `server/src/modules/students/student.controller.js` (`BLOOD_GROUPS`).
- **Tenant status** (super-admin create): `active` | `inactive` | `pending` (`server/src/modules/super-admin/super-admin.controller.js` `ALLOWED_STATUS`).
- **Reserved subdomain:** `platform` (`server/src/core/utils/subdomain.js`).

**Migration strategy**  
**`sequelize.sync({ alter: true })` on every successful DB connect** — no versioned migration files. Suitable for early dev; risky for production (schema drift, locking).

---

## 5. API Design

**Global / misc** (`server/src/index.js`)

| Method | Path | Purpose | Auth / notes |
|--------|------|---------|----------------|
| GET | `/` | Health + echoes `req.tenant.name` | After `tenantMiddleware` — needs tenant resolution |
| POST | `/auth/signup` | Self-serve school signup | **Before** `tenantMiddleware` — no `x-tenant-id` |
| GET | `/tenant-branding` | Branding for current tenant | `authMiddleware`; rejects `super_admin` (use super-admin routes) |
| GET | `/secure` | Smoke test | `authMiddleware` |
| GET | `/admin/ping` | Admin-only smoke | `authMiddleware` + `authorize('admin')` |
| GET | `/students/ping` | Feature smoke | `authMiddleware` + `checkFeature('students')` |

**Auth** (`server/src/modules/auth/auth.routes.js`, mounted `/auth` after tenant middleware)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/login` | Body: `email`+`password` or `login`+`password`; tenant from JWT or **`x-tenant-id`** header |

**Modules (tenant)** (`server/src/modules/modules/modules.routes.js`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/modules` | Merged catalog + `is_enabled` for `req.tenant` | `authMiddleware` only |

**Super admin** (`server/src/modules/super-admin/super-admin.routes.js`, base `/super-admin`)

All routes: `authorize('super_admin')` (router-level), plus `authMiddleware` on mount in index for `/super-admin`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/super-admin/tenants` | Paginated tenants (`page`, `limit`) |
| POST | `/super-admin/tenants` | Create tenant + admin user + seed modules/classes/years |
| GET | `/super-admin/tenants/:tenantId/modules` | Tenant + module toggles |
| PUT | `/super-admin/tenants/:tenantId/modules` | Array of `{ module_key, is_enabled }` |
| GET | `/super-admin/tenant-branding/:tenantId` | Branding payload |
| POST | `/super-admin/tenant-branding` | Upsert colors (`tenantId`, `primaryColor`, `secondaryColor`) |
| POST | `/super-admin/tenant-branding/upload-logo` | Multipart `file` + `tenantId` query; PNG only, 1MB |

**Academic / classes + subjects** (`server/src/modules/classes/academic.routes.js`, `server/src/modules/subjects/subject.routes.js` — mounted at app root)

Router stack: `authMiddleware` → `checkFeature('classes')` → `authorize('admin', 'super_admin')`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/classes` | List classes; query `include=sections` |
| POST | `/classes` | Create class + default section `A` |
| PATCH | `/classes/:id` | Update class |
| DELETE | `/classes/:id` | Delete if no active enrollments |
| GET | `/sections` | Query `class_id` required |
| POST | `/sections` | Create section |
| PATCH | `/sections/:id` | Rename |
| DELETE | `/sections/:id` | Not last section; no active enrollments |
| GET | `/academic-years` | List |
| GET | `/academic-years/current` | Active year |
| POST | `/academic-years` | Create |
| PATCH | `/academic-years/:id/active` | Set active (others false) |
| GET | `/subjects` | List subjects (tenant-scoped) |
| POST | `/subjects` | Create subject |
| GET | `/subjects/:id` | Subject details |
| PATCH | `/subjects/:id` | Update subject |
| DELETE | `/subjects/:id` | Delete subject |

**Students** (`server/src/modules/students/student.routes.js`)

Stack: `authMiddleware` → `checkFeature('students')` → `authorize('admin', 'super_admin')`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/students/register` | Full registration + enrollment + optional student login user |
| POST | `/students/promote` | Bulk/class promotion |
| GET | `/students` | Paginated list |
| GET | `/students/lookup` | By admission number |
| GET | `/students/:id/login-details` | Login metadata for student user |
| GET | `/students/:id` | Detail + relations |
| PUT | `/students/:id` | Update + photo handling |
| DELETE | `/students/:id` | Remove |
| GET | `/enrollments` | List enrollments (tenant-scoped) |

**Teachers** (`server/src/modules/teachers/teacher.routes.js`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/teachers/me` | Teacher self-profile |
| PATCH | `/teachers/me` | Update teacher profile |
| PATCH | `/teachers/me/password` | Change own password |
| GET | `/teachers/me/dashboard` | Teacher dashboard/assignment summary |
| GET | `/teachers` | Admin/super_admin teacher list |
| POST | `/teachers` | Create teacher + optional login linkage |
| GET | `/teachers/:id` | Teacher details |
| PUT | `/teachers/:id` | Update teacher |
| DELETE | `/teachers/:id` | Remove/deactivate teacher |
| POST | `/teachers/:id/cv` | Upload teacher CV (PDF/Word) |
| GET | `/teachers/:id/assignments` | Teacher assignments |
| POST | `/teachers/:id/assignments` | Assign class/section/subject/year |
| DELETE | `/teachers/:id/assignments/:assignmentId` | Remove assignment |

**Fees / expenses** (`server/src/modules/fees/fee.routes.js`, `server/src/modules/expenses/expense.routes.js`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/fees` | List fee collections |
| POST | `/fees` | Create fee collection entry |
| GET | `/fees/:id` | Fee detail |
| PUT | `/fees/:id` | Update fee record |
| DELETE | `/fees/:id` | Delete fee record |
| GET | `/fees/student/:studentId` | Fee history by student |
| GET | `/expenses` | List expenses |
| POST | `/expenses` | Record expense |
| GET | `/expenses/:id` | Expense detail |
| PUT | `/expenses/:id` | Update expense |
| DELETE | `/expenses/:id` | Delete expense |

**Exams** (`server/src/modules/exams/exam.routes.js`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/exams` | Admin exam list |
| POST | `/exams` | Create exam |
| GET | `/exams/:id` | Exam detail |
| PATCH | `/exams/:id` | Update exam |
| POST | `/exams/:id/transition` | Status transitions |
| POST | `/exams/:id/publish` | Publish exam result |
| GET/POST/PATCH | `/exams/:id/timetable*` | Timetable lifecycle |
| GET/PUT | `/exams/:id/marks*` | Marks sheet + marks upsert |
| GET/POST | `/exams/grading-schemes*` | Grading scheme CRUD/archive |
| GET | `/exams/teachers/me/exams*` | Teacher exam workload views |
| GET/POST | `/exams/students/me*` | Student result/recheck flows |
| GET | `/exams/:id/*pdf` | Admit/result PDF generation |

**Notifications** (`server/src/modules/notifications/notification.routes.js`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/notifications` | List current user notifications |
| POST | `/notifications/:id/read` | Mark one as read |
| POST | `/notifications/read-all` | Mark all as read |

**Request/response**  
Mostly **JSON** with **snake_case** fields matching Sequelize `underscored: true`. Errors typically `{ message: string }` or `{ error: string }`.

---

## 6. Frontend Architecture

**Module structure**  
No classic `NgModule` feature modules — **standalone components** + **lazy `loadComponent`** in `client/src/app/app.routes.ts`.

- **Feature areas:** `modules/auth`, `modules/home`, `modules/classes`, `modules/students`, `modules/teachers`, `modules/fees`, `modules/expenses`, `modules/exams`, `modules/super-admin`.
- **Shared:** `shared/placeholder-page`, `shared/unauthorized`, `shared/table-pagination-footer`.
- **Layout:** `layout/main-layout` (tenant app shell), `layout/super-admin-layout`, `layout/app-header-actions`.

**Routing**

- **Lazy loading:** Nearly all feature components loaded via dynamic `import()`.
- **Guards:**
  - `guestGuard` — login/signup if not authenticated; redirects super_admin to `/super-admin/tenants`.
  - `authGuard` — main app + unauthorized; stores `returnUrl`.
  - `superAdminGuard` — role `super_admin`.
  - `featureGuard` — reads `route.data['moduleKey']`, checks `FeatureService.isEnabled()`; else `/unauthorized`.
- **Wildcard:** `**` → `/login`.

**Component hierarchy (key flows)**

- `MainLayoutComponent` → sidebar from `TENANT_NAV_CONFIG` filtered by `FeatureService.enabled()` + `RouterOutlet` for child routes.
- Students: `StudentListComponent` → detail/edit/register/promote routes as siblings under `MainLayoutComponent`.
- Super admin: `SuperAdminLayoutComponent` → tenants, feature management, branding settings.
- Teachers: `TeacherDashboardComponent` + `TeacherSelfProfileComponent` + teacher exam workflows.
- Exams: admin exam setup, grading schemes, marks entry and student exam/result screens.

**Services**

| Service | Responsibility |
|---------|----------------|
| `client/src/app/services/auth.service.ts` | Login/signup HTTP, JWT + user in `localStorage` (`school_saas_token`, `school_saas_subdomain`, `school_saas_user`), `logout()`, role from JWT/user |
| `client/src/app/services/feature.service.ts` | `GET /modules`, signal `Set` of enabled `module_key`s |
| `client/src/app/services/branding.service.ts` | Tenant theming (loaded via initializer when authenticated) |
| `client/src/app/services/academic.service.ts` | Classes, sections, academic years |
| `client/src/app/services/student.service.ts` | Student CRUD, list normalization, promote, etc. |
| `client/src/app/services/teacher.service.ts` | Teacher admin CRUD + self-profile endpoints + assignment endpoints |
| `client/src/app/services/fee.service.ts` | Fee collection and student fee history |
| `client/src/app/services/exam.service.ts` | Exam lifecycle, timetable, marks, grading, student/teacher exam views |
| `client/src/app/services/api.service.ts` | Demo `GET /` with hardcoded `x-tenant-id: abc` (non-core utility) |
| `client/src/app/services/theme.service.ts` | Dark/light via `APP_INITIALIZER` |
| `client/src/app/services/toast.service.ts`, `notification.service.ts` | UX |

**State management**  
**Signals + localStorage** for auth and feature sets; no global store. HTTP state is mostly **imperative** in components/services.

---

## 7. Backend Architecture

**Layering**  
**Thin vertical slices:** **`*.routes.js` → middleware chain → `*.controller.js` → Sequelize models inline.** No dedicated service or repository layer.

**Middleware chain (typical tenant API)**

1. **`tenantMiddleware`** (`server/src/core/middleware/tenant.middleware.js`) — Sets `req.tenant` from JWT `tenant_id` or, for `super_admin` with `x-tenant-id`, from subdomain lookup; else requires `x-tenant-id` without valid token path.
2. **`authMiddleware`** — Verifies JWT, sets `req.user`.
3. **`authorize(...roles)`** — Role allow-list.
4. **`checkFeature(moduleKey)`** — `tenant_modules` row must exist and `is_enabled`.

**Order caveat:** `/auth/signup` is registered **before** `tenantMiddleware`; `/auth/login` is **after** `tenantMiddleware`, so login requires tenant context (header or JWT path).

**Error handling**  
Controllers generally **`try/catch` → `res.status(4xx/5xx).json(...)`**. Some async errors use `next(err)` (e.g. feature middleware); **no global Express error handler** observed in `server/src/index.js`.

**Logging**  
**Console** (`console.log` / `console.error`) in startup and seeds; Sequelize `logging: false`.

---

## 8. Multi-Tenancy Strategy

**Model:** **Shared database, shared schema, row-level isolation** via **`tenant_id`** (UUID) on tenant-bound tables.

**Tenant resolution (`req.tenant`)** — `server/src/core/middleware/tenant.middleware.js`:

- If **Bearer** token valid:
  - **`super_admin`** + **`x-tenant-id`** header (subdomain string) → load tenant by `subdomain`.
  - Else **`decoded.tenant_id`** → `Tenant.findByPk`.
- Else **`x-tenant-id`** header required → lookup by `subdomain`.

**Client injection** — `client/src/app/interceptors/auth.interceptor.ts`: sends `Authorization: Bearer …` and `x-tenant-id` from `localStorage` (`school_saas_subdomain`) for same-origin API URLs; **skips** `/auth/login` and `/auth/signup`.

**Schema separation / RLS**  
**Not implemented** — isolation is **application-level** (queries should filter by `tenant_id`; controllers generally use `req.tenant.id`).

---

## 9. Authentication & Authorization

**Flows**

- **Signup:** `POST /auth/signup` → creates `tenants` + first `admin` `users` row → seeds modules, canonical classes, academic years → returns **JWT** + user + tenant (`server/src/modules/auth/auth.controller.js`).
- **Login:** `POST /auth/login` with tenant context → validates password → **JWT** (`1d`).
- **Logout:** **Client-only** — `AuthService.logout()` clears storage (`client/src/app/services/auth.service.ts`); **no server revoke/blocklist**.
- **Refresh:** **Not found / planned.**

**Roles**

- **`super_admin`:** Platform tenant; `/super-admin/*`; can assume tenant via `x-tenant-id`.
- **`admin`:** School administrator; full access to academic/student/teacher/fees/exams where features are enabled.
- **`teacher`:** Self profile and teacher exam endpoints (`/teachers/me*`, `/exams/teachers/me*`); admin teacher management endpoints remain restricted.
- **`student`:** Student exam endpoints (`/exams/students/me*`) plus authenticated module visibility as configured.

**Enforcement**

| Layer | Mechanism |
|-------|-----------|
| Backend | `authMiddleware` + `authorize(...)` + `checkFeature(...)` per router |
| Frontend | `authGuard`, `superAdminGuard`, `featureGuard`; sidebar is primarily feature-driven and role guards enforce route-level access |

**Permissions matrix (simplified)**

| Capability | super_admin | admin | teacher | student |
|------------|-------------|-------|---------|---------|
| `/super-admin/*` | Yes | No | No | No |
| `/classes`, `/sections`, `/academic-years`, `/subjects` | Yes (with tenant context) | Yes | No | No |
| `/students/*`, `/enrollments` | Yes (with tenant context) | Yes | No | No |
| `/teachers` admin APIs | Yes (with tenant context) | Yes | No | No |
| `/teachers/me*` | No | No | Yes | No |
| `/exams` admin APIs | Yes (with tenant context) | Yes | No | No |
| `/exams/teachers/me*` | No | No | Yes | No |
| `/exams/students/me*` | No | No | No | Yes |
| `/modules` | Yes (tenant from JWT/header) | Yes | Yes | Yes |

---

## 10. Business Modules Identified

| Module | Catalog key | Backend API | Frontend UI | Status |
|--------|-------------|-------------|-------------|--------|
| **Tenant / org** | — | Signup, super-admin tenants | Signup, tenant list, create dialog | **Implemented** (core) |
| **Feature flags** | all keys in `CATALOG` | `/modules`, super-admin PUT modules | Feature management screen | **Implemented** |
| **Branding** | — | `/tenant-branding`, super-admin branding | Tenant branding settings, theme in layout | **Implemented** |
| **Classes / sections / academic years** | `classes` | `/classes`, `/sections`, `/academic-years` | Class list, class form | **Implemented** |
| **Students** | `students` | Full student + enrollment + promote APIs | List, detail, register, promote | **Implemented** (rich) |
| **Teachers** | `teachers` | CRUD + assignments + self-service endpoints | Teacher list/form/detail + self-profile/dashboard | **Implemented** |
| **Fees** | `fees` | Fee collection CRUD + student fee history | Fee collection + receipt | **Implemented** |
| **Expenses** | `expenses` | Expense CRUD | Expense list + receipt | **Implemented** |
| **Exams** | `exams` | Exams, timetables, marks, grading, PDFs, rechecks | Admin/teacher/student exam flows | **Implemented** |
| **Attendance** | `attendance` | Not found | Placeholder | **Planned / stub** |
| **Reports** | `reports` | Not found | Placeholder | **Planned / stub** |
| **Library / Transport / Results (standalone module)** | catalog keys | Not found | No dedicated routes in `app.routes.ts` | **Catalog / planned** |

---

## 11. Coding Patterns & Conventions Observed

**Naming**

- **DB / API:** **snake_case** columns (`tenant_id`, `admission_no`, `module_key`) via Sequelize `underscored: true`.
- **Files:** **kebab-case** Angular components (`student-register.component.ts`); server **camelCase** for `*.controller.js` / `*.routes.js`.
- **Angular TS:** **PascalCase** classes, **camelCase** methods/properties; some **DTO interfaces** mirror API snake_case field names in `student.service.ts`.

**TypeScript (client)**

- **Strict** compiler options in `client/tsconfig.json` (`strict`, `strictTemplates`, etc.).

**JavaScript (server)**

- **CommonJS** `require`/`module.exports`; no TypeScript on server.

**Patterns**

- **Functional guards/interceptors** on client; **higher-order middleware** on server.
- **Feature flags** mirrored: backend `checkFeature` + frontend `featureGuard` + nav filter.

**Inconsistencies**

- README vs actual UI stack (**Material** vs **Bootstrap**).
- `client/src/app/services/api.service.ts` hardcodes tenant `abc` for demo `getHello()` — easy to confuse with real app flow.

---

## 12. Dependencies & Versions

**Client (`client/package.json`) — runtime**

- `@angular/*` **^19.2.x** (animations ^19.2.20)
- `bootstrap` **^5.3.3**, `bootstrap-icons` **^1.11.3**, `@popperjs/core` **^2.11.8**
- `rxjs` **~7.8.0**, `tslib` **^2.3.0**, `zone.js` **~0.15.0**

**Client — dev**

- `@angular/cli` **^19.2.13**, `typescript` **~5.7.2**, Karma/Jasmine stack **~5.x / ~6.x**

**Server (`server/package.json`)**

- `express` **^5.2.1**, `sequelize` **^6.37.8**, `pg` **^8.20.0**
- `jsonwebtoken` **^9.0.3**, `bcrypt` **^6.0.0**, `cors` **^2.8.6**, `dotenv` **^17.4.0**, `multer` **^1.4.5-lts.1**, `sharp` **^0.33.5**
- `nodemon` **^3.1.14** (dev)

**Outdated / conflict audit**  
**Not run** (`npm outdated` / audit not executed in this session). Note: **Express 5** and **Angular 19** are current major lines; **multer 1.x** is LTS-track — verify security advisories periodically.

---

## 13. Environment & Configuration

**Documented in `server/.env.example`**

- `PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_HOST`, `JWT_SECRET`

**Referenced in code but not in `.env.example`**

- `JSON_BODY_LIMIT` (`server/src/index.js`)
- `SUPER_ADMIN_PASSWORD`, `STUDENT_DEFAULT_PASSWORD` (seed defaults in `server/src/index.js`)

**Client**

- `client/src/environments/environment.ts` and `environment.development.ts`: `production`, `apiBaseUrl`.

**Secrets management**  
**None observed** beyond `.env` and defaults in code — suitable for local dev only.

---

## 14. Testing Strategy

**Frameworks**

- **Client:** **Karma + Jasmine** via Angular CLI (`client/angular.json` test target).
- **Server:** **No test runner** configured.

**Specs present (client)**

- `client/src/app/app.component.spec.ts`
- `client/src/app/modules/students/student-register/student-register.component.spec.ts`
- `client/src/app/modules/students/student-promote/student-promote.component.spec.ts`

**Coverage gaps**

- No **e2e** harness configured in repo (Angular default `ng e2e` mentioned in client README as optional).
- **No server unit/integration tests** for controllers, middleware, or multi-tenant boundaries.
- Most feature components, guards, interceptors, and services **untested**.

---

*End of report.*
