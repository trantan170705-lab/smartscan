import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { VaultPage } from './vault';

export interface ExportHistoryItem {
  id: string;
  fileName: string;
  timestamp: number;
  pageCount: number;
  fileSizeBytes: number;
  pdfBlob: Blob;
  pages?: VaultPage[];
}

interface ExportHistoryDBSchema extends DBSchema {
  history: {
    key: string;
    value: ExportHistoryItem;
    indexes: {
      'by-timestamp': number;
    };
  };
}

const DB_NAME = 'smartscan_history';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ExportHistoryDBSchema>> | null = null;

function getHistoryDB(): Promise<IDBPDatabase<ExportHistoryDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ExportHistoryDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('history', { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
      },
    });
  }
  return dbPromise;
}

export async function saveExportHistory(item: ExportHistoryItem): Promise<void> {
  const db = await getHistoryDB();
  await db.put('history', item);
}

export async function getExportHistory(): Promise<ExportHistoryItem[]> {
  const db = await getHistoryDB();
  const items = await db.getAllFromIndex('history', 'by-timestamp');
  return items.reverse(); // Newest first
}

export async function deleteExportHistoryItem(id: string): Promise<void> {
  const db = await getHistoryDB();
  await db.delete('history', id);
}

export async function clearAllExportHistory(): Promise<void> {
  const db = await getHistoryDB();
  await db.clear('history');
}
