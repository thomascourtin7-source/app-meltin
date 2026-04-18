/**
 * Génère icon-192x192.png, icon-512x512.png et apple-touch-icon.png
 * à partir de public/icons/meltin-pwa-icon-source.png
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "public/icons/meltin-pwa-icon-source.png");
const outDir = path.join(root, "public/icons");

async function main() {
  await sharp(src)
    .resize(192, 192, { fit: "cover", position: "center" })
    .png()
    .toFile(path.join(outDir, "icon-192x192.png"));

  await sharp(src)
    .resize(512, 512, { fit: "cover", position: "center" })
    .png()
    .toFile(path.join(outDir, "icon-512x512.png"));

  await sharp(src)
    .resize(180, 180, { fit: "cover", position: "center" })
    .png()
    .toFile(path.join(outDir, "apple-touch-icon.png"));

  console.log("PWA icons générées dans public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
