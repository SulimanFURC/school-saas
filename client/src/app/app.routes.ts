import { Routes } from '@angular/router';

import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { SuperAdminLayoutComponent } from './layout/super-admin-layout/super-admin-layout.component';
import { adminRoleGuard } from './guards/admin-role.guard';
import { authGuard } from './guards/auth.guard';
import { featureGuard } from './guards/feature.guard';
import { guestGuard } from './guards/guest.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { teacherRoleGuard } from './guards/teacher-role.guard';

export const routes: Routes = [
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
    path: 'super-admin',
    component: SuperAdminLayoutComponent,
    canActivate: [superAdminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tenants' },
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
        path: 'settings',
        loadComponent: () =>
          import('./modules/super-admin/tenant-branding-settings/tenant-branding-settings.component').then(
            (m) => m.TenantBrandingSettingsComponent
          ),
        data: { title: 'Settings' },
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
        canActivate: [adminRoleGuard],
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
        path: 'teachers/me',
        canActivate: [featureGuard, teacherRoleGuard],
        loadComponent: () =>
          import('./modules/teachers/teacher-self-profile/teacher-self-profile.component').then(
            (m) => m.TeacherSelfProfileComponent
          ),
        data: { title: 'My profile', moduleKey: 'teachers' },
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
        path: 'classes/new',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/classes/class-form/class-form.component').then((m) => m.ClassFormComponent),
        data: { title: 'Add class', moduleKey: 'classes' },
      },
      {
        path: 'classes',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./modules/classes/class-list/class-list.component').then((m) => m.ClassListComponent),
        data: { title: 'Classes', moduleKey: 'classes' },
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
        path: 'reports',
        canActivate: [featureGuard, adminRoleGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Reports', moduleKey: 'reports' },
      },
      {
        path: 'settings',
        canActivate: [adminRoleGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Settings' },
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
  { path: '**', redirectTo: 'login' },
];
