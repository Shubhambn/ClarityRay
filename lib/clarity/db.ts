import { openDB, type DBSchema } from 'idb';

interface ClarityRayDB extends DBSchema {
  models: {
    key: string;
    value: ArrayBuffer;
  };
}

const DB_NAME = 'clarityray';
const STORE_NAME = 'models';

const dbPromise = openDB<ClarityRayDB>(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  },
});

export async function saveModel(key: string, data: ArrayBuffer): Promise<void> {
  const db = await dbPromise;
  await db.put(STORE_NAME, data, key);
}

export async function getModel(key: string): Promise<ArrayBuffer | null> {
  const db = await dbPromise;
  return (await db.get(STORE_NAME, key)) ?? null;
}