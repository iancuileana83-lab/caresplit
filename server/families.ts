// A visitor's demo family: created on first visit, seeded with sample history, resettable.
import { newFamily, seedReceipts } from './demo-data';
import type { Store, StoredFamily } from './store';

/** The visitor id is a random UUID the browser makes up and keeps. It is the key to that visitor's data. */
export const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function createFamily(store: Store, id: string, now: Date): Promise<StoredFamily> {
  const family = newFamily(id, now);
  await store.saveFamily(family);
  const receipts = store.receipts(id);
  for (const r of seedReceipts(family, now)) await receipts.save(r);
  return family;
}

export async function getOrCreateFamily(store: Store, id: string, now = new Date()): Promise<StoredFamily> {
  return (await store.getFamily(id)) ?? createFamily(store, id, now);
}

/** Back to a fresh sample family: all receipts removed, members and names restored. */
export async function resetFamily(store: Store, id: string, now = new Date()): Promise<StoredFamily> {
  await store.deleteReceipts(id);
  return createFamily(store, id, now);
}
