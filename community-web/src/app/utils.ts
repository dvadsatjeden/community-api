export const TZ = "UTC";

export const dateParts = (iso: string) => {
  const d = new Date(iso);
  return {
    dow:   d.toLocaleString("sk-SK", { weekday: "short",   timeZone: TZ }),
    day:   d.toLocaleString("sk-SK", { day: "2-digit",     timeZone: TZ }),
    month: d.toLocaleString("sk-SK", { month: "short",     timeZone: TZ }),
    time:  d.toLocaleString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
  };
};
