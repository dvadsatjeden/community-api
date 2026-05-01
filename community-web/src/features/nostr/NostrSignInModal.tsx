import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { BunkerSigner, parseBunkerInput } from "nostr-tools/nip46";
import { finalizeEvent, generateSecretKey, nip19, SimplePool, type Event, type EventTemplate } from "nostr-tools";
import type { DerivedAccount } from "../account/seedRecovery";
import { fetchNostrAuthChallenge, NOSTR_AUTH_EVENT_KIND, postNostrAuthVerify } from "./nostrAuthApi";

export type NostrSignInModalProps = {
  apiBaseUrl: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called with account ready to persist (mnemonic non-empty until user confirms backup). */
  onSuccess: (account: DerivedAccount) => void;
};

function humanizeNostrAuthError(code: string): string {
  const map: Record<string, string> = {
    nostr_auth_not_configured: "Nostr prihlásenie na serveri nie je zapnuté.",
    nip07_extension_missing: "V tomto prehliadači nie je dostupné Nostr rozšírenie (NIP-07).",
    bunker_url_required: "Zadaj bunker alebo nostrconnect URL.",
    invalid_bunker_url: "Neplatný bunker / Nostr Connect odkaz.",
    nsec_required: "Vlož nsec.",
    invalid_nsec: "Neplatný nsec.",
    expected_nsec: "Očakávam bech32 nsec.",
    invalid_event_signature: "Podpis udalosti bol odmietnutý.",
    unknown_or_expired_challenge: "Výzva expirovala — skús znova.",
    invalid_verify_payload: "Neočakávaná odpoveď servera.",
    server_challenge_kind_mismatch: "Server vrátil neočakávaný typ výzvy.",
  };
  return map[code] ?? code.replace(/_/g, " ");
}

function buildAuthTemplate(challengeId: string): EventTemplate {
  return {
    kind: NOSTR_AUTH_EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["challenge", challengeId]],
    content: "",
  };
}

export const NostrSignInModal = (props: NostrSignInModalProps): ReactElement | null => {
  const { apiBaseUrl, isOpen, onClose, onSuccess } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bunkerInput, setBunkerInput] = useState("");
  const [nsecInput, setNsecInput] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setBusy(false);
    setBunkerInput("");
    setNsecInput("");
  }, [isOpen]);

  const runVerify = useCallback(
    async (sign: (tpl: EventTemplate) => Promise<Event>) => {
      setError(null);
      setBusy(true);
      try {
        const ch = await fetchNostrAuthChallenge(apiBaseUrl);
        if (ch.kind !== NOSTR_AUTH_EVENT_KIND) {
          throw new Error("server_challenge_kind_mismatch");
        }
        const tpl = buildAuthTemplate(ch.challengeId);
        const signed = await sign(tpl);
        const v = await postNostrAuthVerify(apiBaseUrl, signed);
        const account: DerivedAccount = {
          mnemonic: v.mnemonic.trim(),
          ownerId: v.ownerId,
          rsvpToken: v.rsvpToken,
          dataKey: v.dataKey,
          seedBackedUpConfirmed: false,
          authMethod: "nostr",
          nostrPubkeyBech32: v.npub || undefined,
        };
        onSuccess(account);
        onClose();
      } catch (e) {
        const raw = e instanceof Error ? e.message : "nostr_login_failed";
        setError(humanizeNostrAuthError(raw));
      } finally {
        setBusy(false);
      }
    },
    [apiBaseUrl, onClose, onSuccess]
  );

  const onNip07 = (): void => {
    void runVerify(async (tpl) => {
      const n = window.nostr;
      if (!n?.signEvent) {
        throw new Error("nip07_extension_missing");
      }
      return n.signEvent(tpl);
    });
  };

  const onNip46 = (): void => {
    void runVerify(async (tpl) => {
      const raw = bunkerInput.trim();
      if (!raw) throw new Error("bunker_url_required");
      const bp = await parseBunkerInput(raw);
      if (!bp) throw new Error("invalid_bunker_url");
      const pool = new SimplePool();
      let signer: BunkerSigner | null = null;
      try {
        signer = BunkerSigner.fromBunker(generateSecretKey(), bp, { pool });
        await signer.connect();
        return await signer.signEvent(tpl);
      } finally {
        try {
          if (signer) await signer.close();
        } catch {
          /* ignore close errors */
        }
        pool.close(bp.relays);
      }
    });
  };

  const onNsec = (): void => {
    void runVerify(async (tpl) => {
      const raw = nsecInput.trim();
      if (!raw) throw new Error("nsec_required");
      let secret: Uint8Array;
      try {
        const decoded = nip19.decode(raw);
        if (decoded.type !== "nsec") throw new Error("expected_nsec");
        secret = decoded.data as Uint8Array;
      } catch {
        throw new Error("invalid_nsec");
      }
      return finalizeEvent(tpl, secret);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="dvcModal" role="dialog" aria-modal="true" aria-label="Prihlásenie cez Nostr" onClick={onClose}>
      <div className="dvcModalPanel dvcNostrModalPanel" onClick={(e) => e.stopPropagation()}>
        <button className="dvcModalClose" type="button" onClick={onClose} aria-label="Zatvoriť">
          ×
        </button>
        <h2 className="dvcModalTitle">Prihlásenie cez Nostr</h2>
        <p className="dvcMuted dvcMuted--sm" style={{ marginBottom: "16px" }}>
          Vyber spôsob podpisu výzvy. Server overí tvoj kľúč a vytvorí účet zodpovedajúci tejto komunite.
        </p>

        {error ? <p className="dvcFieldError" style={{ marginBottom: "12px" }}>{error}</p> : null}

        <div className="dvcNostrMethodGrid">
          <MethodCard
            title="Rozšírenie v prehliadači (NIP-07)"
            description="Alby, nos2x alebo iné Nostr rozšírenie"
            icon="plug"
            onSelect={onNip07}
            disabled={busy}
          />

          <div className="dvcNostrMethodBlock">
            <span className="dvcNostrMethodIcon" aria-hidden>
              <IconLink />
            </span>
            <span className="dvcNostrMethodTitle">Nostr Connect (NIP-46)</span>
            <span className="dvcNostrMethodDesc">nsecBunker, vzdialený podpis — vlož bunker alebo nostrconnect URL a potvrď.</span>
            <input
              className="dvcInput dvcNostrBunkerInput"
              type="text"
              placeholder="bunker://… alebo nostrconnect://…"
              value={bunkerInput}
              onChange={(e) => setBunkerInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
            />
            <button
              className="dvcBtn dvcBtnPrimary dvcNostrMethodSubmit"
              type="button"
              onClick={onNip46}
              disabled={busy || bunkerInput.trim().length === 0}
            >
              Pripojiť a podpísať
            </button>
          </div>

          <div className="dvcNostrMethodBlock dvcNostrMethodBlock--warn">
            <span className="dvcNostrMethodIcon" aria-hidden>
              <IconWarn />
            </span>
            <span className="dvcNostrMethodTitle">Vložiť nsec (súkromný kľúč)</span>
            <span className="dvcNostrMethodDesc dvcNostrMethodDesc--warn">Neodporúčané — kľúč môže byť odhalený (clipboard, malware).</span>
            <textarea
              className="dvcTextarea dvcNostrNsecInput"
              placeholder="nsec1…"
              value={nsecInput}
              onChange={(e) => setNsecInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              disabled={busy}
              rows={2}
            />
            <button
              className="dvcBtn dvcBtnPrimary dvcNostrMethodSubmit"
              type="button"
              onClick={onNsec}
              disabled={busy || nsecInput.trim().length === 0}
            >
              Podpísať cez nsec
            </button>
          </div>
        </div>

        <div className="dvcRow" style={{ justifyContent: "flex-end", marginTop: "16px" }}>
          <button className="dvcBtn dvcBtnGhost" type="button" onClick={onClose} disabled={busy}>
            Zrušiť
          </button>
        </div>
      </div>
    </div>
  );
};

function MethodCard(props: {
  title: string;
  description: string;
  icon: "plug" | "link" | "warn";
  warn?: boolean;
  onSelect: () => void;
  disabled: boolean;
}): ReactElement {
  const { title, description, icon, warn, onSelect, disabled } = props;
  return (
    <button
      type="button"
      className={`dvcNostrMethodCard${warn ? " dvcNostrMethodCard--warn" : ""}`}
      onClick={onSelect}
      disabled={disabled}
    >
      <span className="dvcNostrMethodIcon" aria-hidden>
        {icon === "plug" ? <IconPlug /> : icon === "link" ? <IconLink /> : <IconWarn />}
      </span>
      <span className="dvcNostrMethodTitle">{title}</span>
      <span className={`dvcNostrMethodDesc${warn ? " dvcNostrMethodDesc--warn" : ""}`}>{description}</span>
    </button>
  );
}

function IconPlug(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}

function IconLink(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" />
      <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" />
    </svg>
  );
}

function IconWarn(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="dvcNostrWarnSvg">
      <path d="M12 2L1 21h22L12 2zm0 4.2L18.8 19H5.2L12 6.2zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
    </svg>
  );
}
