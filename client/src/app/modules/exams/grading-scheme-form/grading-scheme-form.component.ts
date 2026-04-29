import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import {
  ExamService,
  type GradingBandDto,
  type GradingSchemeCreatePayload,
  type GradingSchemeDto,
} from '../../../services/exam.service';

interface BandRow extends GradingBandDto {
  __key: string;
}

function makeKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_BANDS: GradingBandDto[] = [
  { grade_label: 'A+', min_percent: 90, max_percent: 100, grade_point: 4.0, remarks: 'Outstanding', is_failing: false },
  { grade_label: 'A', min_percent: 80, max_percent: 89.99, grade_point: 3.7, remarks: 'Excellent', is_failing: false },
  { grade_label: 'B', min_percent: 70, max_percent: 79.99, grade_point: 3.0, remarks: 'Good', is_failing: false },
  { grade_label: 'C', min_percent: 60, max_percent: 69.99, grade_point: 2.0, remarks: 'Pass', is_failing: false },
  { grade_label: 'D', min_percent: 40, max_percent: 59.99, grade_point: 1.0, remarks: 'Pass (low)', is_failing: false },
  { grade_label: 'F', min_percent: 0, max_percent: 39.99, grade_point: 0, remarks: 'Fail', is_failing: true },
];

@Component({
  selector: 'app-grading-scheme-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    CheckboxModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './grading-scheme-form.component.html',
  styleUrl: './grading-scheme-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GradingSchemeFormComponent implements OnInit {
  private api = inject(ExamService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);

  loading = signal(false);
  submitting = signal(false);
  editId = signal<string | null>(null);
  pageTitle = signal('New grading scheme');

  name = signal('');
  description = signal('');
  bands = signal<BandRow[]>(DEFAULT_BANDS.map((b) => ({ ...b, __key: makeKey() })));

  readonly hasOverlap = computed(() => {
    const sorted = [...this.bands()].sort((a, b) => a.min_percent - b.min_percent);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].min_percent <= sorted[i - 1].max_percent) return true;
    }
    return false;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.pageTitle.set('Edit grading scheme');
      this.load(id);
    }
  }

  load(id: string): void {
    this.loading.set(true);
    this.api
      .listGradingSchemes(true)
      .pipe(
        catchError(() => of({ data: [] as GradingSchemeDto[] })),
        finalize(() => this.loading.set(false))
      )
      .subscribe((res) => {
        const scheme = res.data.find((s) => s.id === id);
        if (!scheme) {
          void this.router.navigate(['/exams/grading-schemes']);
          return;
        }
        this.name.set(scheme.name);
        this.description.set(scheme.description || '');
        this.bands.set(scheme.bands.map((b) => ({ ...b, __key: makeKey() })));
      });
  }

  patchBand(key: string, patch: Partial<BandRow>): void {
    this.bands.update((list) =>
      list.map((b) => (b.__key === key ? { ...b, ...patch } : b))
    );
  }

  addBand(): void {
    this.bands.update((list) => [
      ...list,
      {
        __key: makeKey(),
        grade_label: '',
        min_percent: 0,
        max_percent: 100,
        grade_point: null,
        remarks: '',
        is_failing: false,
      },
    ]);
  }

  removeBand(key: string): void {
    this.bands.update((list) => list.filter((b) => b.__key !== key));
  }

  submit(): void {
    const name = this.name().trim();
    if (!name) {
      this.messages.add({ severity: 'warn', summary: 'Name required', detail: 'Enter a scheme name' });
      return;
    }
    if (this.bands().length === 0) {
      this.messages.add({ severity: 'warn', summary: 'No bands', detail: 'Add at least one grade band' });
      return;
    }
    if (this.hasOverlap()) {
      this.messages.add({
        severity: 'warn',
        summary: 'Overlapping bands',
        detail: 'Adjust min/max so no two bands overlap',
      });
      return;
    }
    const payload: GradingSchemeCreatePayload = {
      name,
      description: this.description().trim() || null,
      bands: this.bands().map(({ __key, id, ...rest }) => ({
        ...rest,
        grade_label: rest.grade_label.trim(),
        remarks: rest.remarks ? String(rest.remarks).trim() : null,
        grade_point: rest.grade_point != null && Number.isFinite(Number(rest.grade_point))
          ? Number(rest.grade_point)
          : null,
        min_percent: Number(rest.min_percent),
        max_percent: Number(rest.max_percent),
        is_failing: !!rest.is_failing,
      })),
    };
    this.submitting.set(true);
    const id = this.editId();
    const obs$ = id ? this.api.updateGradingScheme(id, payload) : this.api.createGradingScheme(payload);
    obs$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.messages.add({ severity: 'success', summary: 'Saved', detail: res.message });
        void this.router.navigate(['/exams/grading-schemes']);
      },
      error: (e: { error?: { message?: string } }) => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Save failed',
          detail: e.error?.message || 'Failed to save scheme',
        });
      },
    });
  }
}
