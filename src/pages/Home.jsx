import React from "react";
import { Badge, ProbaPitch, Confidence, DemoBanner, isPast } from "../components/ui.jsx";
import Stadium3D from "../components/Stadium3D.jsx";
import { predict } from "../model/predict.js";
import { ord, pct } from "../model/narrative.js";
import { confidence, outcomeOf } from "../model/poisson.js";
import { matchId, formatDate } from "../lib/store.js";

const PICK_LABEL = ["victoire à domicile", "match nul", "victoire à l'extérieur"];

export default function Home({ data, picks }) {
  const { teams, upcoming, played, meta } = data;
  const last = played.filter((m) => m.md === meta.lastMatchday);
  const iaRight = last.filter((m) => m.pred.p.indexOf(Math.max(...m.pred.p)) === outcomeOf(m.hg, m.ag)).length;

  // L'affiche : le match entre les deux équipes les mieux classées.
  const affiche = [...upcoming].sort((a, b) =>
    (teams[a.home].rank + teams[a.away].rank) - (teams[b.home].rank + teams[b.away].rank))[0];
  const AH = teams[affiche.home], AA = teams[affiche.away];
  const ap = predict(affiche, teams);

  return (
    <>
      <section className="hero">
        <Stadium3D p={ap.p} home={AH} away={AA} shot="verdict" height="min(68vh, 520px)" offsetY={0.13}
          fallback={<div style={{ height: 160 }} />} />
        <div className="hero-over">
          <p className="hero-date">{formatDate(upcoming[0].date)}</p>
          <h1>
            <span className="hero-num">{meta.nextMatchday}</span>
            <span className="hero-txt">e journée<br />de Ligue 1</span>
          </h1>
        </div>
        <div className="hero-affiche">
          <div>
            <p>L'affiche, vue par l'IA</p>
            <strong>{AH.name} contre {AA.name}</strong>
          </div>
          <a className="link-btn" href={`#/match/${matchId(affiche)}/story`}>Vivre l'avant-match</a>
        </div>
      </section>

      <DemoBanner meta={meta} />

      <h2 className="section-title">Les {upcoming.length} matchs de la journée</h2>
      <ul className="fixtures">
        {upcoming.map((m) => {
          const id = matchId(m);
          const H = teams[m.home], A = teams[m.away];
          const pr = predict(m, teams);
          const c = confidence(pr.p);
          const mine = picks[id];
          return (
            <li key={id}>
              <TiltLink className="fixture" href={`#/match/${id}`}>
                <div className="fixture-row">
                  <span className="fixture-teams">
                    <Badge team={H} size={34} />
                    <span className="nm">{H.name}</span>
                    <span className="vs">contre</span>
                    <span className="nm">{A.name}</span>
                    <Badge team={A} size={34} />
                  </span>
                </div>
                <ProbaPitch p={pr.p} home={H} away={A} size="md" />
                <div className="fixture-meta">
                  <Confidence c={c} />
                  <span>Score probable {pr.topScores[0].h}-{pr.topScores[0].a} · plus de 2,5 buts {pct(pr.over25)}</span>
                  <span className="ranks">{isPast(m) ? "Joué, résultat bientôt intégré" : kickLabel(m)} · {ord(H.rank)} contre {ord(A.rank)}</span>
                  {mine != null && (
                    <span className="mine">Ton prono : {PICK_LABEL[mine]}{mine === pr.pick ? ", comme l'IA" : ""}</span>
                  )}
                </div>
              </TiltLink>
            </li>
          );
        })}
      </ul>

      <a className="teaser" href={`#/debrief/${meta.lastMatchday}`}>
        <span className="teaser-k">{iaRight}<small>/{last.length}</small></span>
        <span>
          <strong>Débrief de la {meta.lastMatchday}e journée</strong>
          L'IA a trouvé le bon résultat dans {iaRight} matchs. Voir ce qui a fait basculer les autres.
        </span>
      </a>
    </>
  );
}

function kickLabel(m) {
  const d = new Date(m.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  return m.time ? `${d} à ${m.time.replace(":", " h ")}` : d;
}

// Carte qui s'incline légèrement sous le doigt ou la souris.
function TiltLink({ children, ...props }) {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const move = (e) => {
    if (reduced || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.transform = `rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateZ(6px)`;
  };
  const leave = (e) => { e.currentTarget.style.transform = ""; };
  return <a {...props} onPointerMove={move} onPointerLeave={leave}>{children}</a>;
}
