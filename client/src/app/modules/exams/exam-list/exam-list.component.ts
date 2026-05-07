import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService, type SelectItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { AcademicService, type AcademicYearDto } from '@app/services';
import {
  ExamDto,
  ExamService,
  type ExamStatus,
  type ExamType,
} from '@app/services';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  first_term: '1st Term',
  second_term: '2nd Term',
  mid_term: 'Mid-term',
  final: 'Final',
  unit_test: 'Unit Test',
  mock: 'Mock',
};

const STATUS_OPTIONS: SelectItem[] = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Result pending', value: 'result_pending' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
];

@Component({
  selector: 'app-exam-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    SelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TablePaginationFooterComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './exam-list.component.html',
  styleUrl: './exam-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamListComponent implements OnInit {
  private api = inject(ExamService);
  private academic = inject(AcademicService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private messages = inject(MessageService);
  private confirm = inject(ConfirmationService);

  readonly statusOptions = STATUS_OPTIONS;
  readonly examTypeLabels = EXAM_TYPE_LABELS;

  loading = signal(true);
  rows = signal<ExamDto[]>([]);
  years = signal<AcademicYearDto[]>([]);

  selectedYear = signal<number | null>(null);
  selectedStatus = signal<ExamStatus | ''>('');
  searchQuery = signal('');
  includeArchived = signal(false);
  page = signal(1);
  pageSize = signal(10);
  total = signal(0);
  totalPages = signal(1);

  readonly yearOptions = computed<SelectItem[]>(() => [
    { label: 'All academic years', value: null },
    ...this.years().map((y) => ({
      label: `${y.name ?? `Year ${y.id}`}${y.is_active ? ' (active)' : ''}`,
      value: y.id,
    })),
  ]);

  readonly counts = computed(() => {
    const data = this.rows();
    return {
      total: data.length,
      draft: data.filter((r) => r.status === 'draft').length,
      scheduled: data.filter((r) => r.status === 'scheduled').length,
      ongoing: data.filter((r) => r.status === 'ongoing').length,
      published: data.filter((r) => r.status === 'published').length,
    };
  });

  ngOnInit(): void {
    this.academic
      .listAcademicYears()
      .pipe(catchError(() => of([] as AcademicYearDto[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((years) => {
        this.years.set(years);
        const active = years.find((y) => y.is_active);
        if (active) this.selectedYear.set(active.id);
        this.load();
      });
  }

  load(): void {
    this.loading.set(true);
    const y = this.selectedYear();
    const status = this.selectedStatus();
    this.api
      .list({
        academic_year_id: y ?? undefined,
        status: status || undefined,
        q: this.searchQuery().trim() || undefined,
        include_archived: this.includeArchived(),
        page: this.page(),
        limit: this.pageSize(),
      })
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load exams',
            life: 4000,
          });
          return of({ data: [] as ExamDto[], total: 0, page: 1, limit: this.pageSize(), totalPages: 1 });
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((res) => {
        this.rows.set(res.data || []);
        this.total.set(res.total ?? (res.data?.length ?? 0));
        this.totalPages.set(Math.max(1, res.totalPages ?? 1));
      });
  }

  onPageChange(nextPage: number): void {
    this.page.set(nextPage);
    this.load();
  }

  examTypeLabel(type: ExamType): string {
    return EXAM_TYPE_LABELS[type] || type;
  }

  statusSeverity(status: ExamStatus): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'draft':
        return 'secondary';
      case 'scheduled':
        return 'info';
      case 'ongoing':
        return 'warn';
      case 'result_pending':
        return 'warn';
      case 'published':
        return 'success';
      case 'archived':
        return 'danger';
      default:
        return 'info';
    }
  }

  classCount(row: ExamDto): number {
    return row.classes ? row.classes.length : 0;
  }

  openDetail(row: ExamDto): void {
    void this.router.navigate(['/exams', row.id]);
  }

  cloneExam(row: ExamDto): void {
    this.confirm.confirm({
      header: 'Clone exam?',
      message: `A new draft will be created based on "${row.title}". You can change details before scheduling.`,
      acceptLabel: 'Clone',
      rejectLabel: 'Cancel',
      accept: () => {
        this.api.clone(row.id, {}).subscribe({
          next: (res) => {
            this.messages.add({ severity: 'success', summary: 'Cloned', detail: res.message });
            this.load();
            void this.router.navigate(['/exams', res.data.id]);
          },
          error: (e: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Clone failed',
              detail: e.error?.message || 'Failed to clone exam',
              life: 4000,
            });
          },
        });
      },
    });
  }

  archiveExam(row: ExamDto): void {
    this.confirm.confirm({
      header: 'Archive exam?',
      message: `"${row.title}" will be archived (soft-deleted). Historical data is preserved and the exam can no longer be edited.`,
      acceptLabel: 'Archive',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.archive(row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Archived', detail: 'Exam archived' });
            this.load();
          },
          error: (e: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: e.error?.message || 'Archive failed',
              life: 4000,
            });
          },
        });
      },
    });
  }
}
