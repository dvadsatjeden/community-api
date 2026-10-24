import type { ReactElement } from "react";
import logoDvadsatjedenUrl from "../../app/logos/logo-dvadsatjeden.svg?url";

export type AppView = "uvod" | "home" | "calendar" | "map" | "ideas" | "info";

function BrandIdentity(): ReactElement {
  return <span className="dvcBrandIdentity">
    <img className="dvcBrandLogo" src={logoDvadsatjedenUrl} width="265" height="36" alt="" />
    <span className="dvcBrandCaption">bitcoin komunita</span>
  </span>;
}

const sections: Record<AppView, { label: string; title: string; description: string }> = {
  uvod: { label: "Dvadsatjeden / Prehľad", title: "Bitcoin komunita SK / CZ", description: "Udalosti, komunity a projekty na jednom mieste." },
  home: { label: "01 / Udalosti", title: "Kalendár udalostí", description: "Meetupy, bitcoin pivo a konferencie na Slovensku a v Česku. Vyber si udalosť a potvrď účasť." },
  calendar: { label: "01 / Udalosti", title: "Udalosti podľa dátumu", description: "Mesačný prehľad nadchádzajúcich udalostí. Otvor detail a pridaj si udalosť do kalendára." },
  map: { label: "02 / Mapa", title: "Mapa komunít", description: "Lokálne bitcoin komunity a udalosti. Vyber miesto na mape alebo použi svoju polohu." },
  ideas: { label: "03 / Projekty", title: "Nápady a projekty", description: "Navrhni projekt, pridaj komentár alebo podpor nápad hlasom." },
  info: { label: "04 / Nastavenia", title: "Účet a nastavenia", description: "Správa účtu, záloha prístupu a nastavenie upozornení." },
};

function NavigationIcon({ kind }: { kind: AppView }): ReactElement {
  const path = {
    uvod: "M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10",
    home: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-12 4h1m3 0h1m3 0h1m-9 4h1m3 0h1",
    calendar: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-12 4h1m3 0h1m3 0h1",
    map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16",
    ideas: "M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4Z",
    info: "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm-4 14v-2a8 8 0 0 1 16 0v2",
  }[kind];
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={path} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

type NavigationProps = { view: AppView; onNavigate: (view: AppView) => void; events: boolean; map: boolean; ideas: boolean };
export function AppNavigation({ view, onNavigate, events, map, ideas }: NavigationProps): ReactElement {
  const items: Array<{ view: AppView; label: string; show: boolean }> = [
    { view: "uvod", label: "Úvod", show: true }, { view: "home", label: "Kalendár", show: events },
    { view: "map", label: "Mapa", show: map }, { view: "ideas", label: "Nápady", show: ideas }, { view: "info", label: "Nastavenia", show: true },
  ];
  return <nav className="dvcNav" aria-label="Navigácia">
    <button className="dvcNavBrand" type="button" onClick={() => onNavigate("uvod")} aria-label="Dvadsatjeden — domov">
      <BrandIdentity />
    </button>
    {items.filter(item => item.show).map(item => {
      const active = view === item.view || (item.view === "home" && view === "calendar");
      return <button className={`dvcNavItem${active ? " dvcNavItem--active" : ""}`} key={item.view} type="button" onClick={() => onNavigate(item.view)} aria-current={active ? "page" : undefined}>
        <NavigationIcon kind={item.view} /><span>{item.label}</span>
      </button>;
    })}
    <div className="dvcNavFooter"><span>BITCOIN / SK + CZ</span><p>Otvorená komunita.<br />Bez emailovej registrácie.</p><a href="https://www.dvadsatjeden.org" target="_blank" rel="noreferrer">dvadsatjeden.org ↗</a></div>
  </nav>;
}

export function AppHeader({ view, hasAccount, onHome, onAccount }: { view: AppView; hasAccount: boolean; onHome: () => void; onAccount: () => void }): ReactElement {
  return <header className="dvcAppHeader">
    <button type="button" className="dvcHeaderBrand" onClick={onHome} aria-label="Dvadsatjeden — domov"><BrandIdentity /></button>
    <span className="dvcHeaderContext">{sections[view].label}</span>
    <button type="button" className="dvcHeaderAccount" onClick={onAccount} aria-label={hasAccount ? "Otvoriť môj účet" : "Vytvoriť alebo obnoviť účet"}><NavigationIcon kind="info" /><span>{hasAccount ? "Môj účet" : "Prihlásiť sa"}</span></button>
  </header>;
}

export function PageIntro({ view }: { view: AppView }): ReactElement {
  return <div className="dvcPageIntro"><p className="dvcEyebrow">{sections[view].label}</p><h1>{sections[view].title}</h1><p>{sections[view].description}</p></div>;
}
