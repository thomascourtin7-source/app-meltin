import { Suspense } from "react";

import { PlanningIaClient } from "./planning-ia-client";

export default function PlanningIaPage() {
  return (
    <Suspense fallback={null}>
      <PlanningIaClient />
    </Suspense>
  );
}

