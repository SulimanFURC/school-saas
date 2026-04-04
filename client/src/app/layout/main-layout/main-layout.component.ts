import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { TENANT_NAV_CONFIG, type NavItemConfig } from '../../config/nav.config';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';
import { FeatureService } from '../../services/feature.service';
import { AppHeaderActionsComponent } from '../app-header-actions/app-header-actions.component';

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    AppHeaderActionsComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private router = inject(Router);
  private breakpoint = inject(BreakpointObserver);
  readonly auth = inject(AuthService);
  private features = inject(FeatureService);
  readonly branding = inject(BrandingService);

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

  readonly isMobile = toSignal(
    this.breakpoint.observe('(max-width: 959.98px)').pipe(map((r) => r.matches)),
    { initialValue: false }
  );

  readonly navItems = computed((): NavItemConfig[] => {
    const enabled = this.features.enabled();
    return TENANT_NAV_CONFIG.filter(
      (item) => !item.moduleKey || enabled.has(item.moduleKey)
    );
  });

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.resolveTitle()),
      startWith(this.resolveTitle())
    ),
    { initialValue: this.resolveTitle() }
  );

  private resolveTitle(): string {
    let r = this.router.routerState.root;
    while (r.firstChild) {
      r = r.firstChild;
    }
    const title = r.snapshot?.data?.['title'] as string | undefined;
    return title ?? 'School SaaS';
  }
}
