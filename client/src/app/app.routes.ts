import { Routes } from '@angular/router';

import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { SuperAdminLayoutComponent } from './layout/super-admin-layout/super-admin-layout.component';
import { authGuard } from './guards/auth.guard';
import { featureGuard } from './guards/feature.guard';
import { guestGuard } from './guards/guest.guard';
import { superAdminGuard } from './guards/super-admin.guard';

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
        loadComponent: () =>
          import('./modules/home/home.component').then((m) => m.HomeComponent),
        data: { title: 'Dashboard' },
      },
      {
        path: 'students/register',
        canActivate: [featureGuard],
        loadComponent: () =>
          import('./modules/students/student-register/student-register.component').then(
            (m) => m.StudentRegisterComponent
          ),
        data: { title: 'Register student', moduleKey: 'students' },
      },
      {
        path: 'students/:id',
        canActivate: [featureGuard],
        loadComponent: () =>
          import('./modules/students/student-detail/student-detail.component').then(
            (m) => m.StudentDetailComponent
          ),
        data: { title: 'Student details', moduleKey: 'students' },
      },
      {
        path: 'students',
        canActivate: [featureGuard],
        loadComponent: () =>
          import('./modules/students/student-list/student-list.component').then(
            (m) => m.StudentListComponent
          ),
        data: { title: 'Students', moduleKey: 'students' },
      },
      {
        path: 'teachers',
        canActivate: [featureGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Teachers', moduleKey: 'teachers' },
      },
      {
        path: 'fees',
        canActivate: [featureGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Fees', moduleKey: 'fees' },
      },
      {
        path: 'classes',
        canActivate: [featureGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Classes', moduleKey: 'classes' },
      },
      {
        path: 'attendance',
        canActivate: [featureGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Attendance', moduleKey: 'attendance' },
      },
      {
        path: 'reports',
        canActivate: [featureGuard],
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Reports', moduleKey: 'reports' },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./shared/placeholder-page/placeholder-page.component').then(
            (m) => m.PlaceholderPageComponent
          ),
        data: { title: 'Settings' },
      },
      {
        path: 'profile',
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
