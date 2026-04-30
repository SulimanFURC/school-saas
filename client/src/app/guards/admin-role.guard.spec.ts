import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot, type UrlTree } from '@angular/router';
import { signal } from '@angular/core';

import { adminRoleGuard } from './admin-role.guard';
import { AuthService } from '@app/services';

describe('adminRoleGuard', () => {
  let userRole: ReturnType<typeof signal<string | null>>;
  let routerSpy: { createUrlTree: jasmine.Spy };

  beforeEach(() => {
    userRole = signal<string | null>(null);
    routerSpy = { createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({ __urlTree: true } as unknown as UrlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { userRole } },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  function run(path = ''): boolean | UrlTree {
    const route = { routeConfig: { path } } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() =>
      adminRoleGuard(route, {} as RouterStateSnapshot)
    ) as boolean | UrlTree;
  }

  it('allows admins', () => {
    userRole.set('admin');
    expect(run('students')).toBeTrue();
  });

  it('allows super_admin', () => {
    userRole.set('super_admin');
    expect(run('students')).toBeTrue();
  });

  it('redirects teachers to their dashboard', () => {
    userRole.set('teacher');
    run('');
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/teachers/dashboard']);
  });

  it('allows students on home and profile', () => {
    userRole.set('student');
    expect(run('')).toBeTrue();
    expect(run('profile')).toBeTrue();
  });

  it('redirects students from non-permitted routes', () => {
    userRole.set('student');
    run('students');
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('redirects unknown roles', () => {
    userRole.set('mystery');
    run('students');
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });
});
