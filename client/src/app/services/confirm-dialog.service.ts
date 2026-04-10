import { Injectable, signal } from '@angular/core';

import type { ConfirmDialogVariant } from '../shared/confirm-dialog/confirm-dialog.component';

/**
 * Options for {@link ConfirmDialogService.confirm}. Omitted fields get sensible defaults.
 */
export interface ConfirmDialogOpenOptions {
  title: string;
  message: string;
  variant?: ConfirmDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Prefix for aria ids; auto-suffixed with a sequence if omitted. */
  ariaIdPrefix?: string;
}

/** Normalized config bound to {@link ConfirmDialogComponent} in the app shell. */
export interface ConfirmDialogConfig {
  title: string;
  message: string;
  variant: ConfirmDialogVariant;
  confirmLabel: string;
  cancelLabel: string;
  ariaIdPrefix: string;
}

/**
 * Global confirmation modal (replaces `window.confirm` for destructive and other actions).
 *
 * **Usage (async delete / destructive action):**
 * ```ts
 * const ok = await this.confirm.confirm({
 *   title: 'Delete item?',
 *   message: 'This cannot be undone.',
 *   variant: 'danger',
 *   confirmLabel: 'Delete',
 * });
 * if (!ok) return;
 * this.confirm.setBusy(true);
 * this.api.delete(id).subscribe({
 *   next: () => { this.confirm.complete(); ... },
 *   error: () => { this.confirm.complete(); ... },
 * });
 * ```
 *
 * Always call {@link complete} after the async work finishes so the dialog closes.
 * On cancel, the service clears state automatically.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  /** When non-null, {@link AppComponent} renders {@link ConfirmDialogComponent}. */
  readonly active = signal<ConfirmDialogConfig | null>(null);
  /** Disables buttons and shows spinner on the confirm button while true. */
  readonly busy = signal(false);

  private resolvePending: ((value: boolean) => void) | null = null;
  private seq = 0;

  /**
   * Opens the dialog. Resolves `false` if the user dismisses. Resolves `true` on confirm;
   * the dialog stays open until {@link complete} — use {@link setBusy} during API calls.
   */
  confirm(options: ConfirmDialogOpenOptions): Promise<boolean> {
    if (this.resolvePending) {
      this.resolvePending(false);
      this.resolvePending = null;
    }
    this.active.set(null);
    this.busy.set(false);

    return new Promise((resolve) => {
      this.resolvePending = resolve;
      this.active.set(this.normalize(options));
    });
  }

  setBusy(value: boolean): void {
    this.busy.set(value);
  }

  /**
   * Clears the dialog. Call after success or error when the user had confirmed.
   */
  complete(): void {
    this.active.set(null);
    this.busy.set(false);
    this.resolvePending = null;
  }

  /** Called from {@link AppComponent} when the dialog emits `closed`. */
  onDialogClosed(confirmed: boolean): void {
    const resolve = this.resolvePending;
    this.resolvePending = null;

    if (!confirmed) {
      this.active.set(null);
      this.busy.set(false);
      resolve?.(false);
      return;
    }

    resolve?.(true);
    // Keep `active` so the dialog stays mounted; caller runs async work + `complete()`.
  }

  private normalize(options: ConfirmDialogOpenOptions): ConfirmDialogConfig {
    const variant = options.variant ?? 'primary';
    const prefix =
      options.ariaIdPrefix?.trim() || `app-confirm-${++this.seq}`;
    return {
      title: options.title,
      message: options.message,
      variant,
      confirmLabel: options.confirmLabel ?? 'Confirm',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      ariaIdPrefix: prefix,
    };
  }
}
