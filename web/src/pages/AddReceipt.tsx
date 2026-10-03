import { Camera, LoaderCircle, PenLine, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { ReviewForm } from '../components/ReviewForm';
import { Steps } from '../components/Steps';
import { emptyDraft, readingToDraft, type Draft } from '../lib/draft';
import { prepareImage } from '../lib/image';
import { ReadFailure, readReceiptImage } from '../lib/read-receipt';
import { useViewAs } from '../lib/view-as';

const samples = [
  { file: '01-simple.png', label: 'Simple' },
  { file: '02-many-items.png', label: 'Many items' },
  { file: '03-discount.png', label: 'With discounts' },
  { file: '04-tax.png', label: 'With tax' },
  { file: '05-phone-photo.png', label: 'Tilted phone photo' },
  { file: '06-non-drug.png', label: 'Not only medicine' },
];

type Phase =
  | { name: 'choose' }
  | { name: 'reading' }
  | { name: 'error'; message: string }
  | { name: 'review'; draft: Draft; manual: boolean };

export function AddReceipt() {
  const { viewer } = useViewAs();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: 'choose' });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const lastImage = useRef<Blob | null>(null);
  const run = useRef(0);

  const [slow, setSlow] = useState(false);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  // After 15 seconds of reading, say so, so a slow AI service does not look like a frozen page.
  const reading = phase.name === 'reading';
  useEffect(() => {
    setSlow(false);
    if (!reading) return;
    const timer = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(timer);
  }, [reading]);

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

  async function read(image: Blob) {
    const id = ++run.current;
    lastImage.current = image;
    setImageUrl(URL.createObjectURL(image));
    setPhase({ name: 'reading' });
    try {
      const prepared = await prepareImage(image);
      const reading = await readReceiptImage(prepared, viewer.id);
      if (id === run.current) setPhase({ name: 'review', draft: readingToDraft(reading), manual: false });
    } catch (err) {
      if (id === run.current) setPhase({ name: 'error', message: err instanceof ReadFailure || err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  async function readSample(file: string) {
    try {
      const res = await fetch(`/demo-receipts/${file}`);
      if (!res.ok) throw new Error();
      await read(await res.blob());
    } catch {
      setPhase({ name: 'error', message: "Couldn't load that sample receipt." });
    }
  }

  const restart = () => {
    run.current++;
    setImageUrl(null);
    lastImage.current = null;
    setPhase({ name: 'choose' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{phase.name === 'review' ? 'Review receipt' : 'Add receipt'}</h1>
      </div>
      <Steps current={phase.name === 'review' ? 2 : 1} />

      {phase.name === 'choose' && (
        <>
          <p className="text-quiet">Photograph the pharmacy receipt or choose an image.</p>
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-teal-700/40 bg-white p-4 text-center focus-within:outline-2 focus-within:outline-teal-700">
            <span className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Camera size={24} aria-hidden="true" />
            </span>
            <span className="font-medium">Take a photo or choose an image</span>
            <span className="text-sm text-quiet">JPG, PNG or WebP of the receipt</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void read(file);
              }}
            />
          </label>

          <section aria-label="Sample receipts">
            <h2 className="mb-2 text-sm font-semibold">No receipt at hand? Try a sample</h2>
            <p className="mb-2 text-sm text-quiet">These receipts are fictional.</p>
            <ul className="grid grid-cols-2 gap-2">
              {samples.map((s) => (
                <li key={s.file}>
                  <button
                    type="button"
                    onClick={() => void readSample(s.file)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-white p-1.5 pr-3 text-left text-sm hover:bg-stone-50"
                  >
                    <img src={`/demo-receipts/${s.file}`} alt="" loading="lazy" className="size-10 rounded-lg bg-stone-100 object-cover object-top" />
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <button
            type="button"
            onClick={() => setPhase({ name: 'review', draft: emptyDraft(), manual: true })}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal-700"
          >
            <PenLine size={16} aria-hidden="true" />
            Enter it by hand
          </button>
        </>
      )}

      {phase.name === 'reading' && (
        <Card className="py-8" >
          <div role="status" className="flex flex-col items-center gap-3 text-center">
            <LoaderCircle size={32} className="animate-spin text-teal-700 motion-reduce:animate-none" aria-hidden="true" />
            <p className="font-medium">Reading your receipt…</p>
            <p className="text-sm text-quiet">{slow ? 'Still reading. The AI service is a bit slow right now, thanks for waiting.' : 'This usually takes 5 to 10 seconds.'}</p>
          </div>
          {imageUrl && <img src={imageUrl} alt="" className="mx-auto mt-4 max-h-40 rounded-lg object-contain opacity-70" />}
        </Card>
      )}

      {phase.name === 'error' && (
        <Card>
          <div role="alert" className="space-y-3 py-2">
            <p className="font-medium">We couldn't read the receipt</p>
            <p className="text-sm text-quiet">{phase.message}</p>
            <div className="flex flex-wrap gap-2">
              {lastImage.current && (
                <button
                  type="button"
                  onClick={() => void read(lastImage.current as Blob)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800"
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={() => setPhase({ name: 'review', draft: emptyDraft(), manual: true })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium"
              >
                <PenLine size={16} aria-hidden="true" />
                Enter it by hand
              </button>
              <button type="button" onClick={restart} className="min-h-11 px-2 text-sm text-quiet underline underline-offset-2">
                Choose another photo
              </button>
            </div>
          </div>
        </Card>
      )}

      {phase.name === 'review' && (
        <ReviewForm
          draft={phase.draft}
          manual={phase.manual}
          imageUrl={phase.manual ? null : imageUrl}
          onChange={(draft) => setPhase({ name: 'review', draft, manual: phase.manual })}
          onConfirm={(receipt) => navigate('/add/split', { state: { receipt } })}
        />
      )}

      {phase.name === 'review' && (
        <button type="button" onClick={restart} className="min-h-11 w-full text-center text-sm text-quiet underline underline-offset-2">
          Start over with another receipt
        </button>
      )}
    </div>
  );
}
