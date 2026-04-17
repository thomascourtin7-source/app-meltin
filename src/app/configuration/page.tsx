import type { Metadata } from "next";

import { ConfigurationClient } from "./configuration-client";

export const metadata: Metadata = {
  title: "Configuration",
};

export default function ConfigurationPage() {
  return <ConfigurationClient />;
}
