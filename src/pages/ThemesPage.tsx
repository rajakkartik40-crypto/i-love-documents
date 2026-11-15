import React, { useState } from 'react';
import { Check, Moon, Palette, RotateCcw, Sun, Upload } from 'lucide-react';
import { THEME_PRESETS } from '../data/themes';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export const ThemesPage: React.FC = () => {
  const {
    themeId,
    mode,
    customAccentColor,
    customBgColor,
    customBgImage,
    setThemePreset,
    setMode,
    setCustomAccentColor,
    setCustomBgColor,
    setCustomBgImage,
    resetTheme,
  } = useTheme();
  const { user, saveThemeToProfile } = useAuth();
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = async () => {
    if (user && user.emailVerified) {
      await saveThemeToProfile({
        themeId,
        themeMode: mode,
        customAccentColor,
        customBgColor,
      });
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleBgUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomBgImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white flex items-center gap-2.5">
            <Palette className="w-7 h-7 text-red-600" />
            Theme Settings &amp; Customization
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Switch seamlessly between clean minimal, anime-inspired, gaming-inspired, or custom themes without affecting tool functionality.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={resetTheme}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer"
            style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
          >
            <Check className="w-4 h-4" />
            {savedNotice ? 'Theme Saved' : 'Save Theme'}
          </button>
        </div>
      </div>

      {/* Mode & Custom Color Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Color Mode</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('light')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-semibold border inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'light'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <Sun className="w-4 h-4" /> Light Mode
            </button>
            <button
              type="button"
              onClick={() => setMode('dark')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-semibold border inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'dark'
                  ? 'bg-white text-slate-900 border-white'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <Moon className="w-4 h-4" /> Dark Mode
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Custom Colors</h2>
          <div className="flex items-center justify-between gap-4 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="color"
                value={customAccentColor}
                onChange={(e) => setCustomAccentColor(e.target.value)}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              <span>Accent ({customAccentColor})</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="color"
                value={customBgColor}
                onChange={(e) => setCustomBgColor(e.target.value)}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              <span>Background</span>
            </label>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Custom Background Image</h2>
          <div className="flex items-center gap-2">
            <label className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Wallpaper</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleBgUpload(e.target.files?.[0])}
                className="hidden"
              />
            </label>
            {customBgImage && (
              <button
                type="button"
                onClick={() => setCustomBgImage('')}
                className="px-3 py-2 rounded-lg text-xs text-red-600 border border-red-200 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Curated Themes Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-950 dark:text-white">Curated Theme Presets</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {THEME_PRESETS.map((preset) => {
            const selected = themeId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setThemePreset(preset.id)}
                className={`text-left rounded-xl border p-4 transition-all cursor-pointer bg-white dark:bg-slate-900 ${
                  selected
                    ? 'border-2 border-red-600 shadow-md'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                <div
                  className="h-24 rounded-lg mb-3 border border-slate-200/40 flex items-end justify-between p-3"
                  style={{ background: preset.previewGradient }}
                >
                  <span
                    className="w-5 h-5 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: preset.accentColor }}
                  />
                  {selected && (
                    <span className="px-2 py-0.5 rounded bg-white text-slate-900 text-[11px] font-bold">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono text-slate-500 uppercase">{preset.category}</p>
                <h3 className="text-base font-bold text-slate-950 dark:text-white mt-0.5">
                  {preset.name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
