export const AGENT_PHONES: Record<string, string> = {
  Thomas: "+33750488101",
  Karthik: "+33634463349",
  Deva: "+33780765531",
  Pravin: "+33780712283",
  Simon: "+33786388946",
  Rayane: "+33611574740",
  Moubine: "+33623395823",
  Koumar: "+33695303868",
  Javed: "+33620787007",
  Elias: "+33758433113",
};

const PHONE_LOOKUP = new Map(
  Object.entries(AGENT_PHONES).map(([name, phone]) => [name.toLowerCase(), phone])
);

export function lookupAgentPhone(agentName: string): string | null {
  const trimmed = agentName.trim();
  if (!trimmed) return null;

  const exact = PHONE_LOOKUP.get(trimmed.toLowerCase());
  if (exact) return exact;

  const firstWord = trimmed.split(/\s+/)[0]?.trim();
  if (firstWord) {
    return PHONE_LOOKUP.get(firstWord.toLowerCase()) ?? null;
  }

  return null;
}

/** +33750488101 → +33 7 50 48 81 01 */
export function formatPhoneForDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("33") && digits.length === 11) {
    const rest = digits.slice(2);
    return `+33 ${rest[0]} ${rest.slice(1, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)}`;
  }
  return e164;
}
