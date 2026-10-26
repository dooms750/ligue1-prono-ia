import React, { useEffect, useState } from "react";
import { Badge, Form, Confidence } from "../components/ui.jsx";
import Stadium3D from "../components/Stadium3D.jsx";
import { predict } from "../model/predict.js";
import { confidence } from "../model/poisson.js";
import { reasons, formSentence, teamStats, fr1, pct, ord } from "../model/narrative.js";
import { matchId, formatDate, go } from "../lib/store.js";

const ABS = { buteur: "son meilleur buteur", gardien: "son gardien titulaire", defenseur: "un défenseur central" };
const WEATHER = { pluie: "Pluie forte annoncée au coup d'envoi.", vent: "Vent fort annoncé sur le stade.", beau: "Météo sans influence attendue." };

// Chaque écran a son plan de caméra : le stade sert de décor à l'histoire.
const SHOT = ["aerial", "low", "side", "low", "verdict", "verdict", "verdict"];

export default function Stories({ id, data, picks, setPick }) {
  const { teams, upcoming } = data;
  const m = upcoming.find((x) => matchId(x) === id);
  const [i, setI] = useState(0);
  const total = 7;
  const mine = picks[id];

  const next = () => i < total - 1 && setI(i + 1);
  const prev = () => i > 0 && setI(i - 1);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") go(`/match/${id}`);
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
  const names = [H.name, "Nul", A.name];

  const slides = [
    <div className="st-slide st-affiche" key="0">
      <p className="st-kicker">{formatDate(m.date)} · {m.md}e journée</p>
      <div className="st-push" />
      <div className="st-glass">
        <div className="st-versus">
          <div><Badge team={H} size={64} /><h2>{H.name}</h2><span>{ord(H.rank)} · {H.pts} pts</span></div>
          <span className="st-vs">contre</span>
          <div><Badge team={A} size={64} /><h2>{A.name}</h2><span>{ord(A.rank)} · {A.pts} pts</span></div>
        </div>
      </div>
      <p className="st-hint">Touche la droite de l'écran pour avancer.</p>
    </div>,

    <div className="st-slide" key="1">
      <h2 className="st-title">La forme du moment</h2>
      <div className="st-push" />
      {[H, A].map((t) => (
        <div className="st-glass st-form" key={t.short}>
          <div className="st-row"><Badge team={t} size={36} /><strong>{t.name}</strong></div>
          <Form form={t.form} />
          <p>{formSentence(t)}</p>
        </div>
      ))}
      <p className="st-note">5 matchs, c'est peu. La forme compte, mais moins que le niveau sur toute la saison.</p>
    </div>,

    <div className="st-slide" key="2">
      <h2 className="st-title">Attaque contre défense</h2>
      <div className="st-push" />
      <div className="st-glass">
        {[
          { label: `${H.name} marque`, v: sh.gpg, side: "dom" },
          { label: `${A.name} encaisse`, v: sa.gapg, side: "ext" },
        ].map((b) => <Bar key={b.label} {...b} max={maxG} />)}
        <hr />
        {[
          { label: `${A.name} marque`, v: sa.gpg, side: "ext" },
          { label: `${H.name} encaisse`, v: sh.gapg, side: "dom" },
        ].map((b) => <Bar key={b.label} {...b} max={maxG} />)}
      </div>
      <p className="st-note">En moyenne par match cette saison. C'est la base du calcul de l'IA : qui crée, qui concède.</p>
    </div>,

    <div className="st-slide" key="3">
      <h2 className="st-title">Le contexte</h2>
      <div className="st-push" />
      {ctxItems.length ? (
        <ul className="st-list">{ctxItems.map((c) => <li key={c}>{c}</li>)}</ul>
      ) : (
        <div className="st-glass"><p className="st-big">Aucune absence majeure, pas de match européen, météo sans influence.</p></div>
      )}
      <p className="st-note">Chaque élément déplace un peu les probabilités. Sur la fiche du match, tu peux les activer un par un.</p>
    </div>,

    <div className="st-slide" key="4">
      <h2 className="st-title">Le verdict de l'IA</h2>
      <p className="st-note">Chaque colonne de lumière est une issue du match. Plus elle monte, plus elle est probable. Le ballon roule vers le favori.</p>
      <div className="st-push" />
      <div className="st-glass">
        <div className="st-verdict-meta">
          <Confidence c={confidence(pr.p)} />
          <span>Plus de 2,5 buts : {pct(pr.over25)}</span>
          <span>Score probable : {pr.topScores[0].h}-{pr.topScores[0].a}</span>
        </div>
      </div>
    </div>,

    <div className="st-slide" key="5">
      <h2 className="st-title">Pourquoi ?</h2>
      <div className="st-push" />
      <div className="st-glass">
        <div className="st-verdict-big">
          {pr.p.map((p, k) => (
            <div key={k} className={k === pr.pick ? "fav" : ""}>
              <b>{Math.round(p * 100)}<small>%</small></b><span>{names[k]}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="st-list st-why">{why.map((w) => <li key={w}>{w}</li>)}</ul>
    </div>,

    <div className="st-slide" key="6">
      <h2 className="st-title">Et toi ?</h2>
      <div className="st-push" />
      <div className="st-glass">
        <p className="st-big">Tu suis l'IA ou tu as un autre avis ?</p>
        <div className="st-picks" role="radiogroup" aria-label="Ton pronostic">
          {names.map((label, k) => (
            <button key={k} role="radio" aria-checked={mine === k}
              className={`st-pick ${mine === k ? "on" : ""}`}
              onClick={(e) => { e.stopPropagation(); setPick(id, k); }}>
              {label}
            </button>
          ))}
        </div>
        {mine != null && (
          <p>
            {mine === pr.pick
              ? "Même avis que l'IA. Verdict au débrief."
              : `Tu pars contre l'IA, qui donne ${pct(pr.p[mine])} à ce résultat. Verdict au débrief.`}
          </p>
        )}
      </div>
      <button className="st-cta" onClick={(e) => { e.stopPropagation(); go(`/match/${id}`); }}>
        Ouvrir la fiche et jouer avec les leviers
      </button>
    </div>,
  ];

  return (
    <div className="stories" role="dialog" aria-label={`${H.name} contre ${A.name}, en stories`}>
      <Stadium3D p={pr.p} home={H} away={A} shot={SHOT[i]} showPillars={i >= 4}
        interactive={false} height="100%" className={`s3d-bg ${i === 4 ? "" : "s3d-nolabels"}`} fallback={null} />
      <div className={`st-veil ${i === 4 ? "light" : ""}`} />
      <div className="st-ui">
        <div className="st-top">
          <div className="st-progress" aria-hidden="true">
            {slides.map((_, k) => <i key={k} className={k < i ? "done" : k === i ? "now" : ""} />)}
          </div>
          <button className="st-close" onClick={() => go(`/match/${id}`)} aria-label="Fermer">
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
