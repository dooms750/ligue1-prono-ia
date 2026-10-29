import React, { useState } from "react";
import { Badge, Form } from "../components/ui.jsx";
import { Delta, LineChart, Ranges, UP, DOWN } from "../components/charts.jsx";
import { predict } from "../model/predict.js";
import { ord, pct, fr1 } from "../model/narrative.js";
import { outcomeOf } from "../model/poisson.js";
import { matchId } from "../lib/store.js";

const fmt = (v) => v.toFixed(1).replace(".", ",");
const change = (h, k) => {
  if (!h || h.length < 2) return 0;
  const a = h[Math.max(0, h.length - 1 - k)].index, b = h[h.length - 1].index;
  return ((b - a) / a) * 100;
};

const METRICS = [
  { id: "index", label: "Niveau" },
  { id: "pts", label: "Points" },
  { id: "rank", label: "Classement" },
];

// La fiche d'une équipe : l'évolution de son niveau selon l'IA, ses chiffres, son prochain match.
export default function Club({ code, data, live = {} }) {
  const t = data.teams[code];
  const [metric, setMetric] = useState("index");
  const [range, setRange] = useState("all");
  if (!t) return <p className="empty">Équipe introuvable. <a href="#/">Revenir à la journée</a></p>;
  const h = t.history || [];
  const n = range === "5" ? 6 : range === "10" ? 11 : h.length;
  const view = h.slice(-n);
  const now = h[h.length - 1]?.index ?? 100;
  const d1 = change(h, 1);
  const vals = view.map((x) => (metric === "index" ? x.index : metric === "pts" ? x.pts : x.rank));
  const up = vals[vals.length - 1] >= vals[0];
  const good = metric === "rank" ? !up || vals[0] === vals[vals.length - 1] : up;
  const color = good ? UP : DOWN;

  const next = data.upcoming.find((m) => m.home === code || m.away === code);
  const results = data.played.filter((m) => m.home === code || m.away === code).slice(-5).reverse();
  const n0 = Math.max(t.played, 1);

  return (
    <>
      <header className="club-head">
        <Badge team={t} size={54} />
        <div>
          <h1>{t.name}</h1>
          <p className="muted">{ord(t.rank)} de Ligue 1 · {t.pts} points</p>
        </div>
      </header>

      <section className="quote">
        <span className="quote-label">Niveau de l'équipe selon l'IA</span>
        <span className="quote-price"><b>{fmt(now)}</b><Delta value={d1} unit=" %" /><small>depuis la journée précédente</small></span>
        <span className="muted small">100 = une équipe moyenne de Ligue 1. À 150, une équipe marque 1,5 fois plus qu'elle n'encaisse face à un adversaire moyen.</span>
      </section>

      <section className="block chart-block">
        <Ranges options={METRICS} value={metric} onChange={setMetric} />
        <LineChart
          series={[{ name: METRICS.find((x) => x.id === metric).label, color, values: vals, area: true }]}
          labels={view.map((x) => (x.md === 0 ? "Avant J1" : `J${x.md}`))}
          yFormat={(v) => (metric === "index" ? fmt(v) : `${Math.round(v)}${metric === "rank" ? "e" : ""}`)}
          invertY={metric === "rank"}
          yMin={metric === "rank" ? 1 : undefined} yMax={metric === "rank" ? 18 : undefined}
          ariaLabel={`Évolution ${METRICS.find((x) => x.id === metric).label} de ${t.name}`}
        />
        <Ranges options={[{ id: "5", label: "5 journées" }, { id: "10", label: "10 journées" }, { id: "all", label: "Saison" }]} value={range} onChange={setRange} />
        {metric === "index" && (
          <p className="muted small">
            Le point « Avant J1 » vient de la saison précédente. Chaque point est calculé avec les seuls matchs déjà
            joués à ce moment-là.
          </p>
        )}
      </section>

      <section className="stats stats-4">
        <div><b>{fr1(t.gf / n0)}</b><span>Buts marqués par match</span></div>
        <div><b>{fr1(t.ga / n0)}</b><span>Buts encaissés par match</span></div>
        <div><b>{pct(Math.exp(t.att) / 1)}</b><span>Attaque, par rapport à la moyenne (100 %)</span></div>
        <div><b>{pct(Math.exp(t.def))}</b><span>Buts concédés, par rapport à la moyenne (100 %)</span></div>
      </section>

      {next && <NextMatch m={next} data={data} code={code} l={live[matchId(next)]} />}

      <section className="block">
        <h2>Derniers résultats</h2>
        <div className="club-form"><Form form={t.form} /></div>
        <ul className="club-results">
          {results.map((m) => {
            const home = m.home === code;
            const opp = data.teams[home ? m.away : m.home];
            const o = outcomeOf(m.hg, m.ag);
            const res = o === 1 ? "N" : (o === 0) === home ? "V" : "D";
            const pRes = m.pred.p[o];
            return (
              <li key={matchId(m)}>
                <a href={`#/debrief/${m.md}`}>
                  <span className={`res res-${res}`}>{res}</span>
                  <span className="cr-opp">J{m.md} · {home ? "contre" : "à"} <b>{opp.name}</b></span>
                  <span className="cr-score">{m.hg}-{m.ag}</span>
                  <span className="cr-p">{pct(pRes)} <small>selon l'IA</small></span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function NextMatch({ m, data, code, l }) {
  const H = data.teams[m.home], A = data.teams[m.away];
  const pr = predict(m, data.teams);
  const side = m.home === code ? 0 : 2;
  return (
    <a className="block next-card" href={`#/match/${matchId(m)}`}>
      <span className="next-k">Prochain match{l ? " · en direct" : ""}</span>
      <span className="next-teams"><Badge team={H} size={26} />{H.name}<i>contre</i>{A.name}<Badge team={A} size={26} /></span>
      <span className="next-p">
        <b>{pct(pr.p[side])}</b> de chances de victoire pour {data.teams[code].name} · nul {pct(pr.p[1])}
      </span>
    </a>
  );
}
