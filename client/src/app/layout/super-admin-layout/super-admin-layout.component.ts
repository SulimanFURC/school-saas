import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AppHeaderActionsComponent } from '../app-header-actions/app-header-actions.component';

const MOBILE_MQ = '(max-width: 991.98px)';

@Component({
  selector: 'app-super-admin-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    AppHeaderActionsComponent,
  ],
  templateUrl: './super-admin-layout.component.html',
  styleUrl: './super-admin-layout.component.scss',
})
export class SuperAdminLayoutComponent {
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly sidebarOpen = signal(true);
  readonly isMobile = signal(false);

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.resolveTitle()),
      startWith(this.resolveTitle())
    ),
    { initialValue: this.resolveTitle() }
  );

  constructor() {
    afterNextRender(() => {
      const mq = window.matchMedia(MOBILE_MQ);
      const sync = (): void => {
        const mobile = mq.matches;
        this.isMobile.set(mobile);
        if (mobile) {
          this.sidebarOpen.set(false);
        } else {
          this.sidebarOpen.set(true);
        }
      };
      sync();
      mq.addEventListener('change', sync);
      this.destroyRef.onDestroy(() => mq.removeEventListener('change', sync));
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebarIfMobile(): void {
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
  }

  private resolveTitle(): string {
    let r = this.router.routerState.root;
    while (r.firstChild) {
      r = r.firstChild;
    }
    const title = r.snapshot?.data?.['title'] as string | undefined;
    return title ?? 'Super admin';
  }
}
