type StatusInput = {
  isCompleted?: boolean;
  isPec?: boolean;
  pecStatus?: string | null;
  hasReport?: boolean;
  agentName?: string | null;
};

export function resolveTrackServiceStatus(input: StatusInput): {
  label: string;
  tone: "default" | "active" | "done" | "alert";
} {
  if (input.isCompleted) {
    return { label: "Mission terminée", tone: "done" };
  }
  const pec = (input.pecStatus ?? "").trim().toLowerCase();
  if (input.isPec || pec === "pec" || pec === "ep_large" || pec === "ep_bloc") {
    return { label: "Pris en charge", tone: "active" };
  }
  if (input.hasReport) {
    return { label: "En cours", tone: "active" };
  }
  if (input.agentName?.trim()) {
    return { label: "Greeter assigné", tone: "default" };
  }
  return { label: "Planifié", tone: "default" };
}

/** Affichage « Service de Madame X » à partir du nom client Sheet. */
export function formatPassengerServiceTitle(raw: string): string {
  const name = raw.trim();
  if (!name) return "Service passager";
  const lower = name.toLowerCase();
  if (/^(m\.|mme|mr|mrs|ms|dr|prof)\b/i.test(name)) {
    return `Service de ${name}`;
  }
  if (lower.startsWith("famille ") || lower.startsWith("family ")) {
    return `Service ${name}`;
  }
  return `Service de ${name}`;
}

export function resolveTrackServiceStatusEn(input: StatusInput): {
  label: string;
  tone: "default" | "active" | "done" | "alert";
} {
  if (input.isCompleted) {
    return { label: "Completed", tone: "done" };
  }
  const pec = (input.pecStatus ?? "").trim().toLowerCase();
  if (
    input.isPec ||
    pec === "pec" ||
    pec === "ep_large" ||
    pec === "ep_bloc" ||
    pec === "en_place"
  ) {
    return { label: "In Progress", tone: "active" };
  }
  if (input.hasReport) {
    return { label: "In Progress", tone: "active" };
  }
  if (input.agentName?.trim()) {
    return { label: "Assigned Greeter", tone: "default" };
  }
  return { label: "Scheduled", tone: "default" };
}

export function formatPassengerServiceTitleEn(raw: string): string {
  const name = raw.trim();
  if (!name) return "Passenger service";
  return `Service for ${name}`;
}
