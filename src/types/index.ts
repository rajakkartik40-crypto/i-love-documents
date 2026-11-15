export type ToolCategory =
  | 'all'
  | 'workflows'
  | 'organize'
  | 'optimize'
  | 'convert'
  | 'edit'
  | 'security'
  | 'intelligence'
  | 'image'
  | 'scanner';

export type ThemeId =
  | 'default'
  | 'dark'
  | 'naruto'
  | 'dragonball'
  | 'deathnote'
  | 'gtavi'
  | 'godofwar'
  | 'custom';

export interface ThemePreset {
  id: ThemeId;
  name: string;
  category: 'Standard' | 'Anime-Inspired' | 'Gaming-Inspired' | 'Custom';
  description: string;
  mode: 'light' | 'dark';
  accentColor: string;
  bgColor: string;
  surfaceColor: string;
  patternClass: string;
  previewGradient: string;
}

export interface ToolDefinition {
  slug: string;
  name: string;
  shortDesc: string;
  category: Exclude<ToolCategory, 'all'>;
  group: 'pdf' | 'image' | 'ai' | 'scanner';
  iconName: string;
  iconBg: string;
  iconColor: string;
  accepts: string;
  multiple: boolean;
  dedicatedRoute?: string;
  badgeText?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  themeId: ThemeId;
  themeMode: 'light' | 'dark';
  customAccentColor?: string;
  customBgColor?: string;
  favoriteTools?: string[];
  storageUsedBytes: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FileRecord {
  id: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  toolUsed: string;
  retentionMinutes: number;
  downloadToken?: string;
  createdAt?: { seconds: number; nanoseconds: number } | Date;
}

export interface SavedWorkflow {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  steps: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface HistoryEntry {
  id: string;
  ownerId: string;
  toolSlug: string;
  toolName: string;
  inputFileName: string;
  outputFileName: string;
  outputSizeBytes: number;
  createdAt?: { seconds: number; nanoseconds: number } | Date;
}

export interface ActiveSessionDoc {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  file?: File;
}
