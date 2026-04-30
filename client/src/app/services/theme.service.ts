import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'school_saas_theme';
const DARK_CLASS = 'app-dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private document = inject(DOCUMENT);

  private _mode = signal<ThemeMode>(this.readStoredPreference());

  readonly mode = this._mode.asReadonly();
  readonly isDark = computed(() => this._mode() === 'dark');

  constructor() {
    this.applyTheme(this._mode());

    effect(() => {
      const mode = this._mode();
      this.applyTheme(mode);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, mode);
      }
    });
  }

  toggle(): void {
    this._mode.update((m) => (m === 'light' ? 'dark' : 'light'));
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  private readStoredPreference(): ThemeMode {
    if (typeof localStorage === 'undefined') {
      return 'light';
    }
    const persisted = localStorage.getItem(STORAGE_KEY);
    return persisted === 'dark' || persisted === 'light' ? persisted : 'light';
  }

  private applyTheme(mode: ThemeMode): void {
    const html = this.document.documentElement;
    if (mode === 'dark') {
      html.classList.add(DARK_CLASS);
      html.setAttribute('data-bs-theme', 'dark');
      return;
    }
    html.classList.remove(DARK_CLASS);
    html.setAttribute('data-bs-theme', 'light');
  }
}
