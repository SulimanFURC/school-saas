export function formatRelativeTime(input: string | Date | null | undefined): string {
  if (input == null || input === '') return '—';
  const d = input instanceof Date ? input : new Date(input);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return '—';
  const deltaSec = Math.round((Date.now() - ms) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const deltaMin = Math.round(deltaSec / 60);
  const deltaHr = Math.round(deltaMin / 60);
  const deltaDay = Math.round(deltaHr / 24);
  const deltaWeek = Math.round(deltaDay / 7);
  const deltaMonth = Math.round(deltaDay / 30);
  const deltaYear = Math.round(deltaDay / 365);
  if (Math.abs(deltaSec) < 45) return rtf.format(-deltaSec, 'second');
  if (Math.abs(deltaMin) < 60) return rtf.format(-deltaMin, 'minute');
  if (Math.abs(deltaHr) < 24) return rtf.format(-deltaHr, 'hour');
  if (Math.abs(deltaDay) < 7) return rtf.format(-deltaDay, 'day');
  if (Math.abs(deltaWeek) < 5) return rtf.format(-deltaWeek, 'week');
  if (Math.abs(deltaMonth) < 12) return rtf.format(-deltaMonth, 'month');
  return rtf.format(-deltaYear, 'year');
}
