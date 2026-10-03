// Receipts in Firestore: database "caresplit", one document per receipt under families/rowan.
// Locally it uses your Google login (gcloud auth application-default login); on Cloud Run it
// uses the service account the service runs as. No keys are stored in the code.
import { Firestore } from '@google-cloud/firestore';
import { sortNewestFirst, type ReceiptStore, type StoredReceipt } from './store';

export interface FirestoreStoreOptions {
  projectId: string;
  databaseId?: string;
  familyId?: string;
}

export function createFirestoreStore({ projectId, databaseId = 'caresplit', familyId = 'rowan' }: FirestoreStoreOptions): ReceiptStore {
  const db = new Firestore({ projectId, databaseId, ignoreUndefinedProperties: true });
  const col = db.collection('families').doc(familyId).collection('receipts');
  return {
    async list() {
      const snap = await col.get();
      return sortNewestFirst(snap.docs.map((d) => d.data() as StoredReceipt));
    },
    async get(id) {
      const snap = await col.doc(id).get();
      return snap.exists ? (snap.data() as StoredReceipt) : undefined;
    },
    async save(receipt) {
      await col.doc(receipt.id).set(receipt);
    },
  };
}
