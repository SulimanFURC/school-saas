import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';

import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';
import { ConfirmDialogService } from '../../../services/confirm-dialog.service';
import { FeeCollection, FeeService } from '../../../services/fee.service';
import {
  StudentService,
  resolveStudentDisplayName,
} from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-fee-collection',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    TablePaginationFooterComponent,
  ],
  templateUrl: './fee-collection.component.html',
  styleUrl: './fee-collection.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeCollectionComponent {
  private readonly fb = inject(FormBuilder);
  private readonly feeApi = inject(FeeService);
  private readonly studentApi = inject(StudentService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly fees = signal<FeeCollection[]>([]);
  readonly total = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly searchTerm = signal('');
  readonly statusFilter = signal('');
  readonly feeTypeFilter = signal('');
  readonly showForm = signal(false);
  readonly editingFee = signal<FeeCollection | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly isLookupLoading = signal(false);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize())))
  );

  readonly lookupAdmission = this.fb.nonNullable.control('');

  readonly feeForm = this.fb.group({
    student_id: ['', Validators.required],
    fee_type: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    collection_date: ['', Validators.required],
    payment_method: ['', Validators.required],
    status: ['Paid', Validators.required],
    payment_reference_number: [''],
    notes: [''],
  });

  readonly displayRegistration = signal('');
  readonly displayStudentName = signal('');
  readonly displayClassName = signal('');

  readonly feeTypeOptions = [
    'Tuition',
    'Annual',
    'Library',
    'Transport',
    'Exam',
    'Miscellaneous',
  ] as const;

  readonly paymentMethodOptions = [
    'Cash',
    'Credit Card',
    'Debit Card',
    'Cheque',
    'Bank Transfer',
    'Online',
  ] as const;

  readonly statusOptions = ['Paid', 'Pending', 'Unpaid'] as const;

  constructor() {
    this.loadList();
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'Paid':
        return 'badge bg-success';
      case 'Pending':
        return 'badge bg-warning text-dark';
      case 'Unpaid':
        return 'badge bg-danger';
      default:
        return 'badge bg-secondary';
    }
  }

  formatAmount(n: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }

  loadList(): void {
    this.isLoading.set(true);
    this.feeApi
      .getFees({
        page: this.currentPage(),
        limit: this.pageSize(),
        search: this.searchTerm() || undefined,
        status: this.statusFilter() || undefined,
        fee_type: this.feeTypeFilter() || undefined,
      })
      .pipe(
        catchError((e) => {
          this.toast.open(
            (e.error as { message?: string } | undefined)?.message ??
              e.message ??
              'Failed to load fees',
            'Dismiss',
            { duration: 5000 }
          );
          return of({ data: [] as FeeCollection[], total: 0, page: 1, limit: this.pageSize() });
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe((res) => {
        this.fees.set(res.data);
        this.total.set(res.total);
      });
  }

  applySearch(): void {
    this.currentPage.set(1);
    this.loadList();
  }

  setPage(p: number): void {
    this.currentPage.set(p);
    this.loadList();
  }

  setPageSize(n: number): void {
    this.pageSize.set(n);
    this.currentPage.set(1);
    this.loadList();
  }

  openAddModal(): void {
    this.editingFee.set(null);
    this.resetFormState();
    this.showForm.set(true);
  }

  openEditModal(fee: FeeCollection): void {
    this.editingFee.set(fee);
    this.lookupAdmission.setValue(fee.registration_no);
    this.displayRegistration.set(fee.registration_no);
    this.displayStudentName.set(fee.student_name);
    this.displayClassName.set(fee.class_name ?? '—');
    this.feeForm.patchValue({
      student_id: fee.student_id,
      fee_type: fee.fee_type,
      amount: typeof fee.amount === 'number' ? fee.amount : Number(fee.amount),
      collection_date: fee.collection_date,
      payment_method: fee.payment_method,
      status: fee.status,
      payment_reference_number: fee.payment_reference_number ?? '',
      notes: fee.notes ?? '',
    });
    this.successMessage.set('');
    this.errorMessage.set('');
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingFee.set(null);
    this.resetFormState();
  }

  private resetFormState(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.feeForm.reset({
      student_id: '',
      fee_type: '',
      amount: null,
      collection_date: today,
      payment_method: '',
      status: 'Paid',
      payment_reference_number: '',
      notes: '',
    });
    this.lookupAdmission.setValue('');
    this.displayRegistration.set('');
    this.displayStudentName.set('');
    this.displayClassName.set('');
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  lookupStudent(): void {
    const raw = this.lookupAdmission.value.trim();
    if (!raw) {
      this.errorMessage.set('Enter a registration number');
      return;
    }
    this.isLookupLoading.set(true);
    this.errorMessage.set('');
    this.studentApi
      .lookupByAdmission(raw)
      .pipe(
        finalize(() => this.isLookupLoading.set(false)),
        catchError(() => of(null))
      )
      .subscribe((row) => {
        if (!row) {
          this.errorMessage.set('No student found or no active enrollment');
          this.feeForm.patchValue({ student_id: '' });
          this.displayRegistration.set('');
          this.displayStudentName.set('');
          this.displayClassName.set('');
          return;
        }
        this.feeForm.patchValue({ student_id: row.id });
        this.displayRegistration.set(row.admission_no);
        this.displayStudentName.set(resolveStudentDisplayName(row as unknown as Record<string, unknown>));
        this.displayClassName.set(row.class_name ?? '—');
      });
  }

  onSubmit(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    if (this.feeForm.invalid) {
      this.feeForm.markAllAsTouched();
      this.errorMessage.set('Please fix validation errors');
      return;
    }
    const v = this.feeForm.getRawValue();
    const editing = this.editingFee();
    if (!editing && !v.student_id) {
      this.errorMessage.set('Look up a student before saving');
      return;
    }

    this.isSubmitting.set(true);
    if (editing) {
      this.feeApi
        .updateFee(editing.id, {
          fee_type: String(v.fee_type ?? ''),
          amount: v.amount as number,
          collection_date: String(v.collection_date ?? ''),
          payment_method: String(v.payment_method ?? ''),
          status: String(v.status ?? ''),
          payment_reference_number: v.payment_reference_number || undefined,
          notes: v.notes || undefined,
        })
        .pipe(
          finalize(() => this.isSubmitting.set(false)),
          catchError((e) => {
            this.errorMessage.set(
              (e.error as { message?: string } | undefined)?.message ?? 'Update failed'
            );
            return of(null);
          })
        )
        .subscribe((updated) => {
          if (!updated) return;
          this.successMessage.set('Fee updated successfully');
          this.showForm.set(false);
          this.editingFee.set(null);
          this.resetFormState();
          this.loadList();
        });
      return;
    }

    this.feeApi
      .createFee({
        student_id: String(v.student_id ?? ''),
        fee_type: String(v.fee_type ?? ''),
        amount: v.amount as number,
        collection_date: String(v.collection_date ?? ''),
        payment_method: String(v.payment_method ?? ''),
        status: String(v.status ?? ''),
        payment_reference_number: v.payment_reference_number || undefined,
        notes: v.notes || undefined,
      })
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        catchError((e) => {
          this.errorMessage.set(
            (e.error as { message?: string } | undefined)?.message ?? 'Could not save fee'
          );
          return of(null);
        })
      )
      .subscribe((res) => {
        if (!res) return;
        this.successMessage.set(
          `Fee collected successfully! Invoice: ${res.invoice_number || res.data.invoice_number}`
        );
        this.resetFormState();
        this.showForm.set(false);
        this.loadList();
      });
  }

  async deleteFee(fee: FeeCollection): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Delete fee record',
      message: `Remove invoice ${fee.invoice_number} for ${fee.student_name}?`,
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      ariaIdPrefix: 'fee-delete',
    });
    if (!ok) return;

    this.confirmDialog.setBusy(true);
    this.feeApi.deleteFee(fee.id).subscribe({
      next: (r) => {
        this.confirmDialog.complete();
        this.toast.open(r.message, 'Dismiss', { duration: 4000 });
        this.loadList();
      },
      error: (e) => {
        this.confirmDialog.complete();
        this.toast.open(
          (e.error as { message?: string } | undefined)?.message ?? 'Delete failed',
          'Dismiss',
          { duration: 5000 }
        );
      },
    });
  }

}
