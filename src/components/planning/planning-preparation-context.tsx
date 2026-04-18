"use client";

import * as React from "react";

type PlanningPreparationContextValue = {
  isPreparingTomorrow: boolean;
  setPreparingTomorrow: (value: boolean) => void;
};

const PlanningPreparationContext =
  React.createContext<PlanningPreparationContextValue | null>(null);

export function PlanningPreparationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isPreparingTomorrow, setPreparingTomorrow] = React.useState(false);
  const value = React.useMemo(
    () => ({ isPreparingTomorrow, setPreparingTomorrow }),
    [isPreparingTomorrow]
  );
  return (
    <PlanningPreparationContext.Provider value={value}>
      {children}
    </PlanningPreparationContext.Provider>
  );
}

export function usePlanningPreparation(): PlanningPreparationContextValue {
  const ctx = React.useContext(PlanningPreparationContext);
  if (!ctx) {
    throw new Error(
      "usePlanningPreparation doit être utilisé dans PlanningPreparationProvider."
    );
  }
  return ctx;
}
