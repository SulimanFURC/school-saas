import { Injectable, computed, signal } from '@angular/core';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

const MOCK: AppNotification[] = [
  {
    id: '1',
    title: 'Fee payment received',
    body: 'Term 2 installment recorded for Class 10-A.',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: '2',
    title: 'Staff meeting',
    body: 'Curriculum review tomorrow at 9:00 in the main hall.',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: '3',
    title: 'Attendance report ready',
    body: 'Weekly summary is available in Reports.',
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: '4',
    title: 'New student enrollment',
    body: '3 pending admissions require your review.',
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: '5',
    title: 'Library books due',
    body: 'Reminder: 12 books are overdue this week.',
    createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: '6',
    title: 'System maintenance',
    body: 'Planned downtime Sunday 02:00–04:00 UTC.',
    createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: '7',
    title: 'Exam schedule published',
    body: 'Mid-term dates are now visible to parents.',
    createdAt: new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: '8',
    title: 'Transport route update',
    body: 'Route B pickup time moved 10 minutes earlier.',
    createdAt: new Date(Date.now() - 144 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
];

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly items = signal<AppNotification[]>(MOCK.map((n) => ({ ...n })));

  readonly notifications = this.items.asReadonly();

  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);

  markRead(id: string): void {
    this.items.update((list) =>
      list.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  markAllRead(): void {
    this.items.update((list) => list.map((n) => ({ ...n, read: true })));
  }
}
