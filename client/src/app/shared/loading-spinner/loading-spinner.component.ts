import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [ProgressSpinnerModule],
  template: `
    <div class="d-flex flex-column align-items-center justify-content-center" style="min-height: 180px;">
      <p-progressSpinner [style]="spinnerStyle()" strokeWidth="4" />
      @if (message()) {
        <span class="mt-2 text-secondary" style="font-size: 13px;">{{ message() }}</span>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingSpinnerComponent {
  readonly message = input('Loading...');
  readonly size = input<SpinnerSize>('md');

  readonly spinnerStyle = computed<Record<string, string>>(() => {
    const sizePx = this.size() === 'sm' ? 32 : this.size() === 'lg' ? 64 : 48;
    return { width: `${sizePx}px`, height: `${sizePx}px` };
  });
}
