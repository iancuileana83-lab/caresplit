import { Compass } from 'lucide-react';
import { Route, Routes } from 'react-router-dom';
import { Card } from './components/Card';
import { EmptyState } from './components/EmptyState';
import { Layout } from './components/Layout';
import { AddReceipt } from './pages/AddReceipt';
import { Assistant } from './pages/Assistant';
import { Dashboard } from './pages/Dashboard';
import { Family } from './pages/Family';
import { ReceiptDetail } from './pages/ReceiptDetail';
import { Receipts } from './pages/Receipts';
import { SplitPreview } from './pages/SplitPreview';

function NotFound() {
  return (
    <Card>
      <EmptyState icon={Compass} title="That page doesn't exist" action={{ to: '/', label: 'Go to the start' }}>
        The link may be old or mistyped.
      </EmptyState>
    </Card>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="receipts/:id" element={<ReceiptDetail />} />
        <Route path="add" element={<AddReceipt />} />
        <Route path="add/split" element={<SplitPreview />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="family" element={<Family />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
