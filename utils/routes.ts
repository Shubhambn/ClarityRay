import {
  LayoutDashboard,
  UploadCloud,
  Settings,
  LogIn,
  Home,
  type LucideIcon
} from 'lucide-react';

export interface AppRouteItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const appRoutes: AppRouteItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/auth', label: 'Auth', icon: LogIn },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analysis', label: 'New analysis', icon: UploadCloud },
  { href: '/settings', label: 'Settings', icon: Settings }
];

export const privateRoutes = appRoutes.filter((route) => ['/dashboard', '/analysis', '/settings'].includes(route.href));
