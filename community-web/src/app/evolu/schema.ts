import * as E from "@evolu/common";

export const DvcRsvpId = E.id("DvcRsvp");
export type DvcRsvpId = typeof DvcRsvpId.Type;

const eventIdType = E.maxLength(500)(E.NonEmptyString);
const rsvpStatusType = E.maxLength(20)(E.NonEmptyString);

export const DvcSchema = {
  dvcRsvp: {
    id: DvcRsvpId,
    eventId: eventIdType,
    status: rsvpStatusType,
  },
} as const;
