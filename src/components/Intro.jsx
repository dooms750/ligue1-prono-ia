import React, { useEffect, useMemo, useState } from "react";
import { pairColors, inkOn } from "./ui.jsx";

// Animation de lancement : les projecteurs s'allument, le terrain se dessine,
// le rond central devient le logo, puis l'affiche de la journée balaie l'écran.
// Elle couvre aussi le temps de chargement des données. Un toucher la passe.

const MIN_MS = 3100;

export default function Intro({ data, ready, onDone }) {
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [elapsed, setElapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Flashs d'appareils photo dans les tribunes : positions et délais tirés une fois.
  const flashes = useMemo(() => Array.from({ length: 46 }, (_, i) => {
    const top = i % 2 === 0;
    return {
      x: Math.random() * 100,
      y: top ? 4 + Math.random() * 22 : 74 + Math.random() * 22,
      d: 300 + Math.random() * 2300,
      s: 2 + Math.random() * 3,
    };
  }), []);

  // Angle des faisceaux : de chaque coin vers le centre du terrain.
  const beams = useMemo(() => {
    const w = window.innerWidth, h = window.innerHeight, cx = w / 2, cy = h * 0.42;
    const deg = (dx, dy) => `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`;
    return { "--a0": deg(cx, cy), "--a1": deg(cx - w, cy), "--a2": deg(cx, cy - h), "--a3": deg(cx - w, cy - h) };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), reduced ? 700 : MIN_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  useEffect(() => {
    if (elapsed && ready && !leaving) setLeaving(true);
  }, [elapsed, ready, leaving]);

  useEffect(() => {
    if (!leaving) return undefined;
    const t = setTimeout(onDone, reduced ? 250 : 620);
    return () => clearTimeout(t);
  }, [leaving, onDone, reduced]);

  const skip = () => { if (ready) setLeaving(true); else setElapsed(true); };

  let affiche = null;
  if (data && data.upcoming?.length) {
    const t = data.teams;
    const m = [...data.upcoming].sort((a, b) => (t[a.home].rank + t[a.away].rank) - (t[b.home].rank + t[b.away].rank))[0];
    const H = t[m.home], A = t[m.away];
    const [cH, cA] = pairColors(H, A);
    affiche = { H, A, cH, cA, md: data.meta.nextMatchday };
  }

  return (
    <div className={`intro ${reduced ? "intro-reduced" : ""} ${leaving ? "intro-out" : ""}`}
      onClick={skip} role="presentation" style={beams}>
      <div className="intro-floods" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className={`flood flood-${i}`}><i /></span>)}
        {[0, 1, 2, 3].map((i) => <span key={`b${i}`} className={`beam beam-${i}`} />)}
        <span className="intro-flash" />
      </div>

      <div className="intro-flashes" aria-hidden="true">
        {flashes.map((f, i) => (
          <span key={i} style={{ left: `${f.x}%`, top: `${f.y}%`, width: f.s, height: f.s, animationDelay: `${f.d}ms` }} />
        ))}
      </div>

      <div className="intro-stage" aria-hidden="true">
        <svg className="intro-pitch" viewBox="0 0 1050 680">
          <defs>
            <linearGradient id="grass" x1="0" x2="1">
              {Array.from({ length: 14 }, (_, k) => (
                <React.Fragment key={k}>
                  <stop offset={k / 14} stopColor={k % 2 ? "#0e5c38" : "#11663f"} />
                  <stop offset={(k + 1) / 14} stopColor={k % 2 ? "#0e5c38" : "#11663f"} />
                </React.Fragment>
              ))}
            </linearGradient>
          </defs>
          <rect className="ip-grass" x="0" y="0" width="1050" height="680" fill="url(#grass)" />
          <g className="ip-lines" fill="none" stroke="#f2f5f8" strokeWidth="6" strokeLinecap="round">
            <rect className="ip-l ip-outer" x="30" y="30" width="990" height="620" pathLength="1" />
            <path className="ip-l ip-box" d="M30 139 H195 V541 H30 M1020 139 H855 V541 H1020" pathLength="1" />
            <path className="ip-l ip-six" d="M30 248 H85 V432 H30 M1020 248 H965 V432 H1020" pathLength="1" />
          </g>
          <g className="ip-mark" fill="none" stroke="#f2f5f8" strokeWidth="6" strokeLinecap="round">
            <line className="ip-l ip-half" x1="525" y1="30" x2="525" y2="650" pathLength="1" />
            <circle className="ip-l ip-circle" cx="525" cy="340" r="92" pathLength="1" />
            <circle className="ip-spot" cx="525" cy="340" r="9" fill="#ffe08a" stroke="none" />
          </g>
        </svg>
      </div>

      <div className="intro-word" aria-hidden="true">
        <span className="iw-name">{"Lucide".split("").map((c, i) => <i key={i} style={{ animationDelay: `${1650 + i * 55}ms` }}>{c}</i>)}</span>
        <span className="iw-tag">Chaque match de Ligue 1, expliqué</span>
      </div>

      {affiche && (
        <div className="intro-affiche" aria-hidden="true">
          <span className="ia-bar ia-home" style={{ background: affiche.cH, color: inkOn(affiche.cH) }}>{affiche.H.name}</span>
          <span className="ia-md">J{affiche.md}</span>
          <span className="ia-bar ia-away" style={{ background: affiche.cA, color: inkOn(affiche.cA) }}>{affiche.A.name}</span>
        </div>
      )}

      <p className="sr-only" role="status">Chargement de Lucide</p>
      <button className="intro-skip" onClick={(e) => { e.stopPropagation(); skip(); }}>Passer</button>
    </div>
  );
}
