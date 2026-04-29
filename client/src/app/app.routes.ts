import { Routes } from '@angular/router';

import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { SuperAdminLayoutComponent } from './layout/super-admin-layout/super-admin-layout.component';
import { adminRoleGuard } from './guards/admin-role.guard';
import { authGuard } from './guards/auth.guard';
import { featureGuard } from './guards/feature.guard';
import { guestGuard } from './guards/guest.guard';
import { studentRoleGuard } from './guards/student-role.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { teacherRoleGuard } from './guards/teacher-role.guard';
import { settingsNotificationsGuard, settingsTenantAdminGuard } from './guards/settings.guard';

export const routes: Routes = [
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./modules/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./modules/auth/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./modules/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./modules/auth/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'unauthorized',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shared/unauthorized/unauthorized.component').then((m) => m.UnauthorizedComponent),
  },
  {
    path: '404',
    loadComponent: () => import('./shared/error-page/error-page.component').then((m) => m.ErrorPageComponent),
    data: { code: '404', title: 'Page not found' },
  },
  {
    path: 'super-admin',
    component: SuperAdminLayoutComponent,
    canActivate: [superAdminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./modules/super-admin/super-admin-dashboard/super-admin-dashboard.component').then(
            (m) => m.SuperAdminDashboardComponent
          ),
        data: { title: 'Platform dashboard' },
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('./modules/super-admin/tenant-list/tenant-list.component').then(
            (m) => m.TenantListComponent
          ),
        data: { title: 'Tenants' },
      },
      {
        path: 'tenants/:id/features',
        loadComponent: () =>
          import('./modules/super-admin/feature-management/feature-management.component').then(
            (m) => m.FeatureManagementComponent
          ),
        data: { title: 'Feature management' },
      },
      {
        path: 'platform-settings',
        loadComponent: () =>
          import('./modules/super-admin/platform-settings/platform-settings.component').then(
            (m) => m.PlatformSettingsComponent
          ),
        data: { title: 'Platform settings' },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./modules/super-admin/tenant-branding-settings/tenant-branding-settings.component').then(
            (m) => m.TenantBrandingSettingsComponent
          ),
        data: { title: 'Tenant branding' },
      },
    ],
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home',
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./modules/home/home.component').then((m) => m.HomeComponent),
        data: { title: 'Dashboard' },
      },
      {
        path: 'students/register',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/students/student-register/student-register.component').then(
            (m) => m.StudentRegisterComponent
          ),
        data: { title: 'Register student', moduleKey: 'students' },
      },
      {
        path: 'students/promote',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/students/student-promote/student-promote.component').then(
            (m) => m.StudentPromoteComponent
          ),
        data: { title: 'Promote students', moduleKey: 'students' },
      },
      {
        path: 'students',
        pathMatch: 'full',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/students/student-list/student-list.component').then(
            (m) => m.StudentListComponent
          ),
        data: { title: 'Students', moduleKey: 'students' },
      },
      {
        path: 'students/:id/edit',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/students/student-register/student-register.component').then(
            (m) => m.StudentRegisterComponent
          ),
        data: { title: 'Edit student', moduleKey: 'students' },
      },
      {
        path: 'students/:id',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/students/student-detail/student-detail.component').then(
            (m) => m.StudentDetailComponent
          ),
        data: { title: 'Student details', moduleKey: 'students' },
      },
      {
        path: 'teachers/dashboard',
        pathMatch: 'full',
        redirectTo: 'home',
      },
      {
        path: 'teachers/exams',
        canActivate: [teacherRoleGuard, featureGuard],
        loadComponent: () =>
          import('./modules/teachers/teacher-exams/teacher-exams.component').then(
            (m) => m.TeacherExamsComponent
          ),
        data: { title: 'Exams', moduleKey: 'exams' },
      },
      {
        path: 'teachers/me',
        canActivate: [teacherRoleGuard],
        loadComponent: () =>
          import('./modules/teachers/teacher-self-profile/teacher-self-profile.component').then(
            (m) => m.TeacherSelfProfileComponent
          ),
        data: { title: 'My profile' },
      },
      {
        path: 'teachers/new',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/teachers/teacher-form/teacher-form.component').then((m) => m.TeacherFormComponent),
        data: { title: 'Add teacher', moduleKey: 'teachers' },
      },
      {
        path: 'teachers/:id/edit',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/teachers/teacher-form/teacher-form.component').then((m) => m.TeacherFormComponent),
        data: { title: 'Edit teacher', moduleKey: 'teachers' },
      },
      {
        path: 'teachers/:id',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/teachers/teacher-detail/teacher-detail.component').then(
            (m) => m.TeacherDetailComponent
          ),
        data: { title: 'Teacher details', moduleKey: 'teachers' },
      },
      {
        path: 'teachers',
        pathMatch: 'full',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/teachers/teacher-list/teacher-list.component').then((m) => m.TeacherListComponent),
        data: { title: 'Teachers', moduleKey: 'teachers' },
      },
      {
        path: 'fees/collection',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/fees/fee-collection/fee-collection.component').then(
            (m) => m.FeeCollectionComponent
          ),
        data: { title: 'Fee collection', moduleKey: 'fees' },
      },
      {
        path: 'fees/receipt/:studentId',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/fees/fee-receipt/fee-receipt.component').then((m) => m.FeeReceiptComponent),
        data: { title: 'Fee receipt', moduleKey: 'fees' },
      },
      {
        path: 'fees',
        pathMatch: 'full',
        redirectTo: 'fees/collection',
      },
      {
        path: 'expenses/receipt/:id',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/expenses/expense-receipt/expense-receipt.component').then(
            (m) => m.ExpenseReceiptComponent
          ),
        data: { title: 'Expense receipt', moduleKey: 'expenses' },
      },
      {
        path: 'expenses',
        pathMatch: 'full',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/expenses/expense-list/expense-list.component').then(
            (m) => m.ExpenseListComponent
          ),
        data: { title: 'Expenses', moduleKey: 'expenses' },
      },
      {
        path: 'classes/new',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/classes/class-form/class-form.component').then((m) => m.ClassFormComponent),
        data: { title: 'Add class', moduleKey: 'classes' },
      },
      {
        path: 'classes/:id/edit',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/classes/class-form/class-form.component').then((m) => m.ClassFormComponent),
        data: { title: 'Edit class', moduleKey: 'classes' },
      },
      {
        path: 'classes',
        pathMatch: 'full',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/classes/class-list/class-list.component').then((m) => m.ClassListComponent),
        data: { title: 'Classes', moduleKey: 'classes' },
      },
      {
        path: 'subjects',
        pathMatch: 'full',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/subjects/subject-list/subject-list.component').then((m) => m.SubjectListComponent),
        data: { title: 'Subjects', moduleKey: 'classes' },
      },
      {
        path: 'attendance',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Attendance', moduleKey: 'attendance' },
      },
      {
        path: 'exams/grading-schemes',
        pathMatch: 'full',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/exams/grading-scheme-list/grading-scheme-list.component').then(
            (m) => m.GradingSchemeListComponent
          ),
        data: { title: 'Grading schemes', moduleKey: 'exams' },
      },
      {
        path: 'exams/grading-schemes/new',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/exams/grading-scheme-form/grading-scheme-form.component').then(
            (m) => m.GradingSchemeFormComponent
          ),
        data: { title: 'New grading scheme', moduleKey: 'exams' },
      },
      {
        path: 'exams/grading-schemes/:id/edit',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/exams/grading-scheme-form/grading-scheme-form.component').then(
            (m) => m.GradingSchemeFormComponent
          ),
        data: { title: 'Edit grading scheme', moduleKey: 'exams' },
      },
      {
        path: 'exams/new',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/exams/exam-form/exam-form.component').then((m) => m.ExamFormComponent),
        data: { title: 'Create exam', moduleKey: 'exams' },
      },
      {
        path: 'exams/:id/edit',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/exams/exam-form/exam-form.component').then((m) => m.ExamFormComponent),
        data: { title: 'Edit exam', moduleKey: 'exams' },
      },
      {
        path: 'exams/:id',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/exams/exam-detail/exam-detail.component').then((m) => m.ExamDetailComponent),
        data: { title: 'Exam details', moduleKey: 'exams' },
      },
      {
        path: 'exams',
        pathMatch: 'full',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/exams/exam-list/exam-list.component').then((m) => m.ExamListComponent),
        data: { title: 'Exams', moduleKey: 'exams' },
      },
      {
        path: 'teachers/exams/:id',
        canActivate: [teacherRoleGuard, featureGuard],
        loadComponent: () =>
          import('./modules/exams/teacher-exam-marks/teacher-exam-marks.component').then(
            (m) => m.TeacherExamMarksComponent
          ),
        data: { title: 'Marks entry', moduleKey: 'exams' },
      },
      {
        path: 'my-exams',
        pathMatch: 'full',
        canActivate: [studentRoleGuard, featureGuard],
        loadComponent: () =>
          import('./modules/exams/student-exams/student-exams.component').then(
            (m) => m.StudentExamsComponent
          ),
        data: { title: 'My exams', moduleKey: 'exams' },
      },
      {
        path: 'my-exams/:id',
        canActivate: [studentRoleGuard, featureGuard],
        loadComponent: () =>
          import('./modules/exams/student-exam-detail/student-exam-detail.component').then(
            (m) => m.StudentExamDetailComponent
          ),
        data: { title: 'Exam details', moduleKey: 'exams' },
      },
      {
        path: 'reports',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/reports/reports-layout/reports-layout.component').then(
            (m) => m.ReportsLayoutComponent
          ),
        data: { title: 'Reports', moduleKey: 'reports' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'enrollment' },
          {
            path: 'enrollment',
            loadComponent: () =>
              import('./modules/reports/enrollment-report/enrollment-report.component').then(
                (m) => m.EnrollmentReportComponent
              ),
            data: { title: 'Enrollment report' },
          },
          {
            path: 'fee-collection',
            loadComponent: () =>
              import('./modules/reports/fee-collection-report/fee-collection-report.component').then(
                (m) => m.FeeCollectionReportComponent
              ),
            data: { title: 'Fee collection' },
          },
          {
            path: 'fee-defaulters',
            loadComponent: () =>
              import('./modules/reports/fee-defaulters-report/fee-defaulters-report.component').then(
                (m) => m.FeeDefaultersReportComponent
              ),
            data: { title: 'Fee defaulters' },
          },
          {
            path: 'expenses',
            loadComponent: () =>
              import('./modules/reports/expense-report/expense-report.component').then(
                (m) => m.ExpenseReportComponent
              ),
            data: { title: 'Expense report' },
          },
        ],
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./modules/settings/settings-layout/settings-layout.component').then(
            (m) => m.SettingsLayoutComponent
          ),
        data: { title: 'Settings' },
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./modules/settings/settings-home-redirect/settings-home-redirect.component').then(
                (m) => m.SettingsHomeRedirectComponent
              ),
          },
          {
            path: 'school-profile',
            canActivate: [settingsTenantAdminGuard],
            loadComponent: () =>
              import('./modules/settings/school-profile-settings/school-profile-settings.component').then(
                (m) => m.SchoolProfileSettingsComponent
              ),
            data: { title: 'School profile' },
          },
          {
            path: 'academic',
            canActivate: [settingsTenantAdminGuard],
            loadComponent: () =>
              import('./modules/settings/academic-settings/academic-settings.component').then(
                (m) => m.AcademicSettingsComponent
              ),
            data: { title: 'Academic year' },
          },
          {
            path: 'grading',
            pathMatch: 'full',
            redirectTo: '/exams/grading-schemes',
          },
          {
            path: 'notifications',
            canActivate: [settingsNotificationsGuard],
            loadComponent: () =>
              import(
                './modules/settings/notification-preferences-settings/notification-preferences-settings.component'
              ).then((m) => m.NotificationPreferencesSettingsComponent),
            data: { title: 'Notifications' },
          },
          {
            path: 'password',
            loadComponent: () =>
              import('./modules/settings/change-password-settings/change-password-settings.component').then(
                (m) => m.ChangePasswordSettingsComponent
              ),
            data: { title: 'Password' },
          },
        ],
      },
      {
        path: 'profile',
        canActivate: [adminRoleGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'My profile' },
      },
    ],
  },
  { path: '**', redirectTo: '/404' },
];
