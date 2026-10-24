export const TZ = "Europe/Bratislava";

export const dateParts = (iso: string) => {
  const d = new Date(iso);
  return {
    dow:   d.toLocaleString("sk-SK", { weekday: "short",   timeZone: TZ }),
    day:   d.toLocaleString("sk-SK", { day: "2-digit",     timeZone: TZ }),
    month: d.toLocaleString("sk-SK", { month: "short",     timeZone: TZ }),
    time:  d.toLocaleString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
  };
};

export function monthKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`;
}
export function plainTextHtml(html: string): string {
  const decoder = document.createElement("textarea");
  decoder.innerHTML = html.replace(/<[^>]*>/g, "");
  return decoder.value;
}
