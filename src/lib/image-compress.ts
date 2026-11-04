// Kompres foto di browser sebelum dikirim: foto kamera HP (3-8MB) diperkecil
// menjadi JPEG ~200-600KB sehingga upload & analisis AI jauh lebih cepat.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export async function compressImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      // Format tidak bisa di-decode browser — kirim apa adanya, server memvalidasi.
      return file;
    }
  }

  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // Latar putih agar PNG transparan tidak menjadi hitam saat jadi JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob || (blob.size >= file.size && file.type === "image/jpeg")) {
    return file;
  }
  const name = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${name}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
