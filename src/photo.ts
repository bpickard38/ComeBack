/*
  Getting a picture ready to be a profile photo: cropped to a square from
  the middle and shrunk, so a 5 MB phone photo becomes a small JPEG that
  loads fast and fits the storage limit (see supabase/profile_photos.sql).
*/

/** Width and height of the saved photo, in pixels. Big enough to stay sharp on a phone. */
export const PHOTO_SIZE = 320;

/** The square to cut from the middle of an image: where it starts and how big it is. */
export function centerSquare(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return { x: Math.floor((width - size) / 2), y: Math.floor((height - size) / 2), size };
}

/** Turns a picture file into a square JPEG. Throws if the file isn't a picture the browser can read. */
export async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t prepare photos.');
  const { x, y, size } = centerSquare(bitmap.width, bitmap.height);
  context.drawImage(bitmap, x, y, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.85);
  });
}
