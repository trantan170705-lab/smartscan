import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface VaultPage {
  id: string;
  docId: string;
  pageNumber: number;
  createdAt: number;
  originalBlob: Blob;
  quad: [number, number, number, number, number, number, number, number];
  rotation: 0 | 90 | 180 | 270;
  filterMode: 0 | 1 | 2 | 3; // 0: ORIGINAL, 1: MAGIC, 2: MAGIC PRO, 3: B&W
  contrast: number; // 0.5 to 2.0 (1.0 default)
  brightness: number; // -50 to 50 (0.0 default)
  processedThumbnailBlob: Blob;
  originalWidth: number;
  originalHeight: number;
  extractedText?: string;
}

interface VaultDBSchema extends DBSchema {
  pages: {
    key: string;
    value: VaultPage;
    indexes: {
      'by-docId': string;
      'by-order': number;
    };
  };
}

const DB_NAME = 'optic_scan_vault';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<VaultDBSchema>> | null = null;

export function getVaultDB(): Promise<IDBPDatabase<VaultDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<VaultDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('pages', { keyPath: 'id' });
        store.createIndex('by-docId', 'docId');
        store.createIndex('by-order', 'pageNumber');
      },
    });
  }
  return dbPromise;
}

export async function saveVaultPage(page: VaultPage): Promise<void> {
  const db = await getVaultDB();
  await db.put('pages', page);
}

export async function getVaultPage(id: string): Promise<VaultPage | undefined> {
  const db = await getVaultDB();
  return db.get('pages', id);
}

export async function getAllVaultPages(docId?: string): Promise<VaultPage[]> {
  const db = await getVaultDB();
  let pages: VaultPage[];
  if (docId) {
    pages = await db.getAllFromIndex('pages', 'by-docId', docId);
  } else {
    pages = await db.getAll('pages');
  }
  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}

export async function updateVaultPage(id: string, updates: Partial<VaultPage>): Promise<void> {
  const db = await getVaultDB();
  const tx = db.transaction('pages', 'readwrite');
  const store = tx.objectStore('pages');
  const existing = await store.get(id);
  if (existing) {
    const updated = { ...existing, ...updates };
    await store.put(updated);
  }
  await tx.done;
}

export async function deleteVaultPage(id: string): Promise<void> {
  const db = await getVaultDB();
  await db.delete('pages', id);
}

export async function reorderVaultPages(orderedIds: string[]): Promise<void> {
  const db = await getVaultDB();
  const tx = db.transaction('pages', 'readwrite');
  const store = tx.objectStore('pages');
  for (let i = 0; i < orderedIds.length; i++) {
    const page = await store.get(orderedIds[i]);
    if (page) {
      page.pageNumber = i + 1;
      await store.put(page);
    }
  }
  await tx.done;
}

export async function clearVault(): Promise<void> {
  const db = await getVaultDB();
  await db.clear('pages');
}
