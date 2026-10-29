import React from "react";
import { Badge } from "../components/ui.jsx";
import { LineChart, Delta, UP, DOWN, FLAT } from "../components/charts.jsx";
import { predict } from "../model/predict.js";
import { pct } from "../model/narrative.js";
import { outcomeOf } from "../model/poisson.js";
import { matchId, formatKick } from "../lib/store.js";

const START = 1000;  // capital de départ, en points virtuels
const STAKE = 10;    // mise par position
const OUT = ["victoire à domicile", "nul", "victoire à l'extérieur"];
const pts = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(0)} pts`;

// Cote utilisée pour régler une position : celle du marché si on l'a, sinon la cote « juste » de l'IA.
function odd(m, o) {
  if (m.odds && m.odds[o] > 1) return { v: m.odds[o], src: "marché" };
  return { v: 1 / Math.max(m.pred.p[o], 0.02), src: "IA" };
}

function settle(m, o) {
  const won = outcomeOf(m.hg, m.ag) === o;
  const c = odd(m, o);
  return { won, odd: c, pl: won ? STAKE * (c.v - 1) : -STAKE };
}

export default function Portfolio({ data, picks }) {
  const { played, upcoming, teams, meta } = data;
  const mine = played.filter((m) => picks[matchId(m)] != null).map((m) => ({ m, o: picks[matchId(m)], ...settle(m, picks[matchId(m)]) }));
  const ia = played.map((m) => {
    const o = m.pred.p.indexOf(Math.max(...m.pred.p));
    return { m, o, ...settle(m, o) };
  });
  const open = upcoming.filter((m) => picks[matchId(m)] != null);

  // Courbes cumulées, journée par journée.
  const mds = Array.from({ length: meta.lastMatchday + 1 }, (_, k) => k);
  const curve = (rows) => mds.map((md) => START + rows.filter((r) => r.m.md <= md).reduce((s, r) => s + r.pl, 0));
  const cIA = curve(ia), cMe = curve(mine);
  const plMe = cMe[cMe.length - 1] - START, plIA = cIA[cIA.length - 1] - START;
  const hasMine = mine.length > 0;
  const value = hasMine ? cMe[cMe.length - 1] : START;
  const winMe = mine.filter((r) => r.won).length, winIA = ia.filter((r) => r.won).length;

  return (
    <>
      <header className="page-head">
        <h1>Mon portefeuille</h1>
        <p className="lead">
          Chaque prono est une position de {STAKE} points virtuels, réglée à la cote moyenne du marché. Aucun argent
          réel : c'est un terrain d'entraînement pour comprendre les probabilités et la marge des bookmakers.
        </p>
      </header>

      <section className="quote">
        <span className="quote-label">Valeur du portefeuille</span>
        <span className="quote-price">
          <b>{value.toFixed(0)}</b><small className="unit">pts</small>
          <Delta value={((value - START) / START) * 100} unit=" %" digits={1} />
        </span>
        <span className="muted small">{hasMine ? `${mine.length} positions clôturées · ${open.length} en cours` : `Départ à ${START} points · ${open.length} position${open.length > 1 ? "s" : ""} en cours`}</span>
      </section>

      <section className="block chart-block">
        <h2>Performance</h2>
        <LineChart
          series={[
            ...(hasMine ? [{ name: "Toi", color: plMe >= 0 ? UP : DOWN, values: cMe, area: true }] : []),
            { name: "Copier l'IA", color: hasMine ? "#6fb6ff" : plIA >= 0 ? UP : DOWN, values: cIA, area: !hasMine, dash: hasMine ? "5 4" : undefined },
          ]}
          labels={mds.map((md) => (md === 0 ? "Départ" : `J${md}`))}
          yFormat={(v) => v.toFixed(0)}
          ariaLabel="Valeur du portefeuille journée après journée"
        />
        <div className="pf-compare">
          {hasMine && (
            <div><span>Toi</span><b className={plMe >= 0 ? "up" : "down"}>{pts(plMe)}</b><small>{winMe}/{mine.length} positions gagnantes</small></div>
          )}
          <div><span>Copier l'IA</span><b className={plIA >= 0 ? "up" : "down"}>{pts(plIA)}</b><small>{winIA}/{ia.length} gagnantes, en suivant toujours son favori</small></div>
        </div>
        <p className="explain">
          {plIA < 0
            ? `Même en trouvant le bon résultat ${pct(winIA / ia.length)} du temps, suivre l'IA fait perdre des points : les cotes du marché intègrent une marge qui rend chaque gain un peu plus petit qu'il ne devrait. C'est la meilleure leçon de ce portefeuille.`
            : `Suivre l'IA rapporte des points sur cette période, mais l'écart reste fragile : la marge des bookmakers grignote chaque gain, et quelques résultats peuvent tout inverser.`}
        </p>
      </section>

      <section className="block">
        <h2>Positions en cours</h2>
        {open.length ? (
          <ul className="positions">
            {open.map((m) => {
              const o = picks[matchId(m)];
              const pr = predict(m, teams);
              const H = teams[m.home], A = teams[m.away];
              const c = m.odds?.[o];
              return (
                <li key={matchId(m)}>
                  <a href={`#/match/${matchId(m)}`}>
                    <span className="pos-teams"><Badge team={H} size={22} /><Badge team={A} size={22} /><b>{H.short}–{A.short}</b></span>
                    <span className="pos-pick">{OUT[o]}<small>{formatKick(m)}</small></span>
                    <span className="pos-p"><b>{pct(pr.p[o])}</b><small>{c ? `gain possible ${pts(STAKE * (c - 1))}` : "selon l'IA"}</small></span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">Aucune position. Sur l'écran Marchés, touche 1, N ou 2 sur un match pour en ouvrir une.</p>
        )}
      </section>

      {hasMine && (
        <section className="block">
          <h2>Historique</h2>
          <ul className="positions">
            {mine.slice().reverse().map((r) => {
              const H = teams[r.m.home], A = teams[r.m.away];
              return (
                <li key={matchId(r.m)}>
                  <a href={`#/debrief/${r.m.md}`}>
                    <span className="pos-teams"><Badge team={H} size={22} /><Badge team={A} size={22} /><b>{r.m.hg}-{r.m.ag}</b></span>
                    <span className="pos-pick">{OUT[r.o]}<small>cote {r.odd.v.toFixed(2).replace(".", ",")} ({r.odd.src})</small></span>
                    <span className="pos-p"><b style={{ color: r.won ? UP : r.pl < 0 ? DOWN : FLAT }}>{pts(r.pl)}</b></span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="muted small">
        Les jeux d'argent sont interdits aux mineurs. Besoin d'aide : Joueurs Info Service, 09 74 75 13 13 (appel non surtaxé).
      </p>
    </>
  );
}
