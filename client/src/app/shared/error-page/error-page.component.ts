import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

type ErrorCode = '404' | '500' | '403' | 'offline';

const DEFAULT_COPY: Record<ErrorCode, { title: string; message: string; icon: string }> = {
  '404': {
    title: 'Page not found',
    message: 'The page you are looking for does not exist or has been moved.',
    icon: 'bi-signpost-2',
  },
  '500': {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again or contact support.',
    icon: 'bi-exclamation-triangle',
  },
  '403': {
    title: 'Access denied',
    message: 'You do not have permission to view this page.',
    icon: 'bi-shield-x',
  },
  offline: {
    title: 'You are offline',
    message: 'Check your internet connection and try again.',
    icon: 'bi-wifi-off',
  },
};

@Component({
  selector: 'app-error-page',
  standalone: true,
  imports: [ButtonModule, RouterLink],
  template: `
    <div class="d-flex flex-column align-items-center justify-content-center text-center" style="min-height: 60vh; padding: 2rem;">
      <span class="bi" [class]="iconClass()" style="font-size: 3rem; color: var(--p-primary-color); margin-bottom: 1rem;"></span>
      <h2 style="font-size: 1.4rem; font-weight: 600;">{{ resolvedTitle() }}</h2>
      <p class="text-secondary mt-2" style="max-width: 420px;">{{ resolvedMessage() }}</p>
      <p-button [label]="actionLabel()" [routerLink]="actionRoute()" styleClass="mt-4" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorPageComponent {
  readonly code = input<ErrorCode>('500');
  readonly title = input<string | null>(null);
  readonly message = input<string | null>(null);
  readonly actionLabel = input('Go to dashboard');
  readonly actionRoute = input('/home');

  readonly resolvedTitle = computed(() => this.title() ?? DEFAULT_COPY[this.code()].title);
  readonly resolvedMessage = computed(() => this.message() ?? DEFAULT_COPY[this.code()].message);
  readonly iconClass = computed(() => DEFAULT_COPY[this.code()].icon);
}
