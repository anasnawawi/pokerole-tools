// Client-side localStorage persistence

// Every key this app owns is namespaced, so it can share an origin with
// anything else without collisions.
export const STORAGE_PREFIX = 'pokerole_';

export function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(data));
  } catch(e) { console.error('Save failed:', e); }
}

/* The stored text for a key, without parsing it. Callers that only need to
   know *whether* a value changed (change detection, cache invalidation) use
   this rather than re-parsing JSON on every check — and it keeps the prefix
   in one place, since reading the unprefixed key silently returns nothing. */
export function rawFromStorage(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${key}`) ?? '';
  } catch { return ''; }
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(`pokerole_${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch(e) { return fallback; }
}

export function removeFromStorage(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`pokerole_${key}`);
}
