import React, { useEffect, useState } from "react";
import { Badge, Form, ProbaPitch, Confidence } from "../components/ui.jsx";
import { predict } from "../model/predict.js";
import { confidence } from "../model/poisson.js";
import { reasons, formSentence, teamStats, fr1, pct, ord } from "../model/narrative.js";
import { matchId, formatDate, go } from "../lib/store.js";

const ABS = { buteur: "son meilleur buteur", gardien: "son gardien titulaire", defenseur: "un défenseur central" };
const WEATHER = { pluie: "Pluie forte annoncée au coup d'envoi.", vent: "Vent fort annoncé sur le stade.", beau: "Météo sans influence attendue." };

export default function Stories({ id, data, picks, setPick }) {
  const { teams, upcoming } = data;
  const m = upcoming.find((x) => matchId(x) === id);
  const [i, setI] = useState(picks[id] != null ? 5 : 0);
  const [nudge, setNudge] = useState(false);

  const total = 6;
  const mine = picks[id];
  const canNext = i !== 4 || mine != null;

  const next = () => {
    if (!canNext) return setNudge(true);
    if (i < total - 1) setI(i + 1);
  };
  const prev = () => i > 0 && setI(i - 1);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") go("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!m) return <main className="shell"><p className="empty">Ce match n'est pas dans la journée à venir. <a href="#/">Revenir à la journée</a></p></main>;

  const H = teams[m.home], A = teams[m.away];
  const sh = teamStats(H), sa = teamStats(A);
  const pr = predict(m, teams);
  const why = reasons(m, teams, pr.active);
  const ctxItems = [
    ...(m.ctx.absH || []).map((a) => `${H.name} sera privé de ${ABS[a]}.`),
    ...(m.ctx.absA || []).map((a) => `${A.name} sera privé de ${ABS[a]}.`),
    m.ctx.europeH && `${H.name} a joué en Coupe d'Europe cette semaine.`,
    m.ctx.europeA && `${A.name} a joué en Coupe d'Europe cette semaine.`,
    m.ctx.weather !== "beau" && WEATHER[m.ctx.weather],
  ].filter(Boolean);
  const maxG = Math.max(sh.gpg, sh.gapg, sa.gpg, sa.gapg, 2);

  const slides = [
    <div className="st-slide st-affiche" key="0">
      <p className="st-kicker">{formatDate(m.date)} · {m.md}e journée</p>
      <div className="st-versus">
        <div><Badge team={H} size={84} /><h2>{H.name}</h2><span>{ord(H.rank)} · {H.pts} pts</span></div>
        <span className="st-vs">contre</span>
        <div><Badge team={A} size={84} /><h2>{A.name}</h2><span>{ord(A.rank)} · {A.pts} pts</span></div>
      </div>
      <p className="st-hint">Touche la droite de l'écran pour avancer.</p>
    </div>,

    <div className="st-slide" key="1">
      <h2 className="st-title">La forme du moment</h2>
      {[H, A].map((t) => (
        <div className="st-form" key={t.short}>
          <div className="st-row"><Badge team={t} size={40} /><strong>{t.name}</strong></div>
          <Form form={t.form} />
          <p>{formSentence(t)}</p>
        </div>
      ))}
      <p className="st-note">À retenir : 5 matchs, c'est peu. La forme compte, mais moins que le niveau sur toute la saison.</p>
    </div>,

    <div className="st-slide" key="2">
      <h2 className="st-title">Attaque contre défense</h2>
      {[
        { label: `${H.name} marque`, v: sh.gpg, side: "dom" },
        { label: `${A.name} encaisse`, v: sa.gapg, side: "ext" },
      ].map((b) => <Bar key={b.label} {...b} max={maxG} />)}
      <hr />
      {[
        { label: `${A.name} marque`, v: sa.gpg, side: "ext" },
        { label: `${H.name} encaisse`, v: sh.gapg, side: "dom" },
      ].map((b) => <Bar key={b.label} {...b} max={maxG} />)}
      <p className="st-note">En moyenne par match cette saison. C'est la base du calcul de l'IA : qui crée, qui concède.</p>
    </div>,

    <div className="st-slide" key="3">
      <h2 className="st-title">Le contexte</h2>
      {ctxItems.length ? (
        <ul className="st-list">{ctxItems.map((c) => <li key={c}>{c}</li>)}</ul>
      ) : (
        <p className="st-big">Aucune absence majeure, pas de match européen, météo sans influence.</p>
      )}
      <p className="st-note">Chaque élément déplace un peu les probabilités. Dans la fiche du match, tu pourras les activer un par un pour voir leur poids.</p>
    </div>,

    <div className="st-slide" key="4">
      <h2 className="st-title">À toi de jouer</h2>
      <p className="st-big">Quel est ton pronostic ?</p>
      <div className="st-picks" role="radiogroup" aria-label="Ton pronostic">
        {[`${H.name} gagne`, "Match nul", `${A.name} gagne`].map((label, k) => (
          <button key={k} role="radio" aria-checked={mine === k}
            className={`st-pick ${mine === k ? "on" : ""}`}
            onClick={(e) => { e.stopPropagation(); setPick(id, k); setNudge(false); }}>
            {label}
          </button>
        ))}
      </div>
      {nudge && <p className="st-nudge">Choisis un résultat pour découvrir le verdict de l'IA.</p>}
      {mine != null && <p className="st-note">Prono enregistré. Avance pour voir l'avis de l'IA.</p>}
    </div>,

    <div className="st-slide" key="5">
      <h2 className="st-title">Le verdict de l'IA</h2>
      <ProbaPitch p={pr.p} home={H} away={A} size="lg" />
      <div className="st-verdict-meta">
        <Confidence c={confidence(pr.p)} />
        <span>Plus de 2,5 buts : {pct(pr.over25)}</span>
      </div>
      {mine != null && (
        <p className="st-big st-compare">
          {mine === pr.pick
            ? "Tu es d'accord avec l'IA."
            : `L'IA n'est pas de ton avis : elle donne ${pct(pr.p[mine])} de chances à ton pronostic.`}
        </p>
      )}
      <h3>Pourquoi</h3>
      <ul className="st-list st-why">{why.map((w) => <li key={w}>{w}</li>)}</ul>
      <button className="st-cta" onClick={(e) => { e.stopPropagation(); go(`/match/${id}`); }}>
        Ouvrir la fiche et jouer avec les leviers
      </button>
    </div>,
  ];

  return (
    <div className="stories" role="dialog" aria-label={`${H.name} contre ${A.name}, en stories`}>
      <div className="st-top">
        <div className="st-progress" aria-hidden="true">
          {slides.map((_, k) => <i key={k} className={k < i ? "done" : k === i ? "now" : ""} />)}
        </div>
        <button className="st-close" onClick={() => go("/")} aria-label="Fermer">
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="st-stage" onClick={(e) => {
        const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
        if (x > e.currentTarget.offsetWidth * 0.35) next(); else prev();
      }}>
        <div className="st-anim" key={i}>{slides[i]}</div>
      </div>
      <div className="st-nav">
        <button onClick={prev} disabled={i === 0}>Précédent</button>
        <span>{i + 1} / {total}</span>
        <button onClick={next} disabled={i === total - 1}>Suivant</button>
      </div>
    </div>
  );
}

function Bar({ label, v, max, side }) {
  return (
    <div className="st-bar">
      <span>{label}</span>
      <div><i className={`b-${side}`} style={{ width: `${(v / max) * 100}%` }} /></div>
      <b>{fr1(v)}</b>
    </div>
  );
}
