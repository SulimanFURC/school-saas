import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConfirmDialogService } from '@app/services';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialogComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'client';
  readonly confirmDialog = inject(ConfirmDialogService);
}
