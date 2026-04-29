import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { ExamService, type MyExamSummary } from '../../../services/exam.service';

@Component({
  selector: 'app-student-exams',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './student-exams.component.html',
  styleUrl: './student-exams.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentExamsComponent implements OnInit {
  private api = inject(ExamService);
  private router = inject(Router);
  private messages = inject(MessageService);

  loading = signal(true);
  rows = signal<MyExamSummary[]>([]);

  ngOnInit(): void {
    this.api
      .myExams()
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
    void this.router.navigate(['/my-exams', row.id]);
  }

  downloadAdmit(row: MyExamSummary): void {
    this.fetchAndSave(this.api.studentAdmitCardUrl(row.id), `admit-card-${row.id}.pdf`);
  }

  downloadResult(row: MyExamSummary): void {
    this.fetchAndSave(this.api.studentResultCardUrl(row.id), `result-card-${row.id}.pdf`);
  }

  private fetchAndSave(url: string, name: string): void {
    const token = localStorage.getItem('school_saas_token');
    const sub = localStorage.getItem('school_saas_subdomain');
    if (!token) return;
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(sub ? { 'x-tenant-id': sub } : {}),
      },
    }).then(async (resp) => {
      if (!resp.ok) {
        let msg = resp.statusText;
        try {
          const j = await resp.json();
          msg = j.message || msg;
        } catch {
          /* ignore */
        }
        this.messages.add({ severity: 'error', summary: 'Download failed', detail: msg });
        return;
      }
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
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
