import type { ReceiptReading } from '../../../shared/receipt-check';

export class ReadFailure extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Sends the receipt photo to the server, which reads it with Gemini. */
export async function readReceiptImage(image: Blob, viewerId: string): Promise<ReceiptReading> {
  let res: Response;
  try {
    res = await fetch(`/api/receipts/read?as=${encodeURIComponent(viewerId)}`, {
      method: 'POST',
      headers: { 'Content-Type': image.type || 'image/jpeg' },
      body: image,
    });
  } catch {
    throw new ReadFailure("Couldn't reach the server. Check your connection and try again.", 'network');
  }
  if (res.ok) return (await res.json()) as ReceiptReading;
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* not JSON */
  }
  throw new ReadFailure(body.error ?? 'Something went wrong while reading the receipt.', body.code);
}
