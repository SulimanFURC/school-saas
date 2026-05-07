import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-form-shell',
  standalone: true,
  templateUrl: './form-shell.component.html',
  styleUrl: './form-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormShellComponent {
  loading = input(false);
}
