import React from "react";
import { DemoBanner } from "../components/ui.jsx";
import { outcomeOf, brier, impliedFromOdds } from "../model/poisson.js";
import { pct } from "../model/narrative.js";
import { matchId } from "../lib/store.js";

// Référence naïve : les fréquences moyennes de la Ligue 1 (domicile, nul, extérieur).
const NAIVE = [0.44, 0.27, 0.29];

export default function Bilan({ data, picks }) {
  const { played, meta } = data;
  const rows = played.map((m) => {
    const o = outcomeOf(m.hg, m.ag);
    const p = m.pred.p;
    const mk = impliedFromOdds(m.odds);
    return {
      m, o, p,
      right: p.indexOf(Math.max(...p)) === o,
      bIA: brier(p, o),
      bMk: mk ? brier(mk.p, o) : null,
      bNaive: brier(NAIVE, o),
      over: m.hg + m.ag > 2,
      pOver: m.pred.over25,
    };
  });
  const n = rows.length;
  const acc = rows.filter((r) => r.right).length;
  const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / n;
  const bIA = avg("bIA"), bNaive = avg("bNaive");
  const hasMk = rows.every((r) => r.bMk != null);
  const bMk = hasMk ? avg("bMk") : null;
  const overOk = rows.filter((r) => (r.pOver >= 0.5) === r.over).length;

  const mine = rows.filter((r) => picks[matchId(r.m)] != null);
  const mineOk = mine.filter((r) => picks[matchId(r.m)] === r.o).length;

  const byMd = Array.from({ length: meta.lastMatchday }, (_, k) => {
    const rs = rows.filter((r) => r.m.md === k + 1);
    return { md: k + 1, ok: rs.filter((r) => r.right).length, n: rs.length };
  });

  // Calibration : quand l'IA annonce 40 %, est-ce que ça arrive 4 fois sur 10 ?
  const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const calib = bins.slice(0, -1).map((lo, k) => {
    const hi = bins[k + 1];
    const pts = rows.flatMap((r) => r.p.map((p, i) => ({ p, hit: i === r.o })))
      .filter((x) => x.p >= lo && x.p < hi);
    return {
      lo, hi, n: pts.length,
      pred: pts.length ? pts.reduce((s, x) => s + x.p, 0) / pts.length : null,
      obs: pts.length ? pts.filter((x) => x.hit).length / pts.length : null,
    };
  }).filter((b) => b.n > 0);

  const best = hasMk && bMk < bIA;

  return (
    <>
      <DemoBanner meta={meta} />
      <header className="page-head">
        <h1>Le bilan de l'IA, sans filtre</h1>
        <p className="lead">
          Chaque pronostic a été calculé avant le match, avec uniquement les résultats connus à ce moment-là.
          Rien n'est retouché après coup.
        </p>
      </header>

      <section className="stats stats-4">
        <div><b>{pct(acc / n)}</b><span>Bon résultat (1, N ou 2) sur {n} matchs</span></div>
        <div><b>{pct(overOk / n)}</b><span>Bonne lecture du « plus de 2,5 buts »</span></div>
        <div><b>{bIA.toFixed(3).replace(".", ",")}</b><span>Score de Brier de l'IA (plus bas = mieux)</span></div>
        <div><b>{mine.length ? `${mineOk}/${mine.length}` : "–"}</b><span>{mine.length ? "Tes bons pronos" : "Tes pronos apparaîtront après les matchs"}</span></div>
      </section>

      <section className="block">
        <h2>Qui se trompe le moins ?</h2>
        <p className="muted">Le score de Brier mesure l'écart entre les probabilités annoncées et la réalité.</p>
        <Compare items={[
          { label: "IA Lucide", v: bIA, me: true },
          ...(hasMk ? [{ label: "Marché des cotes", v: bMk }] : []),
          { label: "Toujours la moyenne de la L1", v: bNaive },
        ]} />
        <p className="explain">
          {best
            ? "Pour l'instant, le marché fait mieux que l'IA. C'est normal en début de saison : l'IA ne connaît que quelques journées, alors que le marché intègre aussi les transferts, les blessures et la saison passée. L'objectif est de réduire cet écart journée après journée."
            : "L'IA fait au moins aussi bien que le marché sur cette période. À confirmer sur une saison entière avant d'en tirer des conclusions."}
        </p>
      </section>

      <section className="block">
        <h2>Est-ce que l'IA est bien calibrée ?</h2>
        <p className="muted">Si elle annonce 40 %, le résultat doit arriver environ 4 fois sur 10. Plus les points sont proches de la diagonale, plus ses probabilités sont honnêtes.</p>
        <Calibration bins={calib} />
      </section>

      <section className="block">
        <h2>Journée par journée</h2>
        <div className="md-bars">
          {byMd.map((b) => (
            <a key={b.md} href={`#/debrief/${b.md}`} className="md-bar" aria-label={`Journée ${b.md} : ${b.ok} sur ${b.n}`}>
              <i style={{ height: `${(b.ok / b.n) * 100}%` }} />
              <b>{b.ok}</b>
              <span>J{b.md}</span>
            </a>
          ))}
        </div>
        <p className="muted small">Bons résultats sur 9 matchs. Touche une journée pour lire son débrief.</p>
      </section>
    </>
  );
}

function Compare({ items }) {
  const max = Math.max(...items.map((i) => i.v)) * 1.05;
  return (
    <div className="compare">
      {items.map((i) => (
        <div key={i.label} className={i.me ? "me" : ""}>
          <span>{i.label}</span>
          <div><i style={{ width: `${(i.v / max) * 100}%` }} /></div>
          <b>{i.v.toFixed(3).replace(".", ",")}</b>
        </div>
      ))}
    </div>
  );
}

function Calibration({ bins }) {
  const S = 240, pad = 34, R = 14;
  const x = (v) => pad + v * (S - pad - R);
  const y = (v) => S - pad - v * (S - pad - R);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="calib" role="img"
      aria-label="Graphique de calibration : probabilité annoncée contre fréquence observée">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={y(0)} x2={x(t)} y2={y(1)} className="calib-grid" />
          <line x1={x(0)} y1={y(t)} x2={x(1)} y2={y(t)} className="calib-grid" />
          <text x={x(t)} y={S - 12} textAnchor="middle">{t * 100}%</text>
          <text x={pad - 6} y={y(t) + 4} textAnchor="end">{t * 100}%</text>
        </g>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="calib-diag" />
      <polyline points={bins.map((b) => `${x(b.pred)},${y(b.obs)}`).join(" ")} className="calib-line" />
      {bins.map((b) => (
        <circle key={b.lo} cx={x(b.pred)} cy={y(b.obs)} r={3 + Math.sqrt(b.n) * 0.7} className="calib-dot">
          <title>{`Annoncé ${Math.round(b.pred * 100)} %, arrivé ${Math.round(b.obs * 100)} % (${b.n} cas)`}</title>
        </circle>
      ))}
      <text x={S / 2 + 10} y={S - 1} textAnchor="middle" className="calib-axis">annoncé par l'IA</text>
    </svg>
  );
}
