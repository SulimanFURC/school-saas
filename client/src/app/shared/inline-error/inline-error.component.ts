import { ChangeDetectionStrategy, Component, output, input } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-inline-error',
  standalone: true,
  imports: [ButtonModule],
  template: `
    <div class="d-flex align-items-center gap-2 p-3 border rounded text-danger" style="background: #fff5f5;">
      <span class="bi bi-exclamation-circle"></span>
      <span style="font-size: 13px;">{{ message() }}</span>
      <p-button
        label="Retry"
        size="small"
        [text]="true"
        styleClass="ms-auto"
        (onClick)="retry.emit()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineErrorComponent {
  readonly message = input('Failed to load data.');
  readonly retry = output<void>();
}
