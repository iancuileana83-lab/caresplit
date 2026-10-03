import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AddReceipt } from './pages/AddReceipt';
import { Dashboard } from './pages/Dashboard';
import { Family } from './pages/Family';
import { ReceiptDetail } from './pages/ReceiptDetail';
import { Receipts } from './pages/Receipts';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="receipts/:id" element={<ReceiptDetail />} />
        <Route path="add" element={<AddReceipt />} />
        <Route path="family" element={<Family />} />
        <Route path="*" element={<p className="py-8 text-center text-quiet">That page doesn't exist.</p>} />
      </Route>
    </Routes>
  );
}
