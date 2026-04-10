import { Component, computed, input, output } from '@angular/core';

import { windowedPageNumbers1Based } from '../../utils/page-window';

@Component({
  selector: 'app-table-pagination-footer',
  standalone: true,
  templateUrl: './table-pagination-footer.component.html',
  styleUrl: './table-pagination-footer.component.scss',
})
export class TablePaginationFooterComponent {
  /** Total row count (all pages). */
  total = input.required<number>();
  /** Current page, 1-based. */
  page = input.required<number>();
  pageSize = input.required<number>();
  totalPages = input.required<number>();
  entryLabel = input<string>('entries');
  ariaLabel = input<string>('Pagination');

  pageChange = output<number>();

  readonly showingFrom = computed(() => {
    const t = this.total();
    if (t <= 0) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  readonly showingTo = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  readonly rangeText = computed(() => {
    const t = this.total();
    if (t <= 0) {
      return `Showing 0 to 0 of 0 ${this.entryLabel()}`;
    }
    return `Showing ${this.showingFrom()} to ${this.showingTo()} of ${t} ${this.entryLabel()}`;
  });

  readonly pageNumbers = computed(() => windowedPageNumbers1Based(this.page(), this.totalPages(), 5));

  emitPage(p: number): void {
    const max = this.totalPages();
    const next = Math.min(Math.max(1, p), Math.max(1, max));
    this.pageChange.emit(next);
  }
}
