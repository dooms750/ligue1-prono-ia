import React from "react";
import { Badge, ProbaPitch, DemoBanner } from "../components/ui.jsx";
import { debrief, pct } from "../model/narrative.js";
import { matchId, formatDate } from "../lib/store.js";

const RES = ["victoire à domicile", "nul", "victoire à l'extérieur"];

export default function Debrief({ md, data, picks }) {
  const { teams, played, meta } = data;
  const matches = played.filter((m) => m.md === md).map((m) => ({ m, d: debrief(m, teams) }));
  if (!matches.length) return <p className="empty">Pas encore de match joué pour cette journée. <a href="#/debrief">Voir le dernier débrief</a></p>;

  const right = matches.filter((x) => x.d.right).length;
  const mine = matches.filter((x) => picks[matchId(x.m)] != null);
  const mineRight = mine.filter((x) => picks[matchId(x.m)] === x.d.outcome).length;
  const surprise = [...matches].sort((a, b) => b.d.surprise - a.d.surprise)[0];

  return (
    <>
      <DemoBanner meta={meta} />
      <header className="page-head">
        <h1>Débrief de la {md}e journée</h1>
        <p className="lead">{formatDate(matches[0].m.date)}. Ce que l'IA avait prévu, ce qui s'est passé, et pourquoi.</p>
        <nav className="md-chips" aria-label="Choisir une journée">
          {Array.from({ length: meta.lastMatchday }, (_, k) => k + 1).map((n) => (
            <a key={n} href={`#/debrief/${n}`} className={n === md ? "on" : ""} aria-current={n === md ? "page" : undefined}>J{n}</a>
          ))}
        </nav>
      </header>

      <section className="scoreline">
        <div><b>{right}<small>/{matches.length}</small></b><span>bons résultats pour l'IA</span></div>
        <div>
          <b>{mine.length ? <>{mineRight}<small>/{mine.length}</small></> : "–"}</b>
          <span>{mine.length ? "pour toi" : "tu n'avais pas pronostiqué cette journée"}</span>
        </div>
        <div className="scoreline-wide">
          <span>La surprise de la journée</span>
          <strong>{teams[surprise.m.home].name} {surprise.m.hg}-{surprise.m.ag} {teams[surprise.m.away].name}</strong>
          <span>{pct(surprise.d.pActual)} de chances selon l'IA</span>
        </div>
      </section>

      <ul className="debrief-list">
        {matches.map(({ m, d }) => {
          const H = teams[m.home], A = teams[m.away];
          const p = picks[matchId(m)];
          return (
            <li key={matchId(m)} className={`db ${d.right ? "ok" : "ko"}`}>
              <div className="db-score">
                <span className="t"><Badge team={H} size={28} /><span className="nm">{H.name}</span></span>
                <b>{m.hg}<i>-</i>{m.ag}</b>
                <span className="t t-r"><span className="nm">{A.name}</span><Badge team={A} size={28} /></span>
              </div>
              <ProbaPitch p={m.pred.p} home={H} away={A} size="sm" />
              <p className="db-verdict">
                <span className="tag">{d.right ? "Vu juste" : "Raté"}</span>
                {d.verdict}
              </p>
              {d.scorers.length > 0 && <p className="db-scorers">Buteurs : {d.scorers.join(", ")}</p>}
              {d.lines.map((l) => <p key={l} className="db-line">{l}</p>)}
              {m.src && <a className="db-src" href={m.src} target="_blank" rel="noopener noreferrer">Fiche du match sur OneFootball</a>}
              {p != null && (
                <p className="db-mine">Toi : {RES[p]}, {p === d.outcome ? "bien joué." : "raté cette fois."}</p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
