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
