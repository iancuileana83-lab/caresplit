const MAX_SIDE = 1600;
const SMALL_ENOUGH = 1_500_000;
const MAX_UPLOAD = 8 * 1024 * 1024;

/**
 * Shrinks big phone photos before upload (faster, cheaper, and the text stays readable).
 * Formats the browser cannot draw (like HEIC) are sent as they are if they are small enough.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (blob) return blob;
  } catch {
    /* fall through to the original file */
  }
  if (file.size > MAX_UPLOAD) throw new Error('That photo is too large. Try a smaller one.');
  return file;
}
