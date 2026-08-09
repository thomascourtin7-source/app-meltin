import type { ServiceReportKind } from "@/lib/planning/service-kind";
import {
  findPhoneMatchesInText,
  normalizePhoneForLinks,
  sanitizePhoneDigits,
} from "@/lib/planning/phone-contact";

/** Premier numéro du champ Tél., chiffres seuls pour wa.me (ex. 966505445440). */
export function extractFirstPhoneWaDigits(telField: string): string | null {
  const text = telField.trim();
  if (!text) return null;

  const matches = findPhoneMatchesInText(text);
  if (matches.length > 0) {
    const links = normalizePhoneForLinks(matches[0].raw);
    if (links?.waDigits) return links.waDigits;
  }

  const digits = sanitizePhoneDigits(text.replace(/["']/g, ""));
  return digits.length >= 7 ? digits : null;
}

export function resolveGreeterWhatsAppName(opts: {
  assigneeLabels: readonly string[];
  meName: string;
  urgentAssigneeLabel?: string;
}): string | null {
  const urgent = opts.urgentAssigneeLabel?.trim();
  for (const label of opts.assigneeLabels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    if (urgent && trimmed === urgent) continue;
    return trimmed;
  }
  const me = opts.meName.trim();
  return me || null;
}

export function buildGreeterPassengerWhatsAppMessage(opts: {
  greeterName: string;
  serviceKind: ServiceReportKind;
  flightNumber?: string | null;
}): string {
  const greeter = opts.greeterName.trim();
  const kind = opts.serviceKind;
  const flight = opts.flightNumber?.trim();
  const flightPart = flight ? ` ${flight}` : "";

  return `Hi, I'm ${greeter} your greeter for your ${kind}${flightPart} at CDG airport. How are you ?\nI will be waiting for you at the end of the jetbridge.\nThank you`;
}

export function buildGreeterPassengerWhatsAppUrl(opts: {
  telField: string;
  greeterName: string;
  serviceKind: ServiceReportKind;
  flightNumber?: string | null;
}): string | null {
  const phone = extractFirstPhoneWaDigits(opts.telField);
  const greeter = opts.greeterName.trim();
  if (!phone || !greeter) return null;

  const message = buildGreeterPassengerWhatsAppMessage({
    greeterName: greeter,
    serviceKind: opts.serviceKind,
    flightNumber: opts.flightNumber,
  });

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
