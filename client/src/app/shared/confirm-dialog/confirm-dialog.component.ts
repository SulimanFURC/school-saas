import { Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';

export type ConfirmDialogVariant = 'danger' | 'primary';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  private host = inject(ElementRef<HTMLElement>);

  /** Dialog title (short). */
  title = input.required<string>();
  /** Body copy (plain text). */
  message = input.required<string>();
  confirmLabel = input<string>('Confirm');
  cancelLabel = input<string>('Cancel');
  variant = input<ConfirmDialogVariant>('primary');
  /** When true, both actions disabled and confirm shows loading state. */
  busy = input(false);
  /** Stable id prefix for aria (unique per open instance). */
  ariaIdPrefix = input<string>('app-confirm');

  /** `true` = user confirmed; `false` = cancel, backdrop, or X. */
  closed = output<boolean>();

  constructor() {
    afterNextRender(() => {
      const root = this.host.nativeElement.querySelector(
        '[data-confirm-dialog-initial-focus]'
      ) as HTMLElement | null;
      root?.focus();
    });
  }

  cancel(): void {
    if (this.busy()) return;
    this.closed.emit(false);
  }

  confirm(): void {
    if (this.busy()) return;
    this.closed.emit(true);
  }

  onModalRootClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) {
      this.cancel();
    }
  }
}
