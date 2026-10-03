// Families and receipts in Firestore: database "caresplit", one document per family under
// families/{visitorId}, and its receipts in a "receipts" subcollection. Locally it uses your Google
// login (gcloud auth application-default login); on Cloud Run it uses the service account the
// service runs as. No keys are stored in the code.
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { sortNewestFirst, type Store, type StoredFamily, type StoredReceipt } from './store';

export interface FirestoreStoreOptions {
  projectId: string;
  databaseId?: string;
}

// Firestore's automatic deletion (TTL) only works on real timestamps, so `expireAt` is written as
// one and turned back into an ISO string when read.
function toDoc<T extends { expireAt?: string }>(value: T): Record<string, unknown> {
  return { ...value, expireAt: value.expireAt ? new Date(value.expireAt) : undefined };
}
function fromDoc<T>(data: FirebaseFirestore.DocumentData): T {
  const out = { ...data };
  if (out.expireAt instanceof Timestamp) out.expireAt = out.expireAt.toDate().toISOString();
  return out as T;
}

export function createFirestoreStore({ projectId, databaseId = 'caresplit' }: FirestoreStoreOptions): Store {
  const db = new Firestore({ projectId, databaseId, ignoreUndefinedProperties: true });
  const families = db.collection('families');
  const receiptsOf = (familyId: string) => families.doc(familyId).collection('receipts');

  return {
    async getFamily(id) {
      const snap = await families.doc(id).get();
      return snap.exists ? fromDoc<StoredFamily>(snap.data()!) : undefined;
    },
    async saveFamily(family) {
      await families.doc(family.id).set(toDoc(family));
    },
    receipts(familyId) {
      const col = receiptsOf(familyId);
      return {
        async list() {
          // The 200 newest receipts are plenty for a family, and keep one request small.
          const snap = await col.orderBy('date', 'desc').limit(200).get();
          return sortNewestFirst(snap.docs.map((d) => fromDoc<StoredReceipt>(d.data())));
        },
        async get(id) {
          const snap = await col.doc(id).get();
          return snap.exists ? fromDoc<StoredReceipt>(snap.data()!) : undefined;
        },
        async save(receipt) {
          await col.doc(receipt.id).set(toDoc(receipt));
        },
      };
    },
    async deleteReceipts(familyId) {
      const snap = await receiptsOf(familyId).limit(500).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    },
  };
}
