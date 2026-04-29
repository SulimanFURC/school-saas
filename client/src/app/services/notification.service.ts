import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, of, switchMap, catchError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  data?: Record<string, unknown> | null;
}

interface ApiNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  read: boolean;
}

interface ApiNotificationsResponse {
  data: ApiNotification[];
  unread_count: number;
}

const POLL_INTERVAL_MS = 60_000;

function shape(api: ApiNotification): AppNotification {
  return {
    id: api.id,
    title: api.title,
    body: api.body,
    createdAt: api.created_at,
    read: !!api.read,
    data: api.data || null,
  };
}

/**
 * Backend-backed in-app notifications. The component layer only consumes
 * `notifications` and `unreadCount` signals; refresh is triggered both on a
 * timer and on demand (e.g. after marking read).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  private readonly items = signal<AppNotification[]>([]);
  readonly notifications = this.items.asReadonly();
  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);

  private readonly trigger$ = new Subject<void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.trigger$
      .pipe(
        debounceTime(150),
        switchMap(() => {
          if (!this.auth.isAuthenticated()) return of<ApiNotificationsResponse | null>(null);
          return this.http
            .get<ApiNotificationsResponse>(`${environment.apiBaseUrl}/notifications`)
            .pipe(catchError(() => of<ApiNotificationsResponse | null>(null)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        if (!res) return;
        this.items.set(Array.isArray(res.data) ? res.data.map(shape) : []);
      });
    this.start();
  }

  /** Force a fresh load of notifications. */
  refresh(): void {
    this.trigger$.next();
  }

  /** Begin polling. Idempotent. */
  start(): void {
    if (this.timer) return;
    this.refresh();
    this.timer = setInterval(() => this.refresh(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  markRead(id: string): void {
    this.items.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    this.http
      .patch(`${environment.apiBaseUrl}/notifications/${encodeURIComponent(id)}/read`, {})
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh());
  }

  markAllRead(): void {
    this.items.update((list) => list.map((n) => ({ ...n, read: true })));
    this.http
      .post(`${environment.apiBaseUrl}/notifications/mark-all-read`, {})
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh());
  }
}
