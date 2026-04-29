export interface NavItemConfig {
  label: string;
  path: string;
  icon: string;
  exact?: boolean;
  /** If set, item is shown only when this module key is enabled */
  moduleKey?: string;
}

export interface NavGroupConfig {
  label: string;
  icon: string;
  moduleKey?: string;
  children: NavItemConfig[];
}

export type NavEntry = NavItemConfig | NavGroupConfig;

export function isNavGroup(entry: NavEntry): entry is NavGroupConfig {
  return 'children' in entry && Array.isArray((entry as NavGroupConfig).children);
}

export const TENANT_NAV_CONFIG: NavEntry[] = [
  { label: 'Dashboard', path: '/home', icon: 'dashboard' },
  {
    label: 'Students',
    icon: 'school',
    moduleKey: 'students',
    children: [
      { label: 'All Students', path: '/students', icon: 'school' },
      { label: 'Register / Enroll', path: '/students/register', icon: 'school' },
      { label: 'Promote', path: '/students/promote', icon: 'school' },
    ],
  },
  {
    label: 'Teachers',
    icon: 'badge',
    moduleKey: 'teachers',
    children: [
      { label: 'All Teachers', path: '/teachers', icon: 'badge' },
      { label: 'Add teacher', path: '/teachers/new', icon: 'badge' },
    ],
  },
  {
    label: 'Class',
    icon: 'class',
    moduleKey: 'classes',
    children: [
      { label: 'All Classes', path: '/classes', icon: 'class' },
      { label: 'Add new class', path: '/classes/new', icon: 'class' },
    ],
  },
  {
    label: 'Fees',
    icon: 'payments',
    moduleKey: 'fees',
    children: [{ label: 'Fee Collection', path: '/fees/collection', icon: 'payments' }],
  },
  { label: 'Expenses', path: '/expenses', icon: 'receipt_long', moduleKey: 'expenses' },
  { label: 'Attendance', path: '/attendance', icon: 'event_available', moduleKey: 'attendance' },
  { label: 'Exams', path: '/exams', icon: 'quiz', moduleKey: 'exams' },
  { label: 'Reports', path: '/reports', icon: 'assessment', moduleKey: 'reports' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
];
