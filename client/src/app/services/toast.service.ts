import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import Toast from 'bootstrap/js/dist/toast';

export interface ToastOptions {
  /** ms; 0 = no autohide */
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly doc = inject(DOCUMENT);

  /**
   * SnackBar-compatible API: show message with optional action label (shown as dismiss).
   */
  open(message: string, action: string = 'Dismiss', options?: ToastOptions): void {
    const duration = options?.duration ?? 5000;
    const container = this.ensureContainer();

    const el = this.doc.createElement('div');
    el.className = 'toast align-items-center text-bg-secondary border-0 shadow';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');

    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${this.escapeHtml(message)}</div>
        <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="${this.escapeHtml(action)}"></button>
      </div>
    `;

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

  private ensureContainer(): HTMLElement {
    const id = 'app-toast-container';
    let el = this.doc.getElementById(id);
    if (!el) {
      el = this.doc.createElement('div');
      el.id = id;
      el.className = 'toast-container position-fixed bottom-0 end-0 p-3';
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
