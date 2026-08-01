async function blobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Unable to process image."));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (png) => {
            if (png) resolve(png);
            else reject(new Error("Unable to convert image."));
          },
          "image/png"
        );
      };
      img.onerror = () => reject(new Error("Unable to load image."));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function urlToPngBlob(url: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Unable to process image."));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (png) => {
          if (png) resolve(png);
          else reject(new Error("Unable to convert image."));
        },
        "image/png"
      );
    };
    img.onerror = () => reject(new Error("Unable to load image."));
    img.src = url;
  });
}

async function fetchImageBlob(url: string): Promise<Blob> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (response.ok) {
      const blob = await response.blob();
      if (blob.type.startsWith("image/")) return blob;
    }
  } catch {
    /* canvas fallback below */
  }
  return urlToPngBlob(url);
}

export async function copyImageUrlToClipboard(imageUrl: string): Promise<void> {
  const url = imageUrl.trim();
  if (!url) throw new Error("Image URL is missing.");

  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard?.write ||
    typeof ClipboardItem === "undefined"
  ) {
    throw new Error("Clipboard is not supported in this browser.");
  }

  const rawBlob = await fetchImageBlob(url);
  const pngBlob = await blobToPng(rawBlob);

  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": pngBlob,
    }),
  ]);
}
