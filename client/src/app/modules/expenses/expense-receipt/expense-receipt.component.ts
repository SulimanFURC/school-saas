import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { environment } from '../../../../environments/environment';
import { BrandingService } from '../../../services/branding.service';
import { Expense, ExpenseService } from '../../../services/expense.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-expense-receipt',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DatePipe,
    ButtonModule,
    ProgressSpinnerModule,
    MessageModule,
    TagModule,
  ],
  templateUrl: './expense-receipt.component.html',
  styleUrl: './expense-receipt.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseReceiptComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly expenseApi = inject(ExpenseService);
  readonly branding = inject(BrandingService);
  private readonly toast = inject(ToastService);

  readonly expense = signal<Expense | null>(null);
  readonly loading = signal(true);

  readonly apiBase = environment.apiBaseUrl;

  readonly attachmentUrl = computed(() => {
    const e = this.expense();
    const u = e?.attachment_url;
    if (!u) return null;
    return u.startsWith('http') ? u : `${this.apiBase}${u}`;
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.expenseApi
      .getById(id)
      .pipe(
        catchError((e) => {
          this.toast.open(
            (e.error as { message?: string } | undefined)?.message ?? 'Failed to load expense',
            'Dismiss',
            { duration: 5000 }
          );
          return of(null);
        })
      )
      .subscribe((row) => {
        this.expense.set(row);
        this.loading.set(false);
      });
  }

  statusSeverity(status: string | undefined): 'success' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'Paid':
        return 'success';
      case 'Due':
        return 'warn';
      case 'Other':
        return 'secondary';
      default:
        return 'secondary';
    }
  }

  formatMoney(n: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }

  printReceipt(): void {
    window.print();
  }
}
