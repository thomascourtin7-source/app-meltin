/**
 * Détection et normalisation de numéros (formats internationaux + France).
 */

import type { DailyServiceRow } from "@/lib/planning/daily-services-types";

/** Caractères non numériques retirés (sauf + géré par formatForLink). */
export function sanitizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Ne conserve que le premier « + » éventuel et tous les chiffres.
 * Ex. "+33 6 45 10 20 82" → "+33645102082"
 */
export function formatForLink(raw: string): string {
  let out = "";
  let hasPlus = false;
  for (const ch of raw) {
    if (ch === "+") {
      if (!hasPlus) {
        hasPlus = true;
        out += "+";
      }
    } else if (/\d/.test(ch)) {
      out += ch;
    }
  }
  if (!hasPlus) {
    return sanitizePhoneDigits(raw);
  }
  return out;
}

/**
 * International : + puis 7 à 15 chiffres (séparateurs optionnels).
 * Ne pas chevaucher : ancrage sur le +.
 */
const INTL_PLUS_PATTERN = /\+(?:[\s().-]*\d){7,15}/g;

/**
 * France : +33 / 0033 / 0X XX XX XX XX
 */
const FR_PHONE_PATTERN =
  /(?:\+33|0033)[\s.\-/]*[1-9](?:[\s.\-/]*\d{2}){4}|0[1-9](?:[\s.\-/]*\d{2}){4}/g;

export type NormalizedPhoneLinks = {
  telHref: string;
  smsHref: string;
  waHref: string;
  display: string;
  /** E.164 avec + pour affichage court dans le menu. */
  e164Display: string;
  waDigits: string;
};

/**
 * Convertit un fragment affiché en liens (tel / sms avec +, wa.me sans +).
 */
export function normalizePhoneForLinks(raw: string): NormalizedPhoneLinks | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const formatted = formatForLink(trimmed);
  let d = sanitizePhoneDigits(
    formatted.startsWith("+") ? formatted.slice(1) : formatted
  );

  if (formatted.startsWith("+") && d.length >= 7 && d.length <= 15) {
    const e164 = `+${d}`;
    return {
      telHref: `tel:${e164}`,
      smsHref: `sms:${e164}`,
      waHref: `https://wa.me/${d}`,
      display: trimmed,
      e164Display: e164,
      waDigits: d,
    };
  }

  if (d.startsWith("0033")) {
    d = `33${d.slice(4)}`;
  }

  if (d.startsWith("0") && d.length === 10) {
    d = `33${d.slice(1)}`;
  }

  if (d.startsWith("33") && d.length >= 11 && d.length <= 13) {
    const e164 = `+${d}`;
    return {
      telHref: `tel:${e164}`,
      smsHref: `sms:${e164}`,
      waHref: `https://wa.me/${d}`,
      display: trimmed,
      e164Display: e164,
      waDigits: d,
    };
  }

  return null;
}

export type PhoneMatch = {
  start: number;
  end: number;
  raw: string;
};

function mergeOverlapping(matches: PhoneMatch[]): PhoneMatch[] {
  if (matches.length <= 1) return matches;
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const out: PhoneMatch[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (!last) {
      out.push(m);
      continue;
    }
    if (m.start >= last.end) {
      out.push(m);
      continue;
    }
    const lastLen = last.end - last.start;
    const curLen = m.end - m.start;
    if (curLen > lastLen) {
      out[out.length - 1] = m;
    }
  }
  return out;
}

function collectMatchesWithPattern(
  text: string,
  re: RegExp,
  matches: PhoneMatch[]
): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    if (normalizePhoneForLinks(raw)) {
      matches.push({ start: m.index, end: m.index + raw.length, raw });
    }
  }
}

/**
 * Trouve les numéros dans un texte (international +…, FR).
 */
export function findPhoneMatchesInText(text: string): PhoneMatch[] {
  if (!text.trim()) return [];
  const matches: PhoneMatch[] = [];
  collectMatchesWithPattern(text, INTL_PLUS_PATTERN, matches);
  collectMatchesWithPattern(text, FR_PHONE_PATTERN, matches);
  return mergeOverlapping(matches.sort((a, b) => a.start - b.start));
}

export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "phone"; value: string };

export function splitTextByPhoneMatches(text: string): TextSegment[] {
  const matches = findPhoneMatchesInText(text);
  if (matches.length === 0) return [{ kind: "text", value: text }];

  const out: TextSegment[] = [];
  let cursor = 0;
  for (const pm of matches) {
    if (pm.start > cursor) {
      out.push({ kind: "text", value: text.slice(cursor, pm.start) });
    }
    out.push({ kind: "phone", value: pm.raw });
    cursor = pm.end;
  }
  if (cursor < text.length) {
    out.push({ kind: "text", value: text.slice(cursor) });
  }
  return out;
}

export function collectServiceCardSearchableText(row: DailyServiceRow): string {
  return [
    row.client,
    row.type,
    row.tel,
    row.driverInfo,
    row.destProv,
    row.vol,
    row.rdv1,
    row.rdv2,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

export function findPhoneNumbersInServiceCard(
  row: DailyServiceRow
): PhoneMatch[] {
  return findPhoneMatchesInText(collectServiceCardSearchableText(row));
}
