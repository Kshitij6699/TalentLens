import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  GraduationCap, 
  CalendarCheck, 
  FileSpreadsheet, 
  Settings, 
  LogOut, 
  Moon, 
  Sun,
  Shield,
  UserCheck
} from 'lucide-react';
import { User } from '../types.ts';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  user: User | null;
  onLogout: () => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  onSimulatedRoleChange: (role: 'admin' | 'manager' | 'mentor') => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({
  currentView,
  setCurrentView,
  user,
  onLogout,
  darkMode,
  setDarkMode,
  onSimulatedRoleChange,
  isOpen = false,
  onClose
}: SidebarProps) {
  
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
    { id: 'employees', name: 'Employees', icon: Users, roles: ['admin'] },
    { id: 'reports', name: 'Reports & Export', icon: FileSpreadsheet, roles: ['admin'] },
    { id: 'settings', name: 'System Settings', icon: Settings, roles: ['admin'] },
  ];

  const visibleItems = menuItems.filter(item => item.roles.includes(user?.role || 'admin'));

  return (
    <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out md:translate-x-0 ${
      isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
    }`}>
      {/* Brand Header */}
      <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 dark:shadow-none">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-md font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-none">TalentLens</h1>
            <span className="text-[10px] font-mono font-medium text-indigo-600 dark:text-indigo-400">UpSKill Portal</span>
          </div>
        </div>
        
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => {
                setCurrentView(item.id);
                if (onClose) onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive 
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
              {item.name}
            </button>
          );
        })}
      </nav>

      {/* User Information & Controls */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{user?.name}</h2>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                user?.role === 'admin' ? 'bg-red-500' :
                user?.role === 'manager' ? 'bg-indigo-500' :
                user?.role === 'mentor' ? 'bg-amber-500' : 'bg-zinc-500'
              }`} />
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 capitalize">{user?.role}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-3">
          {/* Theme Toggle */}
          <button
            id="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          </button>

          {/* Logout */}
          <button
            id="logout-button"
            onClick={onLogout}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
