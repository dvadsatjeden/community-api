import { createIdFromString, sqliteFalse, sqliteTrue } from "@evolu/common";
import type { Evolu } from "@evolu/common/local-first";
import type { RsvpStatus } from "./rsvpStatus";
import { DvcRsvpId, DvcSchema } from "./schema";

type DvcE = Evolu<typeof DvcSchema>;
const T = DvcSchema.dvcRsvp;

export const allDvcRsvp = (dvc: DvcE) =>
  dvc.createQuery((db) =>
    db
      .selectFrom("dvcRsvp")
      .selectAll()
      .where("isDeleted", "is not", sqliteTrue)
  );

const eventIdT = T.eventId;
const statusT = T.status;

/**
 * Uloží RSVP lokálne (Evolu) + trvá na serveri; rovnaký mnímonik = rovnaké riadky medzi zariadeniami.
 */
export const upsertDvcRsvp = (
  dvc: DvcE,
  eventId: string,
  status: RsvpStatus
): { ok: boolean } => {
  const id = createIdFromString<"DvcRsvp">(`dvc:rsvp:${eventId}`) as typeof DvcRsvpId.Type;
  const ev = eventIdT.from(eventId);
  const st = statusT.from(status);
  if (!ev.ok || !st.ok) {
    return { ok: false };
  }
  const res = dvc.upsert("dvcRsvp", { id, eventId: ev.value, status: st.value, isDeleted: sqliteFalse });
  return { ok: res.ok };
};

export const clearDvcRsvp = (dvc: DvcE, eventId: string): { ok: boolean } => {
  const id = createIdFromString<"DvcRsvp">(`dvc:rsvp:${eventId}`) as typeof DvcRsvpId.Type;
  const res = dvc.update("dvcRsvp", { id, isDeleted: sqliteTrue });
  return { ok: res.ok };
};
