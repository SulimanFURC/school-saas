import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { ExamService, type GradingSchemeDto } from '@app/services';
import { TablePaginationFooterComponent } from '../../../shared/table-pagination-footer/table-pagination-footer.component';

@Component({
  selector: 'app-grading-scheme-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CardModule,
    ButtonModule,
    TableModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TablePaginationFooterComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './grading-scheme-list.component.html',
  styleUrl: './grading-scheme-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GradingSchemeListComponent implements OnInit {
  private api = inject(ExamService);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirm = inject(ConfirmationService);

  schemes = signal<GradingSchemeDto[]>([]);
  loading = signal(true);
  page = signal(1);
  pageSize = signal(10);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.schemes().length / this.pageSize())));
  readonly pagedSchemes = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.schemes().slice(start, start + this.pageSize());
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .listGradingSchemes(true)
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load grading schemes',
          });
          return of({ data: [] as GradingSchemeDto[] });
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((res) => this.schemes.set(res.data));
  }

  onPageChange(nextPage: number): void {
    this.page.set(nextPage);
  }

  archive(row: GradingSchemeDto): void {
    if (row.archived_at) return;
    this.confirm.confirm({
      header: 'Archive grading scheme?',
      message: `"${row.name}" will be archived. Existing exams using it remain unaffected.`,
      acceptLabel: 'Archive',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.archiveGradingScheme(row.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Archived', detail: 'Scheme archived' });
            this.load();
          },
          error: (e: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: e.error?.message || 'Archive failed',
            });
          },
        });
      },
    });
  }

  edit(row: GradingSchemeDto): void {
    void this.router.navigate(['/exams/grading-schemes', row.id, 'edit']);
  }
}
