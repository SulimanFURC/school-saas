import { NgClass } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { TENANT_NAV_CONFIG, isNavGroup, type NavEntry, type NavGroupConfig } from '../../config/nav.config';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';
import { FeatureService } from '../../services/feature.service';
import { AppHeaderActionsComponent } from '../app-header-actions/app-header-actions.component';

const NAV_ICON_MAP: Record<string, string> = {
  dashboard: 'bi-speedometer2',
  school: 'bi-mortarboard',
  badge: 'bi-person-badge',
  payments: 'bi-currency-dollar',
  class: 'bi-collection',
  event_available: 'bi-calendar-check',
  assessment: 'bi-graph-up',
  settings: 'bi-gear',
};

/** Matches Bootstrap `lg` breakpoint */
const MOBILE_MQ = '(max-width: 991.98px)';

@Component({
  selector: 'app-main-layout',
  imports: [
    NgClass,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    AppHeaderActionsComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  private features = inject(FeatureService);
  readonly branding = inject(BrandingService);

  /** Desktop: column width; mobile: overlay open */
  readonly sidebarOpen = signal(true);

  readonly isMobile = signal(false);

  readonly tenantLogoSrc = computed(() => {
    if (this.auth.userRole()?.toLowerCase() === 'super_admin') {
      return 'assets/default-logo.png';
    }
    const rel = this.branding.logoUrl();
    if (rel) {
      return `${environment.apiBaseUrl}/${rel.replace(/^\//, '')}`;
    }
    return 'assets/default-logo.png';
  });

  readonly navEntries = computed((): NavEntry[] => {
    const enabled = this.features.enabled();
    return TENANT_NAV_CONFIG.filter((entry) => {
      const key = isNavGroup(entry) ? entry.moduleKey : entry.moduleKey;
      if (!key) return true;
      return enabled.has(key);
    });
  });

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

  isNavGroupEntry(entry: NavEntry): entry is NavGroupConfig {
    return isNavGroup(entry);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebarIfMobile(): void {
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
  }

  navIconClass(materialIcon: string): string {
    return NAV_ICON_MAP[materialIcon] ?? 'bi-circle';
  }

  private resolveTitle(): string {
    let r = this.router.routerState.root;
    while (r.firstChild) {
      r = r.firstChild;
    }
    const title = r.snapshot?.data?.['title'] as string | undefined;
    return title ?? 'School SaaS';
  }
}
