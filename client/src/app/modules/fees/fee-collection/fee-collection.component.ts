import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, finalize, of, Subject } from 'rxjs';

import { MenuItem, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { Menu, MenuModule } from 'primeng/menu';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';

import { ConfirmDialogService } from '@app/services';
import { FeeCollection, FeeService } from '@app/services';
import {
  StudentService,
  resolveStudentDisplayName,
} from '@app/services';
import { ToastService } from '@app/services';

function parseYmdToLocalDate(ymd: string): Date | null {
  const parts = ymd.trim().split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatYmdForApi(v: Date | string | null | undefined): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    const mo = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const s = String(v).trim();
  return s ? s.slice(0, 10) : '';
}

@Component({
  selector: 'app-fee-collection',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    MenuModule,
    InputTextModule,
    SelectModule,
    IconFieldModule,
    InputIconModule,
    DialogModule,
    DatePickerModule,
    InputNumberModule,
    Textarea,
    TagModule,
    MessageModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './fee-collection.component.html',
  styleUrl: './fee-collection.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeCollectionComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly feeApi = inject(FeeService);
  private readonly studentApi = inject(StudentService);
  private readonly toast = inject(ToastService);
  private readonly messages = inject(MessageService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly rowActionMenu = viewChild<Menu>('rowActionMenu');

  /** Bound to popup `p-menu`; refreshed per row before opening (OnPush). */
  rowActionMenuModel: MenuItem[] = [];

  private readonly searchInput$ = new Subject<string>();
  /** When true, the next dialog `visibleChange(false)` is from our code, not the user dismissing. */
  private dialogCloseFromAction = false;

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
  readonly errorMessage = signal('');
  readonly isLookupLoading = signal(false);

  readonly firstIndex = computed(() => Math.max(0, (this.currentPage() - 1) * this.pageSize()));

  readonly lookupAdmission = this.fb.nonNullable.control('');

  readonly feeForm = this.fb.group({
    student_id: ['', Validators.required],
    fee_type: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    collection_date: [null as Date | null, Validators.required],
    payment_method: ['', Validators.required],
    status: ['Paid', Validators.required],
    payment_reference_number: [''],
    notes: [''],
  });

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

  readonly feeTypeSelectItems: { label: string; value: string }[] = [
    { label: 'All types', value: '' },
    ...this.feeTypeOptions.map((t) => ({ label: t, value: t })),
  ];

  readonly statusSelectItems: { label: string; value: string }[] = [
    { label: 'All statuses', value: '' },
    ...this.statusOptions.map((s) => ({ label: s, value: s })),
  ];

  readonly feeTypeFormItems = this.feeTypeOptions.map((t) => ({ label: t, value: t }));
  readonly paymentMethodFormItems = this.paymentMethodOptions.map((m) => ({ label: m, value: m }));
  readonly statusFormItems = this.statusOptions.map((s) => ({ label: s, value: s }));

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((raw) => {
        this.searchTerm.set(raw);
        this.currentPage.set(1);
        this.loadList();
      });
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    const first = event.first ?? 0;
    const nextPage = Math.floor(first / rows) + 1;
    this.pageSize.set(rows);
    this.currentPage.set(nextPage);
    this.loadList();
  }

  statusSeverity(status: string): 'success' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'Paid':
        return 'success';
      case 'Pending':
        return 'warn';
      case 'Unpaid':
        return 'danger';
      default:
        return 'secondary';
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

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadList();
  }

  openAddModal(): void {
    this.dialogCloseFromAction = false;
    this.editingFee.set(null);
    this.resetFormState();
    this.showForm.set(true);
  }

  openEditModal(fee: FeeCollection): void {
    this.dialogCloseFromAction = false;
    this.editingFee.set(fee);
    this.lookupAdmission.setValue(fee.registration_no);
    this.displayStudentName.set(fee.student_name);
    this.displayClassName.set(fee.class_name ?? '—');
    const collDate = parseYmdToLocalDate(String(fee.collection_date).slice(0, 10));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.feeForm.patchValue({
      student_id: fee.student_id,
      fee_type: fee.fee_type,
      amount: typeof fee.amount === 'number' ? fee.amount : Number(fee.amount),
      collection_date: collDate ?? today,
      payment_method: fee.payment_method,
      status: fee.status,
      payment_reference_number: fee.payment_reference_number ?? '',
      notes: fee.notes ?? '',
    });
    this.errorMessage.set('');
    this.showForm.set(true);
  }

  onDialogVisibility(visible: boolean): void {
    if (visible) {
      this.showForm.set(true);
      return;
    }
    if (this.dialogCloseFromAction) {
      this.dialogCloseFromAction = false;
      this.showForm.set(false);
      return;
    }
    this.showForm.set(false);
    this.editingFee.set(null);
    this.resetFormState();
  }

  cancelForm(): void {
    this.dialogCloseFromAction = true;
    this.editingFee.set(null);
    this.resetFormState();
    this.showForm.set(false);
  }

  private resetFormState(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
    this.displayStudentName.set('');
    this.displayClassName.set('');
    this.errorMessage.set('');
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
          this.displayStudentName.set('');
          this.displayClassName.set('');
          return;
        }
        this.feeForm.patchValue({ student_id: row.id });
        this.displayStudentName.set(resolveStudentDisplayName(row as unknown as Record<string, unknown>));
        this.displayClassName.set(row.class_name ?? '—');
      });
  }

  onSubmit(): void {
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

    const collectionDate = formatYmdForApi(v.collection_date);
    if (!collectionDate) {
      this.errorMessage.set('Collection date is required');
      return;
    }

    this.isSubmitting.set(true);
    if (editing) {
      this.feeApi
        .updateFee(editing.id, {
          fee_type: String(v.fee_type ?? ''),
          amount: v.amount as number,
          collection_date: collectionDate,
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
          this.toast.open('Changes saved.', 'Dismiss', {
            type: 'success',
            title: 'Fee updated',
            duration: 4000,
          });
          this.editingFee.set(null);
          this.resetFormState();
          this.dialogCloseFromAction = true;
          this.showForm.set(false);
          this.loadList();
        });
      return;
    }

    this.feeApi
      .createFee({
        student_id: String(v.student_id ?? ''),
        fee_type: String(v.fee_type ?? ''),
        amount: v.amount as number,
        collection_date: collectionDate,
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
        const inv = res.invoice_number ?? res.data?.invoice_number ?? '';
        this.toast.open(
          inv ? `Invoice ${inv} has been recorded.` : 'The fee payment has been recorded.',
          'Dismiss',
          { type: 'success', title: 'Fee collected', duration: 5000 }
        );
        this.resetFormState();
        this.dialogCloseFromAction = true;
        this.showForm.set(false);
        this.loadList();
      });
  }

  openRowActionMenu(event: MouseEvent, fee: FeeCollection): void {
    event.stopPropagation();
    this.rowActionMenuModel = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.openEditModal(fee),
      },
      {
        label: 'Receipt',
        icon: 'pi pi-file',
        command: () => void this.router.navigate(['/fees/receipt', fee.student_id]),
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        styleClass: 'fee-row-actions-menu__item--danger',
        command: () => void this.deleteFee(fee),
      },
    ];
    this.cdr.detectChanges();
    this.rowActionMenu()?.toggle(event);
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
        this.messages.add({
          severity: 'success',
          summary: 'Fee record removed',
          detail: r.message,
          life: 4000,
        });
        this.loadList();
      },
      error: (e) => {
        this.confirmDialog.complete();
        this.messages.add({
          severity: 'error',
          summary: 'Delete failed',
          detail:
            (e.error as { message?: string } | undefined)?.message ?? 'Could not delete this fee record.',
          life: 5000,
        });
      },
    });
  }
}
