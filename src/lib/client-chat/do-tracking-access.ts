const DO_LINK_AUTHORIZED_NAMES = new Set([
  "javed",
  "javed ordi",
  "thomas",
]);

export function isDoLinkAuthorizedUser(
  displayName: string | null | undefined
): boolean {
  const normalized = displayName?.trim().toLowerCase() ?? "";
  return DO_LINK_AUTHORIZED_NAMES.has(normalized);
}
