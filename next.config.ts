import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  /** SW manuel `public/sw.js` (push) — pas d’écrasement Workbox */
  disable: true,
  register: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Masque le badge flottant « N » (indicateur de route) en développement */
  devIndicators: false,
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url))),
};

export default withPWA(nextConfig);
