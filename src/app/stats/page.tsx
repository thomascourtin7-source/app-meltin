import type { Metadata } from "next";

import { StatsClient } from "./stats-client";

export const metadata: Metadata = {
  title: "Tableau des scores",
};

export default function StatsPage() {
  return <StatsClient />;
}
