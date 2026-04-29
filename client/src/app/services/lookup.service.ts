import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { AcademicService, AcademicYearDto, SchoolClassDto } from './academic.service';

@Injectable({ providedIn: 'root' })
export class LookupService {
  private academic = inject(AcademicService);

  private readonly _classes = signal<SchoolClassDto[]>([]);
  private readonly _academicYears = signal<AcademicYearDto[]>([]);
  private readonly _classesLoaded = signal(false);
  private readonly _yearsLoaded = signal(false);
  private readonly _classesLoading = signal(false);
  private readonly _yearsLoading = signal(false);

  readonly classes = this._classes.asReadonly();
  readonly academicYears = this._academicYears.asReadonly();
  readonly activeAcademicYear = computed(
    () => this._academicYears().find((year) => year.is_active) ?? null
  );

  loadClasses(force = false): void {
    if (this._classesLoading()) return;
    if (!force && this._classesLoaded()) return;

    this._classesLoading.set(true);
    this.academic
      .listClasses()
      .pipe(finalize(() => this._classesLoading.set(false)))
      .subscribe({
        next: (rows) => {
          this._classes.set(rows);
          this._classesLoaded.set(true);
        },
        error: () => {
          this._classesLoaded.set(false);
        },
      });
  }

  loadAcademicYears(force = false): void {
    if (this._yearsLoading()) return;
    if (!force && this._yearsLoaded()) return;

    this._yearsLoading.set(true);
    this.academic
      .listAcademicYears()
      .pipe(finalize(() => this._yearsLoading.set(false)))
      .subscribe({
        next: (rows) => {
          this._academicYears.set(rows);
          this._yearsLoaded.set(true);
        },
        error: () => {
          this._yearsLoaded.set(false);
        },
      });
  }

  invalidateClasses(): void {
    this._classesLoaded.set(false);
    this.loadClasses(true);
  }

  invalidateYears(): void {
    this._yearsLoaded.set(false);
    this.loadAcademicYears(true);
  }
}
