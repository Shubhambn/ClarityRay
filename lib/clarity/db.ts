import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface ClarityRayDB extends DBSchema {
  models: {
    key: string;
    value: ArrayBuffer;
  };
}

const DB_NAME = 'clarityray';
const STORE_NAME = 'models';

let dbPromise: Promise<IDBPDatabase<ClarityRayDB>> | null = null;

function getDb(): Promise<IDBPDatabase<ClarityRayDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }
  if (!dbPromise) {
    dbPromise = openDB<ClarityRayDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      }
    });
  }
  return dbPromise;
}

export async function saveModel(key: string, data: ArrayBuffer): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, data, key);
}

export async function getModel(key: string): Promise<ArrayBuffer | null> {
  const db = await getDb();
  return (await db.get(STORE_NAME, key)) ?? null;
}
