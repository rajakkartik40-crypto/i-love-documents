import React from 'react';
import { BrandLogo } from './BrandLogo';

interface FooterProps {
  onNavigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 mt-16">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <BrandLogo size="sm" onClick={() => onNavigate('/')} />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              All-in-one PDF, Image, Passport Photo, Scanner &amp; AI document platform · Built by{' '}
              <span className="font-semibold text-slate-900 dark:text-white">Kartik Rajak</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Security &amp; Retention: Most PDF and image operations run directly in your browser. Temporary server links expire automatically after 60 minutes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
            <button onClick={() => onNavigate('/passport-photo')} className="hover:text-slate-950 dark:hover:text-white cursor-pointer">
              Passport Photo
            </button>
            <button onClick={() => onNavigate('/scanner')} className="hover:text-slate-950 dark:hover:text-white cursor-pointer">
              Scanner
            </button>
            <button onClick={() => onNavigate('/about')} className="hover:text-slate-950 dark:hover:text-white cursor-pointer">
              About Us
            </button>
            <button onClick={() => onNavigate('/privacy')} className="hover:text-slate-950 dark:hover:text-white cursor-pointer">
              Privacy Policy
            </button>
            <button onClick={() => onNavigate('/terms')} className="hover:text-slate-950 dark:hover:text-white cursor-pointer">
              Terms &amp; Conditions
            </button>
            <button onClick={() => onNavigate('/contact')} className="hover:text-slate-950 dark:hover:text-white cursor-pointer">
              Contact Us
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
