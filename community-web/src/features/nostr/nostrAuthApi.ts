import type { Event } from "nostr-tools";

/** Must match `NOSTR_AUTH_EVENT_KIND` in community-api `nostr-auth.controller.ts`. */
export const NOSTR_AUTH_EVENT_KIND = 27241;

export type NostrChallengeResponse = {
  challengeId: string;
  kind: number;
  message: string;
};

export type NostrVerifySuccess = {
  ownerId: string;
  rsvpToken: string;
  dataKey: string;
  mnemonic: string;
  nostrPubkeyHex: string;
  npub: string;
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchNostrAuthChallenge(apiBaseUrl: string): Promise<NostrChallengeResponse> {
  const res = await fetch(joinUrl(apiBaseUrl, "/v1/auth/nostr/challenge"));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : `challenge_http_${res.status}`);
  }
  return (await res.json()) as NostrChallengeResponse;
}

export async function postNostrAuthVerify(apiBaseUrl: string, event: Event): Promise<NostrVerifySuccess> {
  const res = await fetch(joinUrl(apiBaseUrl, "/v1/auth/nostr/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<NostrVerifySuccess>;
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `verify_http_${res.status}`);
  }
  if (
    typeof body.ownerId !== "string" ||
    typeof body.rsvpToken !== "string" ||
    typeof body.dataKey !== "string" ||
    typeof body.mnemonic !== "string"
  ) {
    throw new Error("invalid_verify_payload");
  }
  return body as NostrVerifySuccess;
}
