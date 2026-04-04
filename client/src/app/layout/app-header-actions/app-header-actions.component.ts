import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { AuthService } from '../../services/auth.service';
import { NotificationService, type AppNotification } from '../../services/notification.service';
import { ThemeService } from '../../services/theme.service';

function formatRole(role: string | undefined): string {
  if (!role?.trim()) return 'User';
  const r = role.trim().toLowerCase();
  if (r === 'super_admin') return 'Super admin';
  return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

@Component({
  selector: 'app-header-actions',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatBadgeModule,
    RouterLink,
  ],
  templateUrl: './app-header-actions.component.html',
  styleUrl: './app-header-actions.component.scss',
})
export class AppHeaderActionsComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly notificationsSvc = inject(NotificationService);

  readonly notifications = this.notificationsSvc.notifications;
  readonly unreadCount = this.notificationsSvc.unreadCount;

  readonly displayName = computed(() => {
    const n = this.auth.user()?.name?.trim();
    return n || 'User';
  });

  readonly displayRole = computed(() => formatRole(this.auth.user()?.role));

  readonly avatarInitials = computed(() => initialsFromName(this.displayName()));

  relativeTime(iso: string): string {
    return formatRelativeTime(iso);
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  markNotifRead(n: AppNotification): void {
    this.notificationsSvc.markRead(n.id);
  }

  markAllNotificationsRead(): void {
    this.notificationsSvc.markAllRead();
  }

  logout(): void {
    this.auth.logout();
  }
}
