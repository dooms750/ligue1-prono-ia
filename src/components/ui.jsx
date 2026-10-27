import React from "react";
import { pct } from "../model/narrative.js";

export function Badge({ team, size = 36 }) {
  return (
    <span
      className="badge"
      style={{ "--c": team.color, width: size, height: size, fontSize: size * 0.32 }}
      aria-hidden="true"
    >
      {team.short}
    </span>
  );
}

export function Form({ form }) {
  return (
    <span className="form" aria-label={`Forme : ${form.join(", ")}`}>
      {form.map((f, i) => (
        <span key={i} className={`form-dot f-${f}`}>{f}</span>
      ))}
    </span>
  );
}

// La signature visuelle de l'app : les probabilités posées sur un terrain.
// Zone de gauche = victoire à domicile, centre = nul, droite = victoire à l'extérieur.
export function ProbaPitch({ p, home, away, size = "md", ghost }) {
  const [h, d, a] = p;
  return (
    <div className={`pitch pitch-${size}`} role="img"
      aria-label={`${home.name} ${pct(h)}, nul ${pct(d)}, ${away.name} ${pct(a)}`}>
      <div className="pitch-lines" aria-hidden="true" />
      <div className="pitch-zone z-dom" style={{ width: `${h * 100}%` }}>
        <b>{Math.round(h * 100)}</b><small>{size !== "sm" && home.short}</small>
      </div>
      <div className="pitch-zone z-nul" style={{ width: `${d * 100}%` }}>
        <b>{Math.round(d * 100)}</b><small>{size !== "sm" && "nul"}</small>
      </div>
      <div className="pitch-zone z-ext" style={{ width: `${a * 100}%` }}>
        <b>{Math.round(a * 100)}</b><small>{size !== "sm" && away.short}</small>
      </div>
      {ghost && (
        <div className="pitch-ghost" aria-hidden="true"
          style={{ left: `${ghost[0] * 100}%`, width: `${ghost[1] * 100}%` }} />
      )}
    </div>
  );
}

export function Confidence({ c }) {
  return (
    <span className={`conf conf-${c.level}`}>
      <span className="conf-bars" aria-hidden="true"><i /><i /><i /></span>
      Confiance {c.label.toLowerCase()}
    </span>
  );
}

export function ScoreGrid({ grid, home, away }) {
  const n = 6;
  const max = Math.max(...grid.slice(0, n).flatMap((r) => r.slice(0, n)));
  return (
    <div className="grid-wrap">
      <div className="grid-axis-x">{away.name} marque →</div>
      <div className="grid-body">
        <div className="grid-axis-y">{home.name} marque ↓</div>
        <table className="score-grid">
          <thead>
            <tr><th />{Array.from({ length: n }, (_, j) => <th key={j}>{j}</th>)}</tr>
          </thead>
          <tbody>
            {grid.slice(0, n).map((row, i) => (
              <tr key={i}>
                <th>{i}</th>
                {row.slice(0, n).map((p, j) => (
                  <td key={j}
                    className={i > j ? "c-dom" : i === j ? "c-nul" : "c-ext"}
                    style={{ "--a": (p / max).toFixed(3) }}
                    title={`${i}-${j} : ${(p * 100).toFixed(1)} %`}>
                    {p >= 0.02 ? Math.round(p * 100) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DemoBanner({ meta }) {
  if (meta.mode !== "demo") {
    const d = meta.lastResult
      ? new Date(meta.lastResult + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
      : null;
    return (
      <p className="demo demo-real">
        {meta.mode === "onefootball"
          ? <>Vrais matchs de Ligue 1 {meta.season}. Résultats, buteurs, compos et actus : OneFootball et la presse
            spécialisée française{d ? `, dernier résultat le ${d}` : ""}. Cotes du marché : football-data.co.uk.</>
          : <>Vrais matchs de Ligue 1 {meta.season}. Résultats, xG et cotes : {meta.source}
            {d ? `, dernier résultat intégré le ${d}` : ""}. Les scores arrivent en général deux à trois jours après les matchs.</>}
      </p>
    );
  }
  return (
    <p className="demo">
      Version de démonstration : les clubs sont ceux de la Ligue 1 2026-27, mais les
      résultats, absences et cotes sont simulés.
    </p>
  );
}

// Les articles de presse d'un club, avec le média et un lien vers l'article.
export function PressList({ items, empty }) {
  if (!items || !items.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="press">
      {items.map((n) => (
        <li key={n.url}>
          <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
          <span>{n.publisher} · {ago(n.time)}</span>
        </li>
      ))}
    </ul>
  );
}

function ago(iso) {
  const h = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6));
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}

// Un match de la liste « à venir » dont la date est passée : joué, en attente du résultat.
export function isPast(m) {
  const kick = new Date(`${m.date}T${m.time || "21:00"}:00`);
  return Date.now() > kick.getTime() + 2 * 3600 * 1000;
}

// ---------- Design v3 : couleurs des clubs et bandeau de probabilités ----------

function hexRgb(h) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(h) {
  const [r, g, b] = hexRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Couleurs des deux clubs ; si elles se ressemblent, l'équipe à l'extérieur passe en orange.
export function pairColors(home, away) {
  const a = hexRgb(home.color), b = hexRgb(away.color);
  const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 255;
  return [home.color, d < 0.35 ? "#FF6A2B" : away.color];
}

export const inkOn = (hex) => (luminance(hex) > 0.42 ? "#0A0F18" : "#FFFFFF");

// Nombre qui glisse vers sa nouvelle valeur quand il change (réponse à une action).
export function Count({ value }) {
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || from.current === value) { from.current = value; setShown(value); return undefined; }
    const start = performance.now(), a = from.current, dur = 420;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - (1 - k) ** 3;
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

// Le bandeau : trois lames aux couleurs des clubs, largeur = probabilité.
export function ProbaBlade({ p, home, away, size = "md", labels = true }) {
  const [ch, ca] = pairColors(home, away);
  const segs = [
    { v: p[0], c: ch, t: home.short },
    { v: p[1], c: "#2A3548", t: "Nul" },
    { v: p[2], c: ca, t: away.short },
  ];
  const fav = p.indexOf(Math.max(...p));
  return (
    <div className={`blade blade-${size}`} role="img"
      aria-label={`${home.name} ${pct(p[0])}, nul ${pct(p[1])}, ${away.name} ${pct(p[2])}`}>
      {segs.map((s, i) => (
        <div key={i} className={`blade-seg ${i === fav ? "fav" : ""}`}
          style={{ flexGrow: Math.max(s.v, 0.06), background: s.c, color: inkOn(s.c) }}>
          <b><Count value={Math.round(s.v * 100)} /><small>%</small></b>
          {labels && size !== "sm" && <span>{s.t}</span>}
        </div>
      ))}
    </div>
  );
}

// Compte à rebours jusqu'au prochain coup d'envoi.
export function Countdown({ date, time }) {
  const target = new Date(`${date}T${time || "21:00"}:00`).getTime();
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const ms = target - now;
  if (ms <= 0) return <span className="cd cd-live">Coup d'envoi passé</span>;
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return (
    <span className="cd" aria-label={`Coup d'envoi dans ${d} jours ${h} heures ${m} minutes`}>
      {d > 0 && <><b>{d}</b>j </>}<b>{String(h).padStart(2, "0")}</b>h <b>{String(m).padStart(2, "0")}</b>min
    </span>
  );
}
