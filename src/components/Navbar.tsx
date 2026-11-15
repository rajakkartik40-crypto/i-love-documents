import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

const NAV_ITEMS = [
  { label: 'Home', path: '/' },
  { label: 'All Tools', path: '/tools' },
  { label: 'PDF Tools', path: '/pdf-tools' },
  { label: 'Image Tools', path: '/image-tools' },
  { label: 'AI Tools', path: '/ai-tools' },
  { label: 'My Files', path: '/my-files' },
  { label: 'Theme Settings', path: '/themes' },
];

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  const handleNav = (path: string) => {
    onNavigate(path);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark */}
        <button
          type="button"
          onClick={() => handleNav('/')}
          className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 dark:focus-visible:outline-white rounded cursor-pointer"
          aria-label="I Love Documents Home"
        >
          <BrandLogo size="sm" />
        </button>

        {/* Zone 2: Clean single-line text nav links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {NAV_ITEMS.map((item) => {
            const active = currentPath === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => handleNav(item.path)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer border-b-2 ${
                  active
                    ? 'text-slate-950 dark:text-white border-current font-semibold'
                    : 'border-transparent hover:text-slate-950 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => handleNav('/dashboard')}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white rounded-lg transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
              style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
            >
              My Dashboard
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleNav('/auth')}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white rounded-lg transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
              style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
            >
              Login / Sign Up
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="lg:hidden p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Toggle Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNav(item.path)}
              className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                currentPath === item.path
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};
