import { Injectable, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

const LS_KEY = 'school_saas_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly themeSig = signal<AppTheme>(ThemeService.readStored());

  readonly theme = this.themeSig.asReadonly();

  isDark(): boolean {
    return this.themeSig() === 'dark';
  }

  setTheme(theme: AppTheme): void {
    this.themeSig.set(theme);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_KEY, theme);
    }
    ThemeService.applyDomClass(theme);
  }

  toggle(): void {
    this.setTheme(this.themeSig() === 'dark' ? 'light' : 'dark');
  }

  private static readStored(): AppTheme {
    if (typeof localStorage === 'undefined') return 'dark';
    return localStorage.getItem(LS_KEY) === 'light' ? 'light' : 'dark';
  }

  static applyDomClass(theme: AppTheme): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  }
}

export function themeInitializer(): () => void {
  return () => {
    if (typeof localStorage === 'undefined' || typeof document === 'undefined') return;
    const theme = localStorage.getItem(LS_KEY) === 'light' ? 'light' : 'dark';
    ThemeService.applyDomClass(theme);
  };
}
