/**
 * Clé SWR partagée avec `DailyServicesView` pour les statuts rapports (PEC, complété, photo…).
 */
export const SERVICE_REPORTS_SWR_KEY_0 = "serviceReports" as const;

export type ServiceReportsSwrBundle = {
  hasReport: Record<string, boolean>;
  isPecByServiceId: Record<string, boolean>;
  isCompletedByServiceId: Record<string, boolean>;
  hasPhotoByServiceId: Record<string, boolean>;
  photoUrlByServiceId: Record<string, string | null>;
};

function matchesServiceReportsKey(
  key: unknown,
  spreadsheetId: string,
  dateKey: string
): boolean {
  return (
    Array.isArray(key) &&
    key.length >= 3 &&
    key[0] === SERVICE_REPORTS_SWR_KEY_0 &&
    key[1] === spreadsheetId &&
    key[2] === dateKey
  );
}

/**
 * Mise à jour optimiste du flag « rapport terminé » (ex. `completed_at` côté batch).
 * Utilisé depuis la page rapport pour masquer l’ETA sur le planning sans attendre le re-fetch.
 */
export function patchServiceReportsSwCaches(
  mutate: (
    matcher: (key: unknown) => boolean,
    updater: (
      current: ServiceReportsSwrBundle | undefined
    ) => ServiceReportsSwrBundle | undefined,
    opts?: { revalidate?: boolean }
  ) => void,
  opts: {
    spreadsheetId: string;
    dateKey: string;
    serviceId: string;
    isCompleted: boolean;
  }
): void {
  const { spreadsheetId, dateKey, serviceId, isCompleted } = opts;
  void mutate(
    (key) => matchesServiceReportsKey(key, spreadsheetId, dateKey),
    (current) => {
      if (!current) return current;
      return {
        ...current,
        isCompletedByServiceId: {
          ...current.isCompletedByServiceId,
          [serviceId]: isCompleted,
        },
      };
    },
    { revalidate: false }
  );
}
