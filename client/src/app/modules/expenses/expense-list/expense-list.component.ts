import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  firstValueFrom,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';

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

import { environment } from '../../../../environments/environment';
import { ConfirmDialogService } from '../../../services/confirm-dialog.service';
import { Expense, ExpenseService } from '../../../services/expense.service';
import { ToastService } from '../../../services/toast.service';

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
  selector: 'app-expense-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
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
  templateUrl: './expense-list.component.html',
  styleUrl: './expense-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly expenseApi = inject(ExpenseService);
  private readonly toast = inject(ToastService);
  private readonly messages = inject(MessageService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly rowActionMenu = viewChild<Menu>('rowActionMenu');
  private readonly receiptFileInput = viewChild<ElementRef<HTMLInputElement>>('receiptFileInput');

  rowActionMenuModel: MenuItem[] = [];

  private dialogCloseFromAction = false;

  private readonly searchInput$ = new Subject<string>();

  readonly expenses = signal<Expense[]>([]);
  readonly total = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly searchTerm = signal('');
  readonly statusFilter = signal('');
  readonly expenseTypeFilter = signal('');
  readonly sortField = signal('expense_date');
  readonly sortOrder = signal<'asc' | 'desc'>('desc');
  readonly showForm = signal(false);
  readonly editingExpense = signal<Expense | null>(null);
  readonly errorMessage = signal('');

  readonly receiptPreviewUrl = signal<string | null>(null);
  readonly selectedReceiptFile = signal<File | null>(null);
  readonly removeReceiptRequested = signal(false);

  readonly firstIndex = computed(() => Math.max(0, (this.currentPage() - 1) * this.pageSize()));
  readonly sortOrderPrime = computed(() => (this.sortOrder() === 'asc' ? 1 : -1));

  readonly expenseForm = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    expense_date: [null as Date | null, Validators.required],
    expense_type: ['', Validators.required],
    status: ['Paid', Validators.required],
  });

  readonly expenseTypeOptions = [
    'Salary',
    'Rent',
    'Electricity',
    'Water',
    'Internet',
    'Supplies',
    'Maintenance',
    'Transport',
    'Miscellaneous',
  ] as const;

  readonly statusOptions = ['Paid', 'Due', 'Other'] as const;

  readonly expenseTypeSelectItems: { label: string; value: string }[] = [
    { label: 'All types', value: '' },
    ...this.expenseTypeOptions.map((t) => ({ label: t, value: t })),
  ];

  readonly statusSelectItems: { label: string; value: string }[] = [
    { label: 'All statuses', value: '' },
    ...this.statusOptions.map((s) => ({ label: s, value: s })),
  ];

  readonly expenseTypeFormItems = this.expenseTypeOptions.map((t) => ({ label: t, value: t }));
  readonly statusFormItems = this.statusOptions.map((s) => ({ label: s, value: s }));

  readonly apiBase = environment.apiBaseUrl;

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((raw) => {
        this.searchTerm.set(raw);
        this.currentPage.set(1);
        this.loadList();
      });
  }

  attachmentFullUrl(expense: Expense): string {
    const u = expense.attachment_url;
    if (!u) return '';
    return u.startsWith('http') ? u : `${this.apiBase}${u}`;
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    const first = event.first ?? 0;
    this.pageSize.set(rows);
    this.currentPage.set(Math.floor(first / rows) + 1);
    if (event.sortField != null && String(event.sortField).trim() !== '') {
      this.sortField.set(String(event.sortField));
      this.sortOrder.set(event.sortOrder === 1 ? 'asc' : 'desc');
    }
    this.loadList();
  }

  statusSeverity(status: string): 'success' | 'warn' | 'danger' | 'secondary' {
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

  formatAmount(n: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }

  loadList(): void {
    this.isLoading.set(true);
    this.expenseApi
      .list({
        page: this.currentPage(),
        limit: this.pageSize(),
        search: this.searchTerm() || undefined,
        status: this.statusFilter() || undefined,
        expense_type: this.expenseTypeFilter() || undefined,
        sort_by: this.sortField(),
        sort_order: this.sortOrder(),
      })
      .pipe(
        catchError((e) => {
          this.toast.open(
            (e.error as { message?: string } | undefined)?.message ??
              e.message ??
              'Failed to load expenses',
            'Dismiss',
            { duration: 5000 }
          );
          return of({ data: [] as Expense[], total: 0, page: 1, limit: this.pageSize() });
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe((res) => {
        this.expenses.set(res.data);
        this.total.set(res.total);
      });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadList();
  }

  openAddModal(): void {
    this.dialogCloseFromAction = false;
    this.editingExpense.set(null);
    this.resetFormState();
    this.showForm.set(true);
    this.cdr.markForCheck();
  }

  openEditModal(expense: Expense): void {
    this.dialogCloseFromAction = false;
    this.editingExpense.set(expense);
    this.removeReceiptRequested.set(false);
    this.clearReceiptSelection(false);
    const dt = parseYmdToLocalDate(String(expense.expense_date).slice(0, 10));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.expenseForm.patchValue({
      name: expense.name,
      description: expense.description ?? '',
      amount: typeof expense.amount === 'number' ? expense.amount : Number(expense.amount),
      expense_date: dt ?? today,
      expense_type: expense.expense_type,
      status: expense.status,
    });
    this.errorMessage.set('');
    this.showForm.set(true);
    this.cdr.markForCheck();
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
    this.editingExpense.set(null);
    this.resetFormState();
  }

  cancelForm(): void {
    this.dialogCloseFromAction = true;
    this.editingExpense.set(null);
    this.resetFormState();
    this.showForm.set(false);
  }

  private resetFormState(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.expenseForm.reset({
      name: '',
      description: '',
      amount: null,
      expense_date: today,
      expense_type: '',
      status: 'Paid',
    });
    this.errorMessage.set('');
    this.removeReceiptRequested.set(false);
    this.clearReceiptSelection(true);
  }

  onChooseReceiptClick(): void {
    this.receiptFileInput()?.nativeElement.click();
  }

  onReceiptFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowed.has(file.type)) {
      this.errorMessage.set('Only JPEG, PNG, WebP, or GIF images are allowed');
      input.value = '';
      this.cdr.markForCheck();
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.errorMessage.set('Receipt file must be 2MB or smaller');
      input.value = '';
      this.cdr.markForCheck();
      return;
    }

    const prev = this.receiptPreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.selectedReceiptFile.set(file);
    this.receiptPreviewUrl.set(URL.createObjectURL(file));
    this.removeReceiptRequested.set(false);
    input.value = '';
    this.cdr.markForCheck();
  }

  onReceiptClear(): void {
    this.clearReceiptSelection(true);
    this.cdr.markForCheck();
  }

  private clearReceiptSelection(clearWidget: boolean): void {
    const prev = this.receiptPreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.receiptPreviewUrl.set(null);
    this.selectedReceiptFile.set(null);
    if (clearWidget) {
      const el = this.receiptFileInput()?.nativeElement;
      if (el) el.value = '';
    }
  }

  toggleRemoveServerReceipt(): void {
    this.removeReceiptRequested.update((v) => !v);
    if (this.removeReceiptRequested()) {
      this.clearReceiptSelection(true);
    }
  }

  existingReceiptPreviewUrl(): string | null {
    const e = this.editingExpense();
    if (!e?.attachment_url || this.removeReceiptRequested()) return null;
    return this.attachmentFullUrl(e);
  }

  onSubmit(): void {
    this.errorMessage.set('');
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      this.errorMessage.set('Please fix validation errors');
      return;
    }
    const v = this.expenseForm.getRawValue();
    const expenseDate = formatYmdForApi(v.expense_date);
    if (!expenseDate) {
      this.errorMessage.set('Expense date is required');
      return;
    }

    const editing = this.editingExpense();
    this.isSubmitting.set(true);

    if (editing) {
      const id = editing.id;
      void (async () => {
        this.errorMessage.set('');
        try {
          if (this.removeReceiptRequested() && editing.attachment_url) {
            await firstValueFrom(this.expenseApi.deleteReceipt(id));
          }
          let updated = await firstValueFrom(
            this.expenseApi.update(id, {
              name: String(v.name ?? '').trim(),
              description: v.description?.trim() ? String(v.description).trim() : null,
              amount: v.amount as number,
              expense_date: expenseDate,
              expense_type: String(v.expense_type ?? ''),
              status: String(v.status ?? ''),
            })
          );
          const file = this.selectedReceiptFile();
          if (file) {
            try {
              const up = await firstValueFrom(this.expenseApi.uploadReceipt(id, file));
              updated = up.data;
            } catch (e: unknown) {
              const msg =
                (e as { error?: { message?: string } })?.error?.message ?? 'Receipt upload failed';
              this.errorMessage.set(msg);
            }
          }
          if (!this.errorMessage()) {
            this.toast.open('Expense updated.', 'Dismiss', {
              type: 'success',
              title: 'Saved',
              duration: 4000,
            });
            this.editingExpense.set(null);
            this.resetFormState();
            this.dialogCloseFromAction = true;
            this.showForm.set(false);
            this.loadList();
          }
        } catch (e: unknown) {
          const msg =
            (e as { error?: { message?: string } })?.error?.message ?? 'Could not save changes';
          this.errorMessage.set(msg);
        } finally {
          this.isSubmitting.set(false);
        }
      })();
      return;
    }

    const file = this.selectedReceiptFile();
    let receiptUploadFailed = false;
    this.expenseApi
      .create({
        name: String(v.name ?? '').trim(),
        description: v.description?.trim() ? String(v.description).trim() : undefined,
        amount: v.amount as number,
        expense_date: expenseDate,
        expense_type: String(v.expense_type ?? ''),
        status: String(v.status ?? ''),
      })
      .pipe(
        switchMap((res) => {
          if (!file) return of(res.data);
          return this.expenseApi.uploadReceipt(res.data.id, file).pipe(
            map((r) => r.data),
            catchError((e) => {
              receiptUploadFailed = true;
              this.errorMessage.set(
                (e.error as { message?: string } | undefined)?.message ??
                  'Expense saved but receipt upload failed'
              );
              return of(res.data);
            })
          );
        }),
        finalize(() => this.isSubmitting.set(false)),
        catchError((e) => {
          this.errorMessage.set(
            (e.error as { message?: string } | undefined)?.message ?? 'Could not save expense'
          );
          return of(null);
        })
      )
      .subscribe((created) => {
        if (!created) return;
        if (receiptUploadFailed) {
          this.toast.open(this.errorMessage() || 'Receipt upload failed.', 'Dismiss', {
            type: 'warning',
            title: 'Expense saved',
            duration: 6000,
          });
        } else {
          this.toast.open('Expense recorded.', 'Dismiss', {
            type: 'success',
            title: 'Expense added',
            duration: 4000,
          });
        }
        this.resetFormState();
        this.dialogCloseFromAction = true;
        this.showForm.set(false);
        this.loadList();
      });
  }

  openRowActionMenu(event: MouseEvent, row: Expense): void {
    event.stopPropagation();
    this.rowActionMenuModel = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.openEditModal(row),
      },
      {
        label: 'Receipt',
        icon: 'pi pi-print',
        command: () => void this.router.navigate(['/expenses/receipt', row.id]),
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        styleClass: 'text-danger',
        command: () => void this.deleteExpense(row),
      },
    ];
    this.cdr.detectChanges();
    this.rowActionMenu()?.toggle(event);
  }

  async deleteExpense(row: Expense): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Delete expense',
      message: `Remove “${row.name}” (${this.formatAmount(row.amount)})?`,
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      ariaIdPrefix: 'expense-delete',
    });
    if (!ok) return;

    this.confirmDialog.setBusy(true);
    this.expenseApi.delete(row.id).subscribe({
      next: (r) => {
        this.confirmDialog.complete();
        this.messages.add({
          severity: 'success',
          summary: 'Removed',
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
            (e.error as { message?: string } | undefined)?.message ?? 'Could not delete this expense.',
          life: 5000,
        });
      },
    });
  }
}
