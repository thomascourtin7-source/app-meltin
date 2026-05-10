import imageCompression from "browser-image-compression";

/**
 * Redresse l’image selon l’EXIF (orientation mobile), supprime l’EXIF du fichier
 * final, compresse en JPEG — pixels toujours « droits » pour PDF / aperçu.
 */
export async function normalizeServicePhotoForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier doit être une image.");
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: 0.85,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.82,
    /** false : applique l’orientation aux pixels et retire l’EXIF du résultat */
    preserveExif: false,
  });

  return new File([compressed], `photo-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
