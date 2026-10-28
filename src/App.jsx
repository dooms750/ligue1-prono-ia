import React, { useEffect, useState } from "react";
import { useHashRoute, usePicks } from "./lib/store.js";
import Home from "./pages/Home.jsx";
import Match from "./pages/Match.jsx";
import Stories from "./pages/Stories.jsx";
import Debrief from "./pages/Debrief.jsx";
import Bilan from "./pages/Bilan.jsx";
import Academie from "./pages/Academie.jsx";
import Intro from "./components/Intro.jsx";
import { useLive } from "./lib/live.js";

const NAV = [
  { path: "/", label: "Journée", icon: "M4 6h16M4 12h16M4 18h10" },
  { path: "/debrief", label: "Débrief", icon: "M5 12l4 4L19 6" },
  { path: "/bilan", label: "Bilan", icon: "M5 19V11M12 19V5M19 19v-6" },
  { path: "/academie", label: "Académie", icon: "M3 9l9-5 9 5-9 5-9-5zM7 11.5V16c3 2 7 2 10 0v-4.5" },
];

export default function App() {
  const route = useHashRoute();
  const [picks, setPick] = usePicks();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [intro, setIntro] = useState(true);
  const live = useLive(data ? data.upcoming : null);

  useEffect(() => {
    document.documentElement.style.overflow = intro ? "hidden" : "";
  }, [intro]);

  useEffect(() => {
    fetch("./data/season.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError("Les données de la saison n'ont pas pu être chargées. Lance « npm run data:demo » puis recharge la page."));
  }, []);

  const overlay = intro && <Intro data={data} ready={!!(data || error)} onDone={() => setIntro(false)} />;
  if (error) return <>{overlay}<main className="shell"><p className="empty">{error}</p></main></>;
  if (!data) return <>{overlay}<main className="shell"><p className="loading">Chargement de la journée…</p></main></>;

  const parts = route.split("/").filter(Boolean);
  const ctx = { data, picks, setPick, live };

  if (parts[0] === "match" && parts[2] === "story") return <>{overlay}<Stories id={parts[1]} {...ctx} /></>;

  let page;
  if (parts[0] === "match") page = <Match id={parts[1]} {...ctx} />;
  else if (parts[0] === "debrief") page = <Debrief md={Number(parts[1]) || data.meta.lastMatchday} {...ctx} />;
  else if (parts[0] === "bilan") page = <Bilan {...ctx} />;
  else if (parts[0] === "academie") page = <Academie />;
  else page = <Home {...ctx} />;

  const current = "/" + (parts[0] && parts[0] !== "match" ? parts[0] : "");

  return (
    <>
      {overlay}
      <header className="topbar">
        <a href="#/" className="logo" aria-label="Lucide, accueil">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="currentColor" />
            <circle cx="16" cy="16" r="7" fill="none" stroke="var(--craie)" strokeWidth="2" />
            <path d="M16 4v24" stroke="var(--craie)" strokeWidth="2" />
          </svg>
          Lucide
        </a>
        <span className="topbar-season">Ligue 1 · {data.meta.season}</span>
      </header>
      <main className="shell">{page}</main>
      <footer className="foot">
        <p>
          Lucide explique des probabilités, elle ne garantit aucun résultat. Les jeux d'argent sont
          interdits aux mineurs. Besoin d'aide : Joueurs Info Service, 09 74 75 13 13 (appel non surtaxé).
        </p>
      </footer>
      <nav className="tabbar" aria-label="Navigation principale">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} className={current === n.path ? "on" : ""}
            aria-current={current === n.path ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={n.icon} />
            </svg>
            {n.label}
          </a>
        ))}
      </nav>
    </>
  );
}
