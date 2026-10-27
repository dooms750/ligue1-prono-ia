import React from "react";
import { Badge, DemoBanner, isPast, ProbaBlade, Countdown, pairColors } from "../components/ui.jsx";
import Stadium3D from "../components/Stadium3D.jsx";
import { predict } from "../model/predict.js";
import { buildLevers } from "../model/levers.js";
import { ord, pct } from "../model/narrative.js";
import { confidence, outcomeOf } from "../model/poisson.js";
import { matchId } from "../lib/store.js";

const PICK_SHORT = ["1", "N", "2"];

export default function Home({ data, picks }) {
  const { teams, upcoming, played, meta } = data;
  const last = played.filter((m) => m.md === meta.lastMatchday);
  const iaRight = last.filter((m) => m.pred.p.indexOf(Math.max(...m.pred.p)) === outcomeOf(m.hg, m.ag)).length;

  // L'affiche : le match entre les deux équipes les mieux classées.
  const affiche = [...upcoming].sort((a, b) =>
    (teams[a.home].rank + teams[a.away].rank) - (teams[b.home].rank + teams[b.away].rank))[0];
  const AH = teams[affiche.home], AA = teams[affiche.away];
  const ap = predict(affiche, teams);
  const [cH, cA] = pairColors(AH, AA);
  const next = upcoming.find((m) => !isPast(m)) || upcoming[0];

  // Le programme, jour par jour, comme un guide TV.
  const days = [];
  for (const m of upcoming) {
    let d = days.find((x) => x.date === m.date);
    if (!d) days.push((d = { date: m.date, items: [] }));
    d.items.push(m);
  }

  return (
    <>
      <section className="hero3">
        <Stadium3D p={ap.p} home={AH} away={AA} shot="verdict" height="min(76vh, 600px)" offsetY={0.04}
          fallback={<div style={{ height: 200 }} />} />
        <div className="hero3-top">
          <div className="bug">
            <span className="bug-l1">L1</span>
            <span className="bug-md">J{meta.nextMatchday}</span>
            <span className="bug-cd">Prochain coup d'envoi <Countdown date={next.date} time={next.time} /></span>
          </div>
        </div>
        <a className="hero3-card" href={`#/match/${matchId(affiche)}/story`}>
          <span className="hero3-kicker">L'affiche de la journée</span>
          <span className="hero3-teams">
            <span style={{ "--c": cH }}>{AH.name}</span>
            <i>contre</i>
            <span style={{ "--c": cA }}>{AA.name}</span>
          </span>
          <span className="hero3-cta">Vivre l'avant-match</span>
        </a>
      </section>

      <DemoBanner meta={meta} />

      <section className="guide">
        <header className="guide-head">
          <h2>Le programme</h2>
          <span>{upcoming.length} matchs · pronos de l'IA</span>
        </header>
        {days.map((d) => (
          <div className="guide-day" key={d.date}>
            <h3>{dayLabel(d.date)}</h3>
            <ul>
              {d.items.map((m) => <Row key={matchId(m)} m={m} teams={teams} mine={picks[matchId(m)]} meta={meta} />)}
            </ul>
          </div>
        ))}
      </section>

      <a className="teaser3" href={`#/debrief/${meta.lastMatchday}`}>
        <span className="teaser3-k">{iaRight}<small>/{last.length}</small></span>
        <span>
          <strong>Débrief de la {meta.lastMatchday}e journée</strong>
          L'IA a trouvé le bon résultat dans {iaRight} matchs. Voir ce qui a fait basculer les autres.
        </span>
      </a>
    </>
  );
}

function Row({ m, teams, mine, meta }) {
  const id = matchId(m);
  const H = teams[m.home], A = teams[m.away];
  const pr = predict(m, teams);
  const c = confidence(pr.p);
  const [cH, cA] = pairColors(H, A);
  const detected = buildLevers(m, teams).filter((l) => l.on);
  const past = isPast(m);
  const w = m.ctx?.meteo;
  return (
    <li>
      <a className={`row ${past ? "row-past" : ""}`} href={`#/match/${id}`}>
        <span className="row-time">
          <b>{m.time ? m.time.replace(":", "h") : "–"}</b>
          {m.md !== meta.nextMatchday && <small>J{m.md}</small>}
        </span>
        <span className="row-main">
          <span className="row-teams">
            <span className="row-team" style={{ "--c": cH }}>
              <Badge team={H} size={26} /><span className="nm">{H.name}</span><em>{ord(H.rank)}</em>
            </span>
            <span className="row-team" style={{ "--c": cA }}>
              <Badge team={A} size={26} /><span className="nm">{A.name}</span><em>{ord(A.rank)}</em>
            </span>
          </span>
          <ProbaBlade p={pr.p} home={H} away={A} size="sm" />
          <span className="row-meta">
            {past ? <span className="chip">Joué, résultat bientôt intégré</span> : (
              <>
                <span className={`chip chip-conf chip-c${c.level}`}>Confiance {c.label.toLowerCase()}</span>
                <span className="chip">{pr.topScores[0].h}-{pr.topScores[0].a} probable</span>
                {w && <span className={`chip chip-wx chip-${w.kind}`}>{w.temp}° · {w.kind === "beau" ? "sec" : w.kind}</span>}
                {detected.length > 0 && <span className="chip chip-hot">{detected.length} facteur{detected.length > 1 ? "s" : ""} détecté{detected.length > 1 ? "s" : ""}</span>}
                {mine != null && <span className="chip chip-mine">Ton prono {PICK_SHORT[mine]}</span>}
              </>
            )}
          </span>
        </span>
      </a>
    </li>
  );
}

function dayLabel(iso) {
  const d = new Date(iso + "T12:00:00");
  const t = new Date(); t.setHours(12, 0, 0, 0);
  const diff = Math.round((d - t) / 864e5);
  const base = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  return diff === 0 ? `Aujourd'hui, ${base}` : diff === 1 ? `Demain, ${base}` : cap;
}
