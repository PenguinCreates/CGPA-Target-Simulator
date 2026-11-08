export type StoredStateSource = 'indexeddb' | 'localStorage' | 'empty';
export type SaveResult = 'indexeddb' | 'localStorage' | 'unavailable';

export function readSavedState(): Promise<{
  value: unknown | null;
  source: StoredStateSource;
}>;
export function saveAppState(value: unknown): Promise<SaveResult>;
export function readThemePreference(): Promise<'dark' | 'light' | null>;
export function saveThemePreference(theme: 'dark' | 'light'): Promise<boolean>;
