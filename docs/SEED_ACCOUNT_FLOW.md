# 12-word BIP-39 seed account flow

## Onboarding
1. User opens app first time.
2. App generates 12-word mnemonic using **BIP-39** (English 2048-word list, 128-bit entropy + checksum).
3. UI forces backup confirmation:
   - user must re-enter 3 random words (e.g. #2, #7, #11)
   - without confirmation, account is not marked as recoverable.
4. App derives:
   - `ownerId` (public anonymous identity)
   - `rsvpToken` (stable anonymous token for event voting)
   - `dataKey` (local encryption key)
5. App stores encrypted local state + metadata in browser storage.

## Restore on another device
1. User chooses "Restore account".
2. User enters 12 words.
3. App validates BIP-39 checksum + word list membership.
4. App derives the same `ownerId`, `rsvpToken`, and `dataKey`.
5. App downloads/syncs remote encrypted records and merges with local cache.
6. App asks for conflict resolution only if same record changed on both devices.

## Security guardrails
- Seed never leaves device.
- Server receives only anonymous token values, never mnemonic.
- UI warns that lost seed means no account recovery.
- Clipboard copy for seed should be optional and auto-cleared hint is shown.
