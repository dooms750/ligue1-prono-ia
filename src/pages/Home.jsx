import React from "react";
import { Badge, ProbaPitch, Confidence, DemoBanner } from "../components/ui.jsx";
import { predict } from "../model/predict.js";
import { ord } from "../model/narrative.js";
import { confidence, outcomeOf } from "../model/poisson.js";
import { matchId, formatDate } from "../lib/store.js";

const PICK_LABEL = ["victoire à domicile", "match nul", "victoire à l'extérieur"];

export default function Home({ data, picks }) {
  const { teams, upcoming, played, meta } = data;
  const done = upcoming.filter((m) => picks[matchId(m)] != null).length;
  const last = played.filter((m) => m.md === meta.lastMatchday);
  const iaRight = last.filter((m) => m.pred.p.indexOf(Math.max(...m.pred.p)) === outcomeOf(m.hg, m.ag)).length;

  return (
    <>
      <DemoBanner meta={meta} />
      <section className="hero">
        <p className="hero-date">{formatDate(upcoming[0].date)}</p>
        <h1>
          <span className="hero-num">{meta.nextMatchday}</span>
          <span className="hero-txt">e journée,<br />décryptée avant le coup d'envoi.</span>
        </h1>
        <p className="lead">
          Pour chaque match : l'histoire en quelques écrans, ton pronostic, puis celui de l'IA,
          avec ses raisons.
        </p>
        <div className="progress" aria-label={`${done} pronostics sur ${upcoming.length}`}>
          {upcoming.map((m) => (
            <i key={matchId(m)} className={picks[matchId(m)] != null ? "on" : ""} />
          ))}
          <span>{done === 0 ? "Aucun prono pour l'instant" : `${done} sur ${upcoming.length} pronostiqués`}</span>
        </div>
      </section>

      <ul className="fixtures">
        {upcoming.map((m) => {
          const id = matchId(m);
          const H = teams[m.home], A = teams[m.away];
          const pr = predict(m, teams);
          const mine = picks[id];
          const target = mine == null ? `#/match/${id}/story` : `#/match/${id}`;
          return (
            <li key={id}>
              <a className="fixture" href={target}>
                <div className="fixture-teams">
                  <span className="t"><Badge team={H} size={30} />{H.name}<em>{ord(H.rank)}</em></span>
                  <span className="t"><Badge team={A} size={30} />{A.name}<em>{ord(A.rank)}</em></span>
                </div>
                {mine == null ? (
                  <div className="fixture-locked">
                    <span>Découvrir le match, faire ton prono</span>
                    <small>Le pronostic de l'IA s'affiche après le tien</small>
                  </div>
                ) : (
                  <div className="fixture-open">
                    <ProbaPitch p={pr.p} home={H} away={A} size="sm" />
                    <div className="fixture-meta">
                      <Confidence c={confidence(pr.p)} />
                      <span className={mine === pr.pick ? "agree" : "disagree"}>
                        Toi : {PICK_LABEL[mine]}
                        {mine === pr.pick ? ", comme l'IA" : ", l'IA voit autre chose"}
                      </span>
                    </div>
                  </div>
                )}
              </a>
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
