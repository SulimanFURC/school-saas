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
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import {
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  of,
} from 'rxjs';

import { FeatureService } from '@app/services';
import {
  DashboardSummaryClassEntry,
  MyStudentRow,
  TeacherDashboardResponse,
  TeacherService,
} from '@app/services';

interface ClassFilterOption {
  label: string;
  value: number | null;
}

interface SectionFilterOption {
  label: string;
  value: number | null;
  classId: number;
}

@Component({
  selector: 'app-teacher-dashboard',
  imports: [
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    IconFieldModule,
    InputIconModule,
  ],
  providers: [MessageService],
  templateUrl: './teacher-dashboard.component.html',
  styleUrl: './teacher-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherDashboardComponent implements OnInit {
  private api = inject(TeacherService);
  private messages = inject(MessageService);
  private destroyRef = inject(DestroyRef);
  private features = inject(FeatureService);

  readonly examsEnabled = computed(() => this.features.enabled().has('exams'));

  private readonly searchInput$ = new Subject<string>();

  loadingDashboard = signal(true);
  loadingStudents = signal(false);
  dashboard = signal<TeacherDashboardResponse | null>(null);

  rows = signal<MyStudentRow[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(20);
  totalPages = signal(1);

  classFilter = signal<number | null>(null);
  sectionFilter = signal<number | null>(null);
  searchQuery = signal('');

  classOptions = signal<ClassFilterOption[]>([]);
  sectionOptions = signal<SectionFilterOption[]>([]);

  readonly hasNoYear = computed(() => this.dashboard() != null && this.dashboard()?.academic_year == null);
  readonly hasNoAssignments = computed(() => {
    const d = this.dashboard();
    if (!d) return false;
    return d.teaching_assignments.length === 0 && d.class_teacher_of.length === 0;
  });

  readonly availableSectionOptions = computed(() => {
    const sel = this.classFilter();
    const options = this.sectionOptions();
    if (sel == null) return [{ label: 'All sections', value: null, classId: 0 } as SectionFilterOption];
    return [
      { label: 'All sections', value: null, classId: sel } as SectionFilterOption,
      ...options.filter((o) => o.classId === sel),
    ];
  });

  readonly fullName = computed(() => {
    const t = this.dashboard()?.teacher;
    if (!t) return '';
    return `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim();
  });

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((raw) => {
        this.searchQuery.set(raw.trim());
        this.page.set(1);
        this.loadStudents();
      });

    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.loadingDashboard.set(true);
    this.api
      .getMyDashboard()
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load dashboard',
            life: 5000,
          });
          return of(null as TeacherDashboardResponse | null);
        }),
        finalize(() => this.loadingDashboard.set(false))
      )
      .subscribe({
        next: (res) => {
          if (!res) return;
          this.dashboard.set(res);
          this.populateFilterOptions(res.summary, res.class_teacher_of);
          if (res.academic_year && (res.teaching_assignments.length > 0 || res.class_teacher_of.length > 0)) {
            this.loadStudents();
          } else {
            this.rows.set([]);
            this.total.set(0);
          }
        },
      });
  }

  private populateFilterOptions(
    summary: DashboardSummaryClassEntry[],
    homeroom: TeacherDashboardResponse['class_teacher_of']
  ): void {
    const classMap = new Map<number, string>();
    const sectionMap = new Map<string, SectionFilterOption>();
    for (const entry of summary) {
      classMap.set(entry.class_id, entry.class_name);
      for (const sec of entry.sections) {
        const key = `${entry.class_id}:${sec.section_id}`;
        sectionMap.set(key, {
          label: `${entry.class_name} — ${sec.section_name}`,
          value: sec.section_id,
          classId: entry.class_id,
        });
      }
    }
    for (const entry of homeroom) {
      classMap.set(entry.class_id, entry.class_name);
      for (const sec of entry.sections) {
        const key = `${entry.class_id}:${sec.section_id}`;
        if (!sectionMap.has(key)) {
          sectionMap.set(key, {
            label: `${entry.class_name} — ${sec.section_name}`,
            value: sec.section_id,
            classId: entry.class_id,
          });
        }
      }
    }
    const classOpts: ClassFilterOption[] = [
      { label: 'All my classes', value: null },
      ...Array.from(classMap.entries())
        .map(([id, name]) => ({ label: name, value: id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    this.classOptions.set(classOpts);
    this.sectionOptions.set(
      Array.from(sectionMap.values()).sort((a, b) => a.label.localeCompare(b.label))
    );
  }

  loadStudents(): void {
    this.loadingStudents.set(true);
    const cls = this.classFilter();
    const sec = this.sectionFilter();
    const q = this.searchQuery().trim();
    this.api
      .listMyStudents({
        page: this.page(),
        pageSize: this.pageSize(),
        ...(cls != null ? { class_id: cls } : {}),
        ...(sec != null ? { section_id: sec } : {}),
        ...(q ? { q } : {}),
      })
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load students',
            life: 5000,
          });
          return of({
            data: [] as MyStudentRow[],
            total: 0,
            page: 1,
            pageSize: this.pageSize(),
            totalPages: 1,
            academic_year: null,
            is_active_year: false,
          });
        }),
        finalize(() => this.loadingStudents.set(false))
      )
      .subscribe({
        next: (res) => {
          this.rows.set(Array.isArray(res.data) ? res.data : []);
          this.total.set(res.total ?? 0);
          this.totalPages.set(Math.max(1, res.totalPages ?? 1));
        },
      });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    const first = event.first ?? 0;
    const nextPage = Math.floor(first / rows) + 1;
    this.pageSize.set(rows);
    this.page.set(nextPage);
    this.loadStudents();
  }

  onClassFilterChange(value: number | null): void {
    this.classFilter.set(value);
    if (value == null) {
      this.sectionFilter.set(null);
    } else {
      const sec = this.sectionFilter();
      const stillValid = sec != null && this.sectionOptions().some((o) => o.value === sec && o.classId === value);
      if (!stillValid) {
        this.sectionFilter.set(null);
      }
    }
    this.page.set(1);
    this.loadStudents();
  }

  onSectionFilterChange(value: number | null): void {
    this.sectionFilter.set(value);
    this.page.set(1);
    this.loadStudents();
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  initials(row: MyStudentRow): string {
    const n = row.display_name?.trim() || row.admission_no || '';
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
