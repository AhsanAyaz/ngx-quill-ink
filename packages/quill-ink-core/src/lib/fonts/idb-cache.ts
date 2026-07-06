import { FontPackGlyph } from './font-pack';
import { hasIndexedDB } from '../util/env';

const STORE = 'glyphs';

/**
 * Best-effort IndexedDB persistence for runtime-thinned glyphs. Every call
 * is wrapped: private-mode browsers and webviews that throw on IDB simply
 * degrade to the in-memory cache.
 */
export class IdbCache {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  constructor(private readonly dbName: string) {}

  private open(): Promise<IDBDatabase | null> {
    if (!hasIndexedDB()) return Promise.resolve(null);
    this.dbPromise ??= new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => {
          try {
            req.result.createObjectStore(STORE);
          } catch {
            /* ignore */
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  async get(key: string): Promise<FontPackGlyph | null> {
    try {
      const db = await this.open();
      if (!db) return null;
      return await new Promise((resolve) => {
        try {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
          req.onsuccess = () => resolve((req.result as FontPackGlyph) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }

  async set(key: string, value: FontPackGlyph): Promise<void> {
    try {
      const db = await this.open();
      if (!db) return;
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      /* best-effort */
    }
  }
}
