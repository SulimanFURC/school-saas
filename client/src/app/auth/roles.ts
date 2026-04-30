/**
 * JWT / backend role literals. Use these instead of raw strings in guards and UI checks.
 */
export const UserRole = {
  SuperAdmin: 'super_admin',
  Admin: 'admin',
  Teacher: 'teacher',
  Student: 'student',
} as const;

export type UserRoleId = (typeof UserRole)[keyof typeof UserRole];

export function normalizeRole(role: string | null | undefined): string {
  return (role ?? '').toLowerCase().trim();
}

export function isAdminOrSuperAdmin(roleRaw: string | null | undefined): boolean {
  const r = normalizeRole(roleRaw);
  return r === UserRole.Admin || r === UserRole.SuperAdmin;
}
