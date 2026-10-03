import type { ReceiptView } from '../../../shared/types';
import { ErrorNote, LoadingNote } from '../components/Card';
import { ReceiptList } from '../components/ReceiptList';
import { useApi } from '../lib/api';
import { useViewAs } from '../lib/view-as';

export function Receipts() {
  const { viewer } = useViewAs();
  const state = useApi<ReceiptView[]>(`/api/receipts?as=${viewer.id}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
      {state.status === 'loading' && <LoadingNote />}
      {state.status === 'error' && <ErrorNote message={state.message} />}
      {state.status === 'ready' && <ReceiptList receipts={state.data} viewer={viewer} />}
    </div>
  );
}
