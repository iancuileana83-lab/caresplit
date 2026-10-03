import { Camera, ImageUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { useViewAs } from '../lib/view-as';

export function AddReceipt() {
  const { viewer } = useViewAs();
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (viewer.role !== 'organiser') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Add receipt</h1>
        <Card>
          <p className="py-4 text-center text-quiet">Only the organiser adds receipts. Switch to Anna to try it.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add receipt</h1>
        <p className="mt-0.5 text-quiet">Photograph the pharmacy receipt or choose an image.</p>
      </div>

      <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-teal-700/40 bg-white p-4 text-center focus-within:outline-2 focus-within:outline-teal-700">
        {preview ? (
          <img src={preview} alt="Your receipt" className="max-h-72 rounded-lg object-contain" />
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Camera size={24} aria-hidden="true" />
            </span>
            <span className="font-medium">Take a photo or choose an image</span>
            <span className="text-sm text-quiet">JPG or PNG of the receipt</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPreview(URL.createObjectURL(file));
          }}
        />
      </label>

      {preview && (
        <Card>
          <div className="flex items-start gap-3 py-1">
            <ImageUp size={20} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
            <p className="text-sm text-quiet">Reading the receipt with AI comes in the next step. For now this only shows the photo.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
