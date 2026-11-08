import Dexie from 'dexie';

const DATABASE_NAME = 'studyline-cgpa';
const STATE_KEY = 'studyline.cgpa-simulator.v1';
const THEME_KEY = 'studyline.cgpa-theme';

const database = new Dexie(DATABASE_NAME);
database.version(1).stores({ records: 'key' });

let stateWriteQueue = Promise.resolve('indexeddb');

export async function readSavedState() {
  try {
    const record = await database.table('records').get('state');
    if (record?.value) return { value: record.value, source: 'indexeddb' };
  } catch {
    // Keep the dashboard usable if IndexedDB is blocked by browser settings.
  }

  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return { value: JSON.parse(raw), source: 'localStorage' };
  } catch {
    // Corrupt or unavailable legacy storage is handled by the caller.
  }
  return { value: null, source: 'empty' };
}

export function saveAppState(value) {
  const snapshot = JSON.parse(JSON.stringify(value));
  stateWriteQueue = stateWriteQueue
    .catch(() => 'unavailable')
    .then(async () => {
      try {
        await database.table('records').put({ key: 'state', value: snapshot });
        try {
          localStorage.removeItem(STATE_KEY);
        } catch {
          // The IndexedDB copy is already committed.
        }
        return 'indexeddb';
      } catch {
        try {
          localStorage.setItem(STATE_KEY, JSON.stringify(snapshot));
          return 'localStorage';
        } catch {
          return 'unavailable';
        }
      }
    });
  return stateWriteQueue;
}

export async function readThemePreference() {
  try {
    const record = await database.table('records').get('theme');
    if (record?.value === 'dark' || record?.value === 'light') return record.value;
  } catch {
    // Fall back to the prior localStorage preference.
  }

  try {
    const legacy = localStorage.getItem(THEME_KEY);
    if (legacy === 'dark' || legacy === 'light') return legacy;
  } catch {
    // Default to the light theme.
  }
  return null;
}

export async function saveThemePreference(theme) {
  try {
    await database.table('records').put({ key: 'theme', value: theme });
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {
      // The IndexedDB copy is already committed.
    }
    return true;
  } catch {
    try {
      localStorage.setItem(THEME_KEY, theme);
      return true;
    } catch {
      return false;
    }
  }
}
