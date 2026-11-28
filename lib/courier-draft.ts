type DraftKind = 'receipt' | 'expense';
type Draft = Record<string, string>;
const lifetimeMs = 7 * 24 * 60 * 60 * 1000;
const key = (userId: string, kind: DraftKind) => `ourspace:courier-draft:${userId}:${kind}`;

export function readCourierDraft(userId: string, kind: DraftKind): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(userId, kind));
    if (!raw) return null;
    const stored = JSON.parse(raw) as { saved_at: number; values: Draft };
    if (Date.now() - stored.saved_at <= lifetimeMs && stored.values && typeof stored.values === 'object') return stored.values;
    window.localStorage.removeItem(key(userId, kind));
  } catch { /* Damaged local draft is ignored. */ }
  return null;
}

export function saveCourierDraft(userId: string, kind: DraftKind, form: HTMLFormElement) {
  const values = Object.fromEntries(Array.from(new FormData(form), ([name, value]) => [name, String(value)]));
  window.localStorage.setItem(key(userId, kind), JSON.stringify({ saved_at: Date.now(), values }));
}

export function clearCourierDraft(userId: string, kind: DraftKind) {
  window.localStorage.removeItem(key(userId, kind));
}
