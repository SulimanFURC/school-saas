import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '../../services/auth.service';
import { NotificationService, type AppNotification } from '../../services/notification.service';
import { ThemeService } from '../../services/theme.service';
import { formatRelativeTime } from '../../utils/relative-time';

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

@Component({
  selector: 'app-header-actions',
  imports: [RouterLink, ButtonModule, TooltipModule],
  templateUrl: './app-header-actions.component.html',
  styleUrl: './app-header-actions.component.scss',
})
export class AppHeaderActionsComponent {
  readonly auth = inject(AuthService);
  private themeService = inject(ThemeService);
  private readonly notificationsSvc = inject(NotificationService);
  readonly isDark = this.themeService.isDark;

  readonly notifications = this.notificationsSvc.notifications;
  readonly unreadCount = this.notificationsSvc.unreadCount;

  readonly displayName = computed(() => {
    const n = this.auth.user()?.name?.trim();
    return n || 'User';
  });

  readonly displayRole = computed(() => formatRole(this.auth.user()?.role));

  readonly avatarInitials = computed(() => initialsFromName(this.displayName()));

  relativeTime(iso: string | null | undefined): string {
    return formatRelativeTime(iso);
  }

  toggleTheme(): void {
    this.themeService.toggle();
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
