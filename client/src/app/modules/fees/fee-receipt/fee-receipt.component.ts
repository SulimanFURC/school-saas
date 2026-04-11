import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { BrandingService } from '../../../services/branding.service';
import { FeeCollection, FeeService } from '../../../services/fee.service';
import {
  StudentService,
  resolveStudentDisplayName,
} from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-fee-receipt',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './fee-receipt.component.html',
  styleUrl: './fee-receipt.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeReceiptComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly feeApi = inject(FeeService);
  private readonly studentApi = inject(StudentService);
  readonly branding = inject(BrandingService);
  private readonly toast = inject(ToastService);

  readonly fees = signal<FeeCollection[]>([]);
  readonly loading = signal(true);
  readonly studentPayload = signal<Record<string, unknown> | null>(null);

  readonly studentId = signal('');

  readonly studentDisplayName = computed(() => {
    const d = this.studentPayload();
    if (!d) return '';
    return resolveStudentDisplayName(d);
  });

  readonly registrationNo = computed(() => {
    const d = this.studentPayload();
    if (!d) return '';
    const v = d['admission_no'] ?? d['admissionNo'];
    return v != null ? String(v) : '';
  });

  readonly classLabel = computed(() => {
    const d = this.studentPayload();
    if (!d) return '—';
    const cn = d['class_name'] ?? d['className'];
    if (cn != null && String(cn).trim() !== '') return String(cn);
    const ce = d['current_enrollment'] ?? d['currentEnrollment'];
    if (ce && typeof ce === 'object') {
      const sc = (ce as Record<string, unknown>)['schoolClass'] as Record<string, unknown> | undefined;
      const sec = (ce as Record<string, unknown>)['section'] as Record<string, unknown> | undefined;
      const cname = sc?.['name'] != null ? String(sc['name']) : '';
      const sname = sec?.['name'] != null ? String(sec['name']) : '';
      if (cname && sname) return `${cname} - ${sname}`;
      if (cname) return cname;
    }
    return '—';
  });

  readonly totalAmount = computed(() =>
    this.fees().reduce((sum, f) => sum + (typeof f.amount === 'number' ? f.amount : 0), 0)
  );

  readonly latestFee = computed(() => {
    const list = this.fees();
    return list.length ? list[0] : null;
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('studentId');
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.studentId.set(id);
    forkJoin({
      fees: this.feeApi.getFeesByStudent(id),
      student: this.studentApi.getById(id).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ fees, student }) => {
        this.fees.set(fees);
        this.studentPayload.set(student);
        this.loading.set(false);
      },
      error: (e) => {
        this.toast.open(
          (e.error as { message?: string } | undefined)?.message ?? 'Failed to load receipt',
          'Dismiss',
          { duration: 5000 }
        );
        this.loading.set(false);
      },
    });
  }

  formatMoney(n: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }

  printReceipt(): void {
    window.print();
  }
}
