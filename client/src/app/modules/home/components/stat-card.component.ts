import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (routerLink) {
      <a [routerLink]="routerLink" class="card h-100 text-decoration-none text-reset stat-card stat-card--link">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div>
              <div class="stat-card__title mb-1">{{ label }}</div>
              <div class="stat-card__value">{{ value ?? '—' }}</div>
              @if (hint) {
                <div class="small text-secondary mt-1">{{ hint }}</div>
              }
            </div>
            @if (icon) {
              <span class="stat-card__icon-chip">
                <i class="bi fs-5" [class]="icon"></i>
              </span>
            }
          </div>
        </div>
      </a>
    } @else {
      <div class="card h-100 stat-card" [class.border-warning]="variant === 'warning'">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div>
              <div class="stat-card__title mb-1">{{ label }}</div>
              <div class="stat-card__value">{{ value ?? '—' }}</div>
              @if (hint) {
                <div class="small text-secondary mt-1">{{ hint }}</div>
              }
            </div>
            @if (icon) {
              <span class="stat-card__icon-chip">
                <i class="bi fs-5" [class]="iconClass"></i>
              </span>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .stat-card {
        border: 1px solid var(--dashboard-border);
        border-radius: var(--dashboard-radius);
        box-shadow: var(--dashboard-shadow);
        background: var(--dashboard-card);
      }
      .stat-card--link:hover {
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1);
      }
      .stat-card__title {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--dashboard-text-muted);
      }
      .stat-card__value {
        font-size: 1.8rem;
        line-height: 1.1;
        font-weight: 700;
        color: var(--dashboard-text);
      }
      .stat-card__icon-chip {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--primary) 14%, #ffffff);
      }
      .stat-card__icon-chip .bi {
        color: var(--primary) !important;
        opacity: 1 !important;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string | number | null | undefined;
  @Input() hint?: string;
  @Input() icon?: string;
  @Input() routerLink?: string | string[];
  @Input() variant: 'default' | 'warning' | 'success' = 'default';

  get iconClass(): string {
    const base = this.icon ?? '';
    if (this.variant === 'warning') return `${base} text-warning`;
    if (this.variant === 'success') return `${base} text-success`;
    return `${base} text-primary`;
  }
}
