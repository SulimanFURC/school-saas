import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { ExamService, type MyExamSummary } from '@app/services';

@Component({
  selector: 'app-teacher-exams',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CardModule,
    ButtonModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './teacher-exams.component.html',
  styleUrl: './teacher-exams.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherExamsComponent implements OnInit {
  private api = inject(ExamService);
  private router = inject(Router);
  private messages = inject(MessageService);

  loading = signal(true);
  rows = signal<MyExamSummary[]>([]);

  ngOnInit(): void {
    this.api
      .teacherListMyExams()
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load exams',
          });
          return of({ data: [] as MyExamSummary[] });
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((res) => this.rows.set(res.data));
  }

  open(row: MyExamSummary): void {
    void this.router.navigate(['/teachers/exams', row.id]);
  }

  statusSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'scheduled':
        return 'info';
      case 'ongoing':
      case 'result_pending':
        return 'warn';
      case 'published':
        return 'success';
      case 'archived':
        return 'danger';
      default:
        return 'secondary';
    }
  }
}
