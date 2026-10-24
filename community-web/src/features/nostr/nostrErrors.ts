/** Remote signers may reject with strings, undefined or cyclic objects, not just Error. */
export function nostrAuthErrorToCode(value: unknown): string {
  if (value instanceof Error) return value.message || "nostr_login_failed";
  if (typeof value === "string") return value || "nostr_login_failed";
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message || "nostr_login_failed";
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" && serialized.length > 0 ? serialized : "nostr_login_failed";
  } catch { return "nostr_login_failed"; }
}
