import React, { useMemo, useState } from "react";
import { Badge, Form, Confidence, ScoreGrid, PressList, ProbaBlade, Countdown, pairColors } from "../components/ui.jsx";
import Stadium3D from "../components/Stadium3D.jsx";
import { WeatherCard } from "../components/Weather.jsx";
import { predict } from "../model/predict.js";
import { buildLevers, defaultActive } from "../model/levers.js";
import { confidence, impliedFromOdds } from "../model/poisson.js";
import { reasons, pct } from "../model/narrative.js";
import { matchId, formatKick } from "../lib/store.js";
import { liveLabel } from "../lib/live.js";
import { liveMarkets } from "../model/liveProbs.js";
import { LineChart, Ranges, Delta } from "../components/charts.jsx";
import { matchPath, liveEvents } from "../model/matchPath.js";

const LABELS = ["Domicile", "Nul", "Extérieur"];

export default function Match({ id, data, picks, setPick, live = {} }) {
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
  const l = live[id];
  const lp = l ? liveMarkets(cur.lh, cur.la, l) : null;
  const shown = lp ? lp.p : cur.p;

  const toggle = (l) => {
    const on = !active[l.id];
    setActive({ ...active, [l.id]: on });
    setLastWhy(on ? l.why : `« ${l.label} » n'est plus pris en compte.`);
  };


  return (
    <article className="match">
      <div className="match-stage">
        <Stadium3D p={shown} home={H} away={A} labelTop={130} shot="verdict" height="min(58vh, 460px)" rain={!!active.pluie} offsetY={0.1}
          fallback={<div style={{ height: 120 }} />} />
        <header className="scorebug">
          <div className="scorebug-row">
            <span className="sb-team" style={{ "--c": cH }}><Badge team={H} size={30} /><b>{H.name}</b></span>
            <span className={`sb-mid ${l ? "sb-live" : ""}`}>{l ? `${l.hg} - ${l.ag}` : `J${m.md}`}</span>
            <span className="sb-team sb-away" style={{ "--c": cA }}><b>{A.name}</b><Badge team={A} size={30} /></span>
          </div>
          {l ? (
            <p className="scorebug-sub">
              {l.state === "in" ? <><span className="live-dot" aria-hidden="true" />En direct · <b className="cd">{liveLabel(l)}</b></> : <>Terminé · {formatKick(m)}</>}
            </p>
          ) : (
            <p className="scorebug-sub">{formatKick(m)} · coup d'envoi dans <Countdown date={m.date} time={m.time} /></p>
          )}
        </header>
        <span className="s3d-hint">Fais glisser pour tourner autour du terrain</span>
      </div>

      <div className="sticky-blade">
        <ProbaBlade p={shown} home={H} away={A} size="md" />
        <div className="sticky-meta">
          {lp ? (
            <>
              <span className="tuned live-tag"><span className="live-dot" aria-hidden="true" />{l.state === "in" ? `Probabilités en direct · ${liveLabel(l)}` : "Match terminé"}</span>
              <span>Avant le match : {Math.round(cur.p[0] * 100)} / {Math.round(cur.p[1] * 100)} / {Math.round(cur.p[2] * 100)}</span>
            </>
          ) : (
            <>
              <Confidence c={confidence(cur.p)} />
              {changed ? <span className="tuned">Réglé par toi</span> : <span>Pronostic de l'IA</span>}
            </>
          )}
        </div>
      </div>

      <div className="match-bar">
        <div className="forms">
          <a href={`#/club/${m.home}`}>{H.short} <Form form={H.form} /></a>
          <a href={`#/club/${m.away}`}>{A.short} <Form form={A.form} /></a>
        </div>
        <a className="link-btn" href={`#/match/${id}/story`}>Vivre l'avant-match</a>
      </div>

      <PriceChart m={m} H={H} A={A} cH={cH} cA={cA} cur={cur} l={l} />

      {l && (
        <section className="block live-block">
          <h2>{l.state === "in" ? "Le match en direct" : "Le match"}</h2>
          <p className="muted small">
            Les probabilités du bandeau repartent du score actuel et simulent chaque minute restante
            ({Math.round(lp.remaining * 100)} % des buts d'un match restent à marquer). Elles tiennent compte du score
            (l'équipe menée pousse), des cartons rouges{l.sotH != null ? " et des tirs cadrés" : ""}, avec des effets
            mesurés sur les saisons passées. Mise à jour toutes les 30 secondes.
          </p>
          {l.sotH != null && (
            <p className="live-shots"><b>{l.sotH}</b> tirs cadrés <b>{l.sotA}</b>
              {l.shotsH != null && <span> · tirs : {l.shotsH} contre {l.shotsA}</span>}</p>
          )}
          {l.events.length ? (
            <ol className="timeline">
              {l.events.map((e, k) => (
                <li key={k} className={`tl-${e.side} tl-${e.type}`}>
                  <b>{e.label}</b>
                  <span>{e.type === "rouge" ? "Carton rouge" : e.type === "csc" ? "But contre son camp" : e.type === "penalty" ? "But sur penalty" : "But"}</span>
                  <em>{e.player}{e.player ? " · " : ""}{e.side === "H" ? H.name : A.name}</em>
                </li>
              ))}
            </ol>
          ) : <p className="muted">Pas encore de but ni de carton rouge.</p>}
          <p className="wx-src">Direct : tableau des scores ESPN.</p>
        </section>
      )}

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
          Cinq facteurs de contexte. Ceux marqués « détecté » ont été repérés par l'IA dans la presse, le calendrier ou
          la météo. Leur effet est mesuré sur les saisons passées : un levier qui n'améliore pas les pronostics est
          écarté et ne compte pas. Touche-les : le bandeau en haut et les colonnes du stade bougent en direct.
        </p>
        <div className="levers">
          {levers.map((l) => (
            <label key={l.id} className={`lever ${active[l.id] && l.kept ? "on" : ""} ${l.kept ? "" : "lever-off"}`}
              onClick={l.kept ? undefined : () => setLastWhy(l.why)}>
              <input type="checkbox" checked={!!active[l.id] && l.kept} disabled={!l.kept} onChange={() => toggle(l)} />
              <span className="switch" aria-hidden="true" />
              <span className="lever-txt">
                <span>{l.label}</span>
                {l.detected && <span className="lever-tag">Détecté</span>}
                {!l.kept && <span className="lever-tag lever-tag-off">Écarté par les données</span>}
                {l.detected && l.source && (
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

      {m.published && <Trace pub={m.published} />}

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

const when = (iso) => iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).replace(":", " h ") : "?";

const LEVER_NAMES = {
  butH: "meilleur buteur absent (domicile)", butA: "meilleur buteur absent (extérieur)",
  eurH: "match de coupe (domicile)", eurA: "match de coupe (extérieur)", pluie: "pluie ou vent",
};

// Trace du pronostic publié : ce qui a été calculé, quand, et avec quelles données.
function Trace({ pub }) {
  const [p1, pn, p2] = pub.p;
  return (
    <section className="block trace">
      <h2>La trace du pronostic</h2>
      <p>
        Pronostic publié : <b>{pct(p1)} / {pct(pn)} / {pct(p2)}</b>, calculé {when(pub.at)} avec les données
        collectées {when(pub.dataAt)}.
      </p>
      <ul className="trace-list">
        <li>Leviers comptés : {pub.levers.length ? pub.levers.map((id) => LEVER_NAMES[id] || id).join(", ") : "aucun"}</li>
        {pub.firstAt && <li>Premier calcul : {when(pub.firstAt)}{pub.changes > 1 ? `, puis ${pub.changes - 1} mise${pub.changes > 2 ? "s" : ""} à jour` : ""}</li>}
        {pub.model && <li>Version du modèle : {pub.model.version}</li>}
      </ul>
      <p className="muted small">
        Cette trace est enregistrée dans le dépôt GitHub et figée au coup d'envoi : impossible de la retoucher
        après coup. Le débrief la rappelle à côté du résultat.
      </p>
    </section>
  );
}

// L'évolution du pronostic : journée après journée, et minute par minute pendant le match.
function PriceChart({ m, H, A, cH, cA, cur, l }) {
  const inPlay = l && l.state !== "pre";
  const [view, setView] = useState(inPlay ? "live" : "md");
  const mode = inPlay ? view : "md";
  let labels, vals, markers = [];
  if (mode === "live") {
    const now = l.state === "post" ? 90 : l.halftime ? 45 : Math.min(90, l.period >= 2 ? Math.max(46, l.minute) : Math.min(45, l.minute));
    const ev = liveEvents(l);
    const path = matchPath(cur.lh, cur.la, ev, now, l.state === "post" ? [l.hg, l.ag] : null);
    labels = path.map((x) => `${x.t}'`);
    vals = [0, 1, 2].map((k) => path.map((x) => x.p[k] * 100));
    markers = ev.map((e) => ({ i: e.bin, label: e.type === "rouge" ? "▮" : "⚽", color: e.type === "rouge" ? "#f0525a" : e.side === "H" ? cH : cA }));
  } else {
    const t = (m.trend || []).slice(0, -1);
    labels = [...t.map((x) => (x.md === 0 ? "Début" : `J${x.md}`)), "Auj."];
    vals = [0, 1, 2].map((k) => [...t.map((x) => x.p[k] * 100), cur.p[k] * 100]);
  }
  const fav = cur.p.indexOf(Math.max(...cur.p));
  const first = vals[fav][0], last = vals[fav][vals[fav].length - 1];
  const favName = fav === 0 ? H.name : fav === 2 ? A.name : "le nul";
  return (
    <section className="block chart-block">
      <div className="chart-head">
        <div>
          <h2>{mode === "live" ? "Le match en direct" : "L'évolution du pronostic"}</h2>
          <p className="muted small">
            {mode === "live"
              ? "Les probabilités minute après minute, au fil des buts et des cartons rouges."
              : "Ce que l'IA aurait annoncé pour ce match après chaque journée de championnat (J3 = après la 3e journée)."}
          </p>
        </div>
        <span className="chart-delta">
          <small>{favName}</small>
          <Delta value={last - first} unit=" pt" />
        </span>
      </div>
      {inPlay && (
        <Ranges options={[{ id: "live", label: "En direct" }, { id: "md", label: "Avant-match" }]} value={view} onChange={setView} />
      )}
      <LineChart
        series={[
          { name: H.short, color: cH, values: vals[0], area: fav === 0 },
          { name: "Nul", color: "#8b9bb0", values: vals[1], dash: "4 4", width: 1.8 },
          { name: A.short, color: cA, values: vals[2], area: fav === 2 },
        ]}
        labels={labels} markers={markers} yMin={0} yMax={100}
        yFormat={(v) => `${Math.round(v)}%`} tickEvery={mode === "live" ? 15 : undefined}
        ariaLabel={`Évolution des probabilités de ${H.name} contre ${A.name}`}
      />
    </section>
  );
}
