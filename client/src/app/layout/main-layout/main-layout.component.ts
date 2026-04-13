import { NgClass } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith, tap } from 'rxjs';

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
  receipt_long: 'bi-receipt',
  class: 'bi-collection',
  event_available: 'bi-calendar-check',
  quiz: 'bi-card-checklist',
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
    const role = this.auth.userRole()?.toLowerCase() ?? '';

    const base = TENANT_NAV_CONFIG.filter((entry) => {
      const key = isNavGroup(entry) ? entry.moduleKey : entry.moduleKey;
      if (!key) return true;
      return enabled.has(key);
    });

    if (role === 'teacher') {
      return base
        .filter((entry) => {
          if (isNavGroup(entry)) {
            return entry.moduleKey === 'teachers';
          }
          return entry.path === '/' || entry.path === '/teachers/me';
        })
        .map((entry) => {
          if (isNavGroup(entry) && entry.moduleKey === 'teachers') {
            return {
              ...entry,
              children: [{ label: 'My profile', path: '/teachers/me', icon: 'badge' }],
            };
          }
          return entry;
        });
    }

    if (role === 'student') {
      return base.filter((entry) => !isNavGroup(entry) && (entry.path === '/' || entry.path === '/profile'));
    }

    return base;
  });

  /** Keys of nav groups whose submenus are expanded */
  readonly expandedNavGroupKeys = signal<Set<string>>(new Set());

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      tap((e) => this.ensureGroupsExpandedForUrl(e.urlAfterRedirects)),
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

    this.ensureGroupsExpandedForUrl(this.router.url);

    effect(() => {
      this.navEntries();
      this.ensureGroupsExpandedForUrl(this.router.url);
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

  navGroupKey(entry: NavGroupConfig): string {
    return entry.moduleKey ?? entry.label;
  }

  navGroupPanelId(key: string): string {
    return `nav-group-panel-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  isNavGroupExpanded(key: string): boolean {
    return this.expandedNavGroupKeys().has(key);
  }

  toggleNavGroup(key: string): void {
    this.expandedNavGroupKeys.update((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  private ensureGroupsExpandedForUrl(rawUrl: string): void {
    const path = this.normalizeNavUrl(rawUrl);
    const toAdd = new Set<string>();
    for (const entry of this.navEntries()) {
      if (!isNavGroup(entry)) continue;
      const key = this.navGroupKey(entry);
      if (entry.children.some((c) => this.urlMatchesChildPath(path, c.path))) {
        toAdd.add(key);
      }
    }
    if (toAdd.size === 0) return;
    this.expandedNavGroupKeys.update((prev) => {
      const next = new Set(prev);
      for (const k of toAdd) {
        next.add(k);
      }
      return next;
    });
  }

  private normalizeNavUrl(url: string): string {
    const q = url.indexOf('?');
    const h = url.indexOf('#');
    let end = url.length;
    if (q >= 0) end = Math.min(end, q);
    if (h >= 0) end = Math.min(end, h);
    return url.slice(0, end);
  }

  private urlMatchesChildPath(url: string, childPath: string): boolean {
    return url === childPath || url.startsWith(`${childPath}/`);
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
