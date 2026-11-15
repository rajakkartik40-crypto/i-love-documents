import React, { createContext, useContext, useEffect, useState } from 'react';
import { THEME_PRESETS } from '../data/themes';
import { ThemeId, ThemePreset } from '../types';

interface ThemeState {
  themeId: ThemeId;
  mode: 'light' | 'dark';
  customAccentColor: string;
  customBgColor: string;
  customBgImage: string;
}

interface ThemeContextValue extends ThemeState {
  activePreset: ThemePreset;
  setThemePreset: (id: ThemeId) => void;
  setMode: (mode: 'light' | 'dark') => void;
  setCustomAccentColor: (color: string) => void;
  setCustomBgColor: (color: string) => void;
  setCustomBgImage: (imgDataUrl: string) => void;
  resetTheme: () => void;
  hydrateFromProfile: (partial: Partial<ThemeState>) => void;
}

const DEFAULT_STATE: ThemeState = {
  themeId: 'default',
  mode: 'light',
  customAccentColor: '#dc2626',
  customBgColor: '#ffffff',
  customBgImage: '',
};

const STORAGE_KEY = 'ilovedocs_theme_v1';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ThemeState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_STATE, ...JSON.parse(saved) };
    } catch {
      // ignore storage error
    }
    return DEFAULT_STATE;
  });

  const activePreset =
    THEME_PRESETS.find((t) => t.id === state.themeId) || THEME_PRESETS[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }

    const root = document.documentElement;
    if (state.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const accent = state.themeId === 'custom' ? state.customAccentColor : activePreset.accentColor;
    root.style.setProperty('--accent-primary', accent);
    if (state.themeId === 'custom' && state.customBgColor) {
      root.style.setProperty('--surface-canvas', state.customBgColor);
    } else {
      root.style.setProperty('--surface-canvas', activePreset.bgColor);
    }
    root.style.setProperty('--surface-card', state.mode === 'dark' ? activePreset.surfaceColor : '#ffffff');
  }, [state, activePreset]);

  const setThemePreset = (id: ThemeId) => {
    const found = THEME_PRESETS.find((t) => t.id === id);
    if (found) {
      setState((prev) => ({
        ...prev,
        themeId: id,
        mode: found.mode,
        customAccentColor: found.accentColor,
        customBgColor: found.bgColor,
      }));
    } else {
      setState((prev) => ({ ...prev, themeId: id }));
    }
  };

  const setMode = (mode: 'light' | 'dark') => {
    setState((prev) => ({ ...prev, mode }));
  };

  const setCustomAccentColor = (customAccentColor: string) => {
    setState((prev) => ({ ...prev, themeId: 'custom', customAccentColor }));
  };

  const setCustomBgColor = (customBgColor: string) => {
    setState((prev) => ({ ...prev, themeId: 'custom', customBgColor }));
  };

  const setCustomBgImage = (customBgImage: string) => {
    setState((prev) => ({ ...prev, customBgImage }));
  };

  const resetTheme = () => {
    setState(DEFAULT_STATE);
  };

  const hydrateFromProfile = (partial: Partial<ThemeState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  };

  return (
    <ThemeContext.Provider
      value={{
        ...state,
        activePreset,
        setThemePreset,
        setMode,
        setCustomAccentColor,
        setCustomBgColor,
        setCustomBgImage,
        resetTheme,
        hydrateFromProfile,
      }}
    >
      <div
        className={`min-h-screen transition-colors duration-200 ${activePreset.patternClass} ${
          state.themeId === 'deathnote' ? 'font-serif' : ''
        }`}
        style={{
          backgroundColor:
            state.themeId === 'custom' && state.customBgColor
              ? state.customBgColor
              : state.mode === 'dark'
              ? activePreset.bgColor
              : undefined,
          backgroundImage: state.customBgImage ? `url(${state.customBgImage})` : undefined,
          backgroundSize: state.customBgImage ? 'cover' : undefined,
          backgroundAttachment: state.customBgImage ? 'fixed' : undefined,
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
