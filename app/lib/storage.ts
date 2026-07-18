// Client-side localStorage persistence

export function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`pokerole_${key}`, JSON.stringify(data));
  } catch(e) { console.error('Save failed:', e); }
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
