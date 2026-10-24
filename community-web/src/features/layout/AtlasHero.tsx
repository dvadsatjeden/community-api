import type { ReactElement } from "react";

export function AtlasGraphic({ communities, events, lastSync, accountReady }: { communities: number | null; events: number | null; lastSync: string | null; accountReady: boolean }): ReactElement {
  const syncedAt = lastSync ? new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" }).format(new Date(lastSync)) : null;
  return <aside className="dvcSystemPanel" aria-label="Prehľad komunitnej aplikácie">
    <div className="dvcSystemHeader"><span className="dvcSystemMark" aria-hidden="true">₿</span><span>DVADSATJEDEN / PREHĽAD</span></div>
    <div className="dvcSystemRows">
      <div><span>Komunity v mape</span><strong>{communities ?? "—"}</strong></div>
      <div><span>Budúce udalosti</span><strong>{events ?? "—"}</strong></div>
      <div><span>Účet na zariadení</span><strong>{accountReady ? "Vytvorený" : "Nenastavený"}</strong></div>
    </div>
    <p className="dvcSystemFooter">{syncedAt ? `Komunity aktualizované o ${syncedAt}` : "Načítavam komunity z API…"}</p>
  </aside>;
}
