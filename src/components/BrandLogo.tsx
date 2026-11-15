import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'lg' | 'xl';
  onClick?: () => void;
}

export const CrossedHeartIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M16 27.5C16 27.5 4.5 20.1 4.5 11.6C4.5 7.9 7.4 5 11.1 5C13.3 5 15.1 6.1 16 7.7C16.9 6.1 18.7 5 20.9 5C24.6 5 27.5 7.9 27.5 11.6C27.5 20.1 16 27.5 16 27.5Z"
      fill="var(--accent-primary, #dc2626)"
    />
    {/* Crisp diagonal cross lines symbolizing the crossed-heart mark */}
    <path
      d="M8.5 8.5L23.5 23.5M23.5 8.5L8.5 23.5"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
    />
  </svg>
);

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'sm', onClick }) => {
  const sizeClasses =
    size === 'xl'
      ? 'text-3xl sm:text-5xl gap-3 tracking-tight'
      : size === 'lg'
      ? 'text-2xl sm:text-3xl gap-2.5 tracking-tight'
      : 'text-lg sm:text-xl gap-1.5 tracking-tight';

  const heartClasses =
    size === 'xl'
      ? 'w-9 h-9 sm:w-12 sm:h-12'
      : size === 'lg'
      ? 'w-7 h-7 sm:w-8 sm:h-8'
      : 'w-5 h-5 sm:w-6 sm:h-6';

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center font-display font-extrabold text-slate-950 dark:text-white whitespace-nowrap shrink-0 select-none ${
        onClick ? 'cursor-pointer' : ''
      } ${sizeClasses}`}
    >
      <span>I</span>
      <CrossedHeartIcon className={`${heartClasses} text-white dark:text-slate-950`} />
      <span>DOCUMENTS</span>
    </span>
  );
};
