import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import {
  ExamService,
  type MyExamTimetableEntry,
  type MyResultData,
  type RecheckRequestDto,
} from '../../../services/exam.service';

interface ExamHeader {
  id: string;
  title: string;
  exam_type: string;
  start_date: string;
  end_date: string;
  timetable_finalized_at?: string | null;
  published_at?: string | null;
}

@Component({
  selector: 'app-student-exam-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    DialogModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './student-exam-detail.component.html',
  styleUrl: './student-exam-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentExamDetailComponent implements OnInit {
  private api = inject(ExamService);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);

  examId = signal<string>('');
  loading = signal(true);
  loadingResult = signal(false);

  examHeader = signal<ExamHeader | null>(null);
  timetable = signal<MyExamTimetableEntry[]>([]);
  result = signal<MyResultData | null>(null);
  myRechecks = signal<RecheckRequestDto[]>([]);

  recheckOpen = signal(false);
  recheckPaperId = signal<string | null>(null);
  recheckComment = signal('');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id) return;
    this.examId.set(id);
    this.loadTimetable();
    this.loadRechecks();
  }

  loadTimetable(): void {
    this.loading.set(true);
    this.api
      .myTimetable(this.examId())
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load timetable',
          });
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((res) => {
        if (!res) return;
        this.examHeader.set(res.exam);
        this.timetable.set(res.data);
        if (res.exam.published_at) this.loadResult();
      });
  }

  loadResult(): void {
    this.loadingResult.set(true);
    this.api
      .myResult(this.examId())
      .pipe(
        catchError(() => of(null)),
        finalize(() => this.loadingResult.set(false))
      )
      .subscribe((res) => {
        if (res) this.result.set(res.data);
      });
  }

  loadRechecks(): void {
    this.api.myRechecks().subscribe({
      next: (res) => {
        const matching = res.data.filter((r) => r.exam?.id === this.examId() || (!r.exam && r));
        this.myRechecks.set(matching);
      },
    });
  }

  openRecheck(paperId: string): void {
    this.recheckPaperId.set(paperId);
    this.recheckComment.set('');
    this.recheckOpen.set(true);
  }

  submitRecheck(): void {
    const ttId = this.recheckPaperId();
    if (!ttId) return;
    this.api
      .submitRecheck(this.examId(), {
        exam_timetable_id: ttId,
        comment: this.recheckComment().trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.messages.add({ severity: 'success', summary: 'Submitted', detail: res.message });
          this.recheckOpen.set(false);
          this.loadRechecks();
        },
        error: (e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Failed',
            detail: e.error?.message || 'Failed to submit recheck',
          });
        },
      });
  }

  download(kind: 'admit' | 'result'): void {
    const url =
      kind === 'admit' ? this.api.studentAdmitCardUrl(this.examId()) : this.api.studentResultCardUrl(this.examId());
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
          /* */
        }
        this.messages.add({ severity: 'error', summary: 'Download failed', detail: msg });
        return;
      }
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${kind}-card-${this.examId()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }
}
