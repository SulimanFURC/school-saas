import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import Toast from 'bootstrap/js/dist/toast';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

type ResolvedToastVariant = 'legacy' | 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface ToastOptions {
  /** ms; 0 = no autohide */
  duration?: number;
  /** Visual variant; omit with no title for legacy compact toast */
  type?: ToastVariant;
  /** Optional heading (message becomes description) */
  title?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly doc = inject(DOCUMENT);

  /**
   * Show a toast. Pass `title` and/or `type` (other than default) for Ark-style rich toasts
   * with icon and left accent; plain `message` only keeps the original compact style.
   */
  open(message: string, action: string = 'Dismiss', options?: ToastOptions): void {
    const duration = options?.duration ?? 5000;
    const container = this.ensureContainer();
    const variant: ResolvedToastVariant = this.resolveVariant(options);

    const el = this.doc.createElement('div');
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');

    el.classList.add('app-toast-ark');

    if (variant === 'legacy') {
      el.classList.add('toast', 'border-0', 'p-0', 'mb-0', 'app-toast--basic');
      el.innerHTML = `
        <div class="app-toast__panel app-toast__panel--basic position-relative">
          <div class="app-toast__stack">
            <p class="app-toast__title app-toast__title--solo mb-0">${this.escapeHtml(message)}</p>
          </div>
          <button type="button" class="btn-close btn-close-sm app-toast__close" data-bs-dismiss="toast" aria-label="${this.escapeHtml(action)}"></button>
        </div>
      `;
    } else {
      const { panelModifier, icon } = this.variantTokens(variant);
      const title = options?.title;
      el.classList.add('toast', 'border-0', 'p-0', 'mb-0', 'app-toast--rich');
      const titleHtml = title
        ? `<p class="app-toast__title mb-0">${this.escapeHtml(title)}</p>`
        : '';
      const descClass = title ? 'app-toast__desc' : 'app-toast__desc app-toast__desc--solo';
      el.innerHTML = `
        <div class="app-toast__panel ${panelModifier} position-relative">
          <i class="bi ${icon} app-toast__icon flex-shrink-0" aria-hidden="true"></i>
          <div class="app-toast__stack flex-grow-1 pe-4">
            ${titleHtml}
            <p class="${descClass} mb-0">${this.escapeHtml(message)}</p>
          </div>
          <button type="button" class="btn-close btn-close-sm app-toast__close" data-bs-dismiss="toast" aria-label="${this.escapeHtml(action)}"></button>
        </div>
      `;
    }

    container.appendChild(el);

    const instance = Toast.getOrCreateInstance(el, {
      autohide: duration > 0,
      delay: duration > 0 ? duration : 100000000,
    });

    el.addEventListener(
      'hidden.bs.toast',
      () => {
        el.remove();
      },
      { once: true }
    );

    instance.show();
  }

  /** Shorthand for success (e.g. saves, registration). */
  success(description: string, title?: string, duration = 5000): void {
    this.open(description, 'Dismiss', { type: 'success', title, duration });
  }

  /** Shorthand for errors from API or validation. */
  error(description: string, title?: string, duration = 6000): void {
    this.open(description, 'Dismiss', { type: 'error', title, duration });
  }

  warning(description: string, title?: string, duration = 5000): void {
    this.open(description, 'Dismiss', { type: 'warning', title, duration });
  }

  info(description: string, title?: string, duration = 5000): void {
    this.open(description, 'Dismiss', { type: 'info', title, duration });
  }

  private resolveVariant(options?: ToastOptions): ResolvedToastVariant {
    const t = options?.type;
    const hasTitle = !!options?.title?.trim();
    if (t === undefined || t === 'default') {
      if (!hasTitle) {
        return 'legacy';
      }
      return 'neutral';
    }
    return t;
  }

  private variantTokens(variant: Exclude<ResolvedToastVariant, 'legacy'>): {
    panelModifier: string;
    icon: string;
  } {
    const map: Record<Exclude<ResolvedToastVariant, 'legacy'>, { panelModifier: string; icon: string }> = {
      success: { panelModifier: 'app-toast__panel--success', icon: 'bi-check-circle-fill' },
      error: { panelModifier: 'app-toast__panel--error', icon: 'bi-x-circle-fill' },
      warning: { panelModifier: 'app-toast__panel--warning', icon: 'bi-exclamation-triangle-fill' },
      info: { panelModifier: 'app-toast__panel--info', icon: 'bi-info-circle-fill' },
      neutral: { panelModifier: 'app-toast__panel--neutral', icon: 'bi-bell-fill' },
    };
    return map[variant];
  }

  private ensureContainer(): HTMLElement {
    const id = 'app-toast-container';
    let el = this.doc.getElementById(id);
    if (!el) {
      el = this.doc.createElement('div');
      el.id = id;
      el.className = 'toast-container app-toast-container position-fixed bottom-0 end-0 p-3';
      el.style.zIndex = '1090';
      this.doc.body.appendChild(el);
    }
    return el;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
