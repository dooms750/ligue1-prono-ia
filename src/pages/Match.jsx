import React, { useMemo, useState } from "react";
import { Badge, Form, Confidence, ScoreGrid, PressList, ProbaBlade, Countdown, pairColors } from "../components/ui.jsx";
import Stadium3D from "../components/Stadium3D.jsx";
import { WeatherCard } from "../components/Weather.jsx";
import { predict } from "../model/predict.js";
import { buildLevers, defaultActive } from "../model/levers.js";
import { confidence, impliedFromOdds } from "../model/poisson.js";
import { reasons, pct } from "../model/narrative.js";
import { matchId, formatKick } from "../lib/store.js";

const LABELS = ["Domicile", "Nul", "Extérieur"];

export default function Match({ id, data, picks, setPick }) {
  const { teams, upcoming } = data;
  const m = upcoming.find((x) => matchId(x) === id);
  const levers = useMemo(() => (m ? buildLevers(m, teams) : []), [m, teams]);
  const initial = useMemo(() => defaultActive(levers), [levers]);
  const [active, setActive] = useState(initial);
  const [lastWhy, setLastWhy] = useState(null);

  if (!m) return <p className="empty">Ce match n'est pas dans la journée à venir. <a href="#/">Revenir à la journée</a></p>;

  const H = teams[m.home], A = teams[m.away];
  const [cH, cA] = pairColors(H, A);
  const base = predict(m, teams, {});
  const cur = predict(m, teams, active);
  const ia = predict(m, teams, initial);
  const market = impliedFromOdds(m.odds);
  const mine = picks[id];
  const why = reasons(m, teams, active);
  const changed = JSON.stringify(active) !== JSON.stringify(initial);

  const toggle = (l) => {
    const on = !active[l.id];
    setActive({ ...active, [l.id]: on });
    setLastWhy(on ? l.why : `« ${l.label} » n'est plus pris en compte.`);
  };


  return (
    <article className="match">
      <div className="match-stage">
        <Stadium3D p={cur.p} home={H} away={A} shot="verdict" height="min(58vh, 460px)" rain={!!active.pluie} offsetY={0.1}
          fallback={<div style={{ height: 120 }} />} />
        <header className="scorebug">
          <div className="scorebug-row">
            <span className="sb-team" style={{ "--c": cH }}><Badge team={H} size={30} /><b>{H.name}</b></span>
            <span className="sb-mid">J{m.md}</span>
            <span className="sb-team sb-away" style={{ "--c": cA }}><b>{A.name}</b><Badge team={A} size={30} /></span>
          </div>
          <p className="scorebug-sub">{formatKick(m)} · coup d'envoi dans <Countdown date={m.date} time={m.time} /></p>
        </header>
        <span className="s3d-hint">Fais glisser pour tourner autour du terrain</span>
      </div>

      <div className="sticky-blade">
        <ProbaBlade p={cur.p} home={H} away={A} size="md" />
        <div className="sticky-meta">
          <Confidence c={confidence(cur.p)} />
          {changed ? <span className="tuned">Réglé par toi</span> : <span>Pronostic de l'IA</span>}
        </div>
      </div>

      <div className="match-bar">
        <div className="forms">
          <span>{H.short} <Form form={H.form} /></span>
          <span>{A.short} <Form form={A.form} /></span>
        </div>
        <a className="link-btn" href={`#/match/${id}/story`}>Vivre l'avant-match</a>
      </div>

      <section className="block">
        <h2>Le pronostic de l'IA</h2>
        <div className="row-meta">
          <Confidence c={confidence(cur.p)} />
          <span>{confidence(cur.p).text}</span>
        </div>
        {changed && (
          <p className="delta">
            Avec tes réglages : {LABELS.map((l, k) => `${l.toLowerCase()} ${signed(cur.p[k] - ia.p[k])}`).join(", ")} par rapport à l'IA.
            <button className="text-btn" onClick={() => { setActive(initial); setLastWhy(null); }}>Revenir aux réglages de l'IA</button>
          </p>
        )}
        <ul className="why">{why.map((w) => <li key={w}>{w}</li>)}</ul>
      </section>

      <section className="block">
        <h2>La météo du match</h2>
        <WeatherCard w={m.ctx.meteo} date={m.date} />
      </section>

      {m.ctx.press && (
        <section className="block">
          <h2>Dans la presse</h2>
          <p className="muted">
            Les articles des derniers jours repérés par l'IA dans la presse spécialisée, via OneFootball.
            Quand un titre annonce le meilleur buteur absent, le levier correspondant s'allume tout seul.
          </p>
          {[["H", H], ["A", A]].map(([k, t]) => {
            const pr = m.ctx.press[k] || {};
            return (
              <div className="press-team" key={k}>
                <h3>
                  <Badge team={t} size={24} />{t.name}
                  {pr.scorerOut && <span className="press-flag">Buteur annoncé absent</span>}
                </h3>
                {pr.scorer && <p className="muted small">Meilleur buteur : {pr.scorer.name}, {pr.scorer.goals} but{pr.scorer.goals > 1 ? "s" : ""} cette saison.</p>}
                <PressList items={(pr.absences || []).concat(pr.other || []).slice(0, 4)} empty="Aucun article récent." />
              </div>
            );
          })}
        </section>
      )}

      <section className="block">
        <h2>Les leviers</h2>
        <p className="muted">
          Cinq facteurs qui comptent vraiment. Ceux marqués « détecté » ont été allumés par l'IA à partir de la presse,
          du calendrier ou de la météo. Touche-les : le bandeau en haut et les colonnes du stade bougent en direct.
        </p>
        <div className="levers">
          {levers.map((l) => (
            <label key={l.id} className={`lever ${active[l.id] ? "on" : ""}`}>
              <input type="checkbox" checked={!!active[l.id]} onChange={() => toggle(l)} />
              <span className="switch" aria-hidden="true" />
              <span className="lever-txt">
                <span>{l.label}</span>
                {l.on && <span className="lever-tag">Détecté</span>}
                {l.on && l.source && (
                  <small>
                    {l.source.url
                      ? <a href={l.source.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{l.source.text}</a>
                      : l.source.text}
                    {" · "}{l.source.by}
                  </small>
                )}
              </span>
            </label>
          ))}
        </div>
        <p className="explain" aria-live="polite">
          {lastWhy || "Touche un levier : l'explication de son effet s'affiche ici."}
        </p>
        <p className="muted small">
          Sans aucun facteur de contexte, l'IA donnerait {pct(base.p[0])} / {pct(base.p[1])} / {pct(base.p[2])}.
        </p>
      </section>

      <section className="block">
        <h2>Buts et scores</h2>
        <div className="stats">
          <div><b>{pct(cur.over25)}</b><span>Plus de 2,5 buts</span></div>
          <div><b>{pct(cur.btts)}</b><span>Les deux équipes marquent</span></div>
          <div><b>{cur.topScores[0].h}-{cur.topScores[0].a}</b><span>Score le plus probable ({pct(cur.topScores[0].p)})</span></div>
        </div>
        <ScoreGrid grid={cur.grid} home={H} away={A} />
        <p className="muted small">
          Même le score le plus probable n'arrive qu'environ une fois sur dix : le football reste un sport à peu de buts,
          où le hasard pèse lourd.
        </p>
      </section>

      {market && (
        <section className="block">
          <h2>L'IA face au marché</h2>
          <p className="muted">
            Les cotes, une fois la marge du bookmaker retirée ({pct(market.margin)}), donnent aussi des probabilités.
            Comparer les deux montre où l'IA voit le match autrement.
          </p>
          <table className="vs-market">
            <thead><tr><th /><th>IA</th><th>Marché</th><th>Écart</th></tr></thead>
            <tbody>
              {LABELS.map((l, k) => {
                const gap = ia.p[k] - market.p[k];
                return (
                  <tr key={l}>
                    <th>{k === 0 ? H.name : k === 2 ? A.name : "Nul"}</th>
                    <td>{pct(ia.p[k])}</td>
                    <td>{pct(market.p[k])}</td>
                    <td className={Math.abs(gap) >= 0.05 ? "gap" : ""}>{signed(gap)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">
            Un écart ne veut pas dire que l'IA a raison : le marché agrège énormément d'informations.
            Le bilan de la saison montre qui se trompe le moins.
          </p>
        </section>
      )}

      <section className="block">
        <h2>Ton prono</h2>
        <div className="pick-row" role="radiogroup" aria-label="Ton pronostic">
          {[H.name, "Nul", A.name].map((l, k) => (
            <button key={k} role="radio" aria-checked={mine === k}
              className={`pick ${mine === k ? "on" : ""}`} onClick={() => setPick(id, k)}>{l}</button>
          ))}
        </div>
        {mine != null && (
          <p className="muted">
            {mine === ia.pick ? "Même avis que l'IA." : `Tu pars contre l'IA, qui donne ${pct(ia.p[mine])} à ce résultat.`}{" "}
            Verdict au débrief, après le match.
          </p>
        )}
      </section>
    </article>
  );
}

function signed(x) {
  const v = Math.round(x * 100);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} pt${Math.abs(v) > 1 ? "s" : ""}`;
}
