export interface NavItemConfig {
  label: string;
  path: string;
  icon: string;
  exact?: boolean;
  /** If set, item is shown only when this module key is enabled */
  moduleKey?: string;
}

export const TENANT_NAV_CONFIG: NavItemConfig[] = [
  { label: 'Dashboard', path: '/', icon: 'dashboard', exact: true },
  { label: 'Students', path: '/students', icon: 'school', moduleKey: 'students' },
  { label: 'Teachers', path: '/teachers', icon: 'badge', moduleKey: 'teachers' },
  { label: 'Fees', path: '/fees', icon: 'payments', moduleKey: 'fees' },
  { label: 'Classes', path: '/classes', icon: 'class', moduleKey: 'classes' },
  { label: 'Attendance', path: '/attendance', icon: 'event_available', moduleKey: 'attendance' },
  { label: 'Reports', path: '/reports', icon: 'assessment', moduleKey: 'reports' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
];
