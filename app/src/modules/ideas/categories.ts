import type { IdeaCategoryId } from "../contracts";

export const CATEGORIES: Array<{ id: IdeaCategoryId; label: string }> = [
  { id: "infra",     label: "Infraštruktúra" },
  { id: "events",    label: "Eventy" },
  { id: "education", label: "Edukácia" },
  { id: "tools",     label: "Nástroje" },
  { id: "community", label: "Komunita" },
  { id: "other",     label: "Iné" },
];
