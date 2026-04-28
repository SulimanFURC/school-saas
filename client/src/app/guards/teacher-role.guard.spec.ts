import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot, type UrlTree } from '@angular/router';
import { signal } from '@angular/core';

import { teacherRoleGuard } from './teacher-role.guard';
import { AuthService } from '../services/auth.service';

describe('teacherRoleGuard', () => {
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

  function run(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() =>
      teacherRoleGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as boolean | UrlTree;
  }

  it('allows teachers', () => {
    userRole.set('teacher');
    expect(run()).toBeTrue();
  });

  it('blocks admins and redirects to /unauthorized', () => {
    userRole.set('admin');
    run();
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('blocks anonymous users', () => {
    userRole.set(null);
    run();
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('matches role case-insensitively', () => {
    userRole.set('Teacher');
    expect(run()).toBeTrue();
  });
});
