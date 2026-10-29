import React, { useEffect, useState } from "react";
import { DemoBanner, ago } from "../components/ui.jsx";
import { outcomeOf, brier, impliedFromOdds } from "../model/poisson.js";
import { pct } from "../model/narrative.js";
import { matchId } from "../lib/store.js";

const NAIVE = [0.44, 0.27, 0.29];
const num = (x, d = 3) => (x == null ? "–" : x.toFixed(d).replace(".", ","));
const signed = (x, d = 3) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${num(Math.abs(x), d)}`;
const seasonLabel = (c) => `20${c.slice(0, 2)}-${c.slice(2)}`;
const MODELS = [
  { k: "ia", label: "IA Lucide" },
  { k: "mk", label: "Bookmakers, marge retirée" },
  { k: "ref", label: "Référence simple" },
];

// Repli sans mesures (mode démo) : calcul dans le navigateur.
function localQuality(played) {
  const rows = played.map((m) => ({ o: outcomeOf(m.hg, m.ag), ia: m.pred.p, mk: impliedFromOdds(m.odds)?.p, ref: NAIVE }))
    .filter((r) => r.mk);
  if (!rows.length) return null;
  const n = rows.length;
  const models = {};
  for (const { k } of MODELS) {
    models[k] = {
      brier: rows.reduce((s, r) => s + brier(r[k], r.o), 0) / n,
      logloss: rows.reduce((s, r) => s - Math.log(Math.max(r[k][r.o], 1e-6)), 0) / n,
      acc: rows.filter((r) => r[k].indexOf(Math.max(...r[k])) === r.o).length / n,
    };
  }
  return { n, models, calib: { ia: [], mk: [] } };
}

export default function Bilan({ data, picks, section }) {
  const { played, meta } = data;
  const ev = data.eval;
  const q = ev?.quality;
  const scopes = q ? [
    ...(q.seasons?.[q.current] ? [{ id: "cur", label: "Cette saison", res: q.seasons[q.current] }] : []),
    ...(q.all && Object.keys(q.seasons).length > 1
      ? [{ id: "all", label: `Depuis ${seasonLabel(Object.keys(q.seasons).sort()[0])}`, res: q.all }] : []),
  ] : [];
  const [scope, setScope] = useState(scopes.length > 1 ? "all" : "cur");
  const res = scopes.find((s) => s.id === scope)?.res || scopes[0]?.res || localQuality(played);

  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [section]);

  const rows = played.map((m) => {
    const o = outcomeOf(m.hg, m.ag);
    const p = m.pred.p;
    return { m, o, right: p.indexOf(Math.max(...p)) === o, over: m.hg + m.ag > 2, pOver: m.pred.over25 };
  });
  const n = rows.length;
  const acc = rows.filter((r) => r.right).length;
  const overOk = rows.filter((r) => (r.pOver >= 0.5) === r.over).length;
  const mine = rows.filter((r) => picks[matchId(r.m)] != null);
  const mineOk = mine.filter((r) => picks[matchId(r.m)] === r.o).length;
  const byMd = Array.from({ length: meta.lastMatchday }, (_, k) => {
    const rs = rows.filter((r) => r.m.md === k + 1);
    return { md: k + 1, ok: rs.filter((r) => r.right).length, n: rs.length };
  });

  return (
    <>
      <DemoBanner meta={meta} />
      <header className="page-head">
        <h1>Le bilan de l'IA, sans filtre</h1>
        <p className="lead">
          Chaque pronostic est calculé avant le match, avec uniquement les résultats connus à ce moment-là, puis comparé
          aux bookmakers et à une référence simple, sur exactement les mêmes matchs.
        </p>
      </header>

      <section className="stats stats-4">
        <div><b>{pct(acc / n)}</b><span>Bon résultat (1, N ou 2) sur {n} matchs cette saison</span></div>
        <div><b>{pct(overOk / n)}</b><span>Bonne lecture du « plus de 2,5 buts »</span></div>
        <div><b>{res ? num(res.models.ia.logloss) : "–"}</b><span>Log-loss de l'IA (plus bas = mieux)</span></div>
        <div><b>{mine.length ? `${mineOk}/${mine.length}` : "–"}</b><span>{mine.length ? "Tes bons pronos" : "Tes pronos apparaîtront après les matchs"}</span></div>
      </section>

      {res && (
        <section className="block">
          <h2>Qui se trompe le moins ?</h2>
          {scopes.length > 1 && (
            <div className="seg" role="tablist" aria-label="Période">
              {scopes.map((s) => (
                <button key={s.id} role="tab" aria-selected={scope === s.id} className={scope === s.id ? "on" : ""}
                  onClick={() => setScope(s.id)}>{s.label} <small>{s.res.n} matchs</small></button>
              ))}
            </div>
          )}
          <ScoreTable res={res} />
          <Verdict res={res} />
          {scope === "all" && (
            <p className="muted small">
              Les saisons passées sont rejouées avec exactement la même recette que l'app : chaque journée est prédite
              avec les seuls matchs déjà joués et la saison d'avant.
            </p>
          )}
          <details className="howto">
            <summary>Comment lire ces mesures</summary>
            <p><b>Log-loss</b> : la « surprise » moyenne. Si l'IA donnait 60 % au résultat arrivé, elle perd peu ; si elle
              lui donnait 10 %, elle perd beaucoup. C'est la mesure qui punit le plus les certitudes fausses.</p>
            <p><b>Score de Brier</b> : l'écart moyen entre les probabilités annoncées et ce qui s'est passé (0 = parfait,
              0,667 = annoncer toujours un tiers partout).</p>
            <p><b>Bookmakers, marge retirée</b> : les cotes moyennes du marché, transformées en probabilités dont on
              retire la marge (la somme redevient 100 %). C'est la référence la plus exigeante.</p>
            <p><b>Référence simple</b> : annoncer toujours les fréquences déjà observées (environ 44 % domicile,
              26 % nul, 30 % extérieur). Un modèle qui ne bat pas ça n'apporte rien.</p>
            <p><b>Intervalle</b> : en rééchantillonnant les matchs, on obtient la fourchette dans laquelle se situe
              l'écart réel avec 90 % de confiance. Si elle contient 0, la différence n'est pas démontrée.</p>
          </details>
        </section>
      )}

      {res?.calib?.ia?.length > 0 && (
        <section className="block">
          <h2>Est-ce que l'IA est bien calibrée ?</h2>
          <p className="muted">
            Si elle annonce 40 %, le résultat doit arriver environ 4 fois sur 10. Plus les points sont proches de la
            diagonale, plus les probabilités sont honnêtes. La taille d'un point indique le nombre de cas.
          </p>
          <Calibration series={[{ k: "ia", label: "IA Lucide", bins: res.calib.ia }, { k: "mk", label: "Bookmakers", bins: res.calib.mk }]} />
        </section>
      )}

      {ev?.levers && <Levers levers={ev.levers} />}
      {ev?.live && <Live live={ev.live} />}

      <section className="block">
        <h2>Journée par journée</h2>
        <div className="md-bars">
          {byMd.map((b) => (
            <a key={b.md} href={`#/debrief/${b.md}`} className="md-bar" aria-label={`Journée ${b.md} : ${b.ok} sur ${b.n}`}>
              <i style={{ height: `${b.n ? (b.ok / b.n) * 100 : 0}%` }} />
              <b>{b.ok}</b>
              <span>J{b.md}</span>
            </a>
          ))}
        </div>
        <p className="muted small">Bons résultats sur 9 matchs. Touche une journée pour lire son débrief.</p>
      </section>

      <DataHealth meta={meta} />
    </>
  );
}

function ScoreTable({ res }) {
  const best = (metric, higher) => {
    const vals = MODELS.map((m) => res.models[m.k]?.[metric]).filter((x) => x != null);
    return higher ? Math.max(...vals) : Math.min(...vals);
  };
  const b = { brier: best("brier"), logloss: best("logloss"), acc: best("acc", true) };
  return (
    <div className="score-table" role="table" aria-label="Comparaison des modèles">
      <div role="row" className="st-head">
        <span role="columnheader">Sur {res.n} matchs</span>
        <span role="columnheader">Log-loss</span>
        <span role="columnheader">Brier</span>
        <span role="columnheader">Bons 1N2</span>
      </div>
      {MODELS.map(({ k, label }) => {
        const m = res.models[k];
        return (
          <div role="row" key={k} className={k === "ia" ? "st-me" : ""}>
            <span role="cell">{label}</span>
            <span role="cell" className={m.logloss === b.logloss ? "best" : ""}>{num(m.logloss)}</span>
            <span role="cell" className={m.brier === b.brier ? "best" : ""}>{num(m.brier)}</span>
            <span role="cell" className={m.acc === b.acc ? "best" : ""}>{pct(m.acc)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Verdict({ res }) {
  const ci = res.diffMk_logloss, cr = res.diffRef_logloss;
  if (!ci) return null;
  const d = res.models.ia.logloss - res.models.mk.logloss;
  const dr = res.models.ia.logloss - res.models.ref.logloss;
  const vsMk = ci[0] > 0
    ? `Les bookmakers font mieux que l'IA (écart de ${num(d)}, entre ${num(ci[0])} et ${num(ci[1])} avec 90 % de confiance) : l'écart est réel.`
    : ci[1] < 0
      ? `L'IA fait mieux que les bookmakers (écart de ${signed(d)}, fourchette ${signed(ci[0])} à ${signed(ci[1])}).`
      : `Pas de différence démontrée avec les bookmakers (écart de ${signed(d)}, fourchette ${signed(ci[0])} à ${signed(ci[1])}).`;
  const vsRef = cr && cr[1] < 0
    ? `Elle bat nettement la référence simple (${signed(dr)}) : le modèle apporte une vraie information.`
    : cr && cr[0] > 0
      ? `Elle fait moins bien que la référence simple (${signed(dr)}) : signal d'alerte.`
      : `Face à la référence simple, l'écart (${signed(dr)}) n'est pas encore démontré.`;
  return <p className="explain">{vsMk} {vsRef}</p>;
}

function Calibration({ series }) {
  const S = 260, pad = 34, R = 14;
  const x = (v) => pad + (v / 0.8) * (S - pad - R);
  const y = (v) => S - pad - (v / 0.8) * (S - pad - R);
  return (
    <figure className="calib-fig">
      <svg viewBox={`0 0 ${S} ${S}`} className="calib" role="img"
        aria-label="Graphique de calibration : probabilité annoncée contre fréquence observée, pour l'IA et les bookmakers">
        {[0, 0.2, 0.4, 0.6, 0.8].map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={y(0)} x2={x(t)} y2={y(0.8)} className="calib-grid" />
            <line x1={x(0)} y1={y(t)} x2={x(0.8)} y2={y(t)} className="calib-grid" />
            <text x={x(t)} y={S - 14} textAnchor="middle">{Math.round(t * 100)}%</text>
            <text x={pad - 6} y={y(t) + 4} textAnchor="end">{Math.round(t * 100)}%</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(0.8)} y2={y(0.8)} className="calib-diag" />
        {series.map((s) => (
          <g key={s.k} className={`calib-${s.k}`}>
            <polyline points={s.bins.map((b) => `${x(b.pred)},${y(Math.min(b.obs, 0.8))}`).join(" ")} className="calib-line" />
            {s.bins.map((b) => (
              <circle key={b.lo} cx={x(b.pred)} cy={y(Math.min(b.obs, 0.8))} r={2.5 + Math.sqrt(b.n) * 0.35} className="calib-dot">
                <title>{`${s.label} : annoncé ${Math.round(b.pred * 100)} %, arrivé ${Math.round(b.obs * 100)} % (${b.n} cas)`}</title>
              </circle>
            ))}
          </g>
        ))}
        <text x={S / 2 + 10} y={S - 1} textAnchor="middle" className="calib-axis">probabilité annoncée</text>
      </svg>
      <figcaption className="calib-legend">
        <span className="lg-ia">IA Lucide</span><span className="lg-mk">Bookmakers</span><span className="lg-diag">Calibration parfaite</span>
      </figcaption>
    </figure>
  );
}

const LEVER_TXT = {
  buteur: { title: "Sans son meilleur buteur", detail: "meilleur buteur de l'équipe (3 buts au moins) absent du onze de départ" },
  coupe: { title: "Match de coupe en semaine", detail: "match européen ou de Coupe de France joué entre 12 h et 4 jours et demi avant" },
  meteo: { title: "Pluie ou vent", detail: "plus de 1,5 mm de pluie ou rafales de plus de 55 km/h relevées pendant le match" },
};
const fx = (f) => `${f < 1 ? "−" : "+"}${Math.round(Math.abs(1 - f) * 100)} %`;

function Levers({ levers }) {
  return (
    <section className="block">
      <h2>Les leviers à l'épreuve des données</h2>
      <p className="muted">
        Chaque levier partait d'une hypothèse. On a mesuré son effet réel sur les buts dans les saisons passées, puis
        vérifié, match après match et dans l'ordre chronologique, qu'il améliorait les pronostics suivants. Seuls les
        leviers qui améliorent les pronostics sont gardés.
      </p>
      <div className="lv-cards">
        {Object.entries(levers).map(([k, v]) => (
          <article key={k} className={`lv-card ${v.kept ? "kept" : "dropped"}`}>
            <header>
              <h3>{LEVER_TXT[k].title}</h3>
              <span className="lv-badge">{v.kept ? "Gardé" : "Écarté"}</span>
            </header>
            <dl>
              <div><dt>Hypothèse de départ</dt><dd>{fx(v.hypothesis.own)} de buts</dd></div>
              <div><dt>Effet mesuré</dt><dd>{fx(v.own)}{v.ci ? <small> (entre {fx(v.ci[0])} et {fx(v.ci[1])})</small> : null}</dd></div>
              <div><dt>Buts observés / attendus</dt><dd>{v.goalsObserved} / {num(v.goalsExpected, 0)}</dd></div>
              <div><dt>Gain hors échantillon</dt><dd>{v.gain == null ? "pas assez de cas" : `${signed(v.gain, 4)} sur ${v.nTest} matchs`}
                {v.gainCi && <small>fourchette {signed(v.gainCi[0], 4)} à {signed(v.gainCi[1], 4)}</small>}</dd></div>
            </dl>
            {v.ci && (v.ci[0] > 1 || v.ci[1] < 1) && (v.own - 1) * (v.hypothesis.own - 1) < 0 && (
              <p className="small lv-note">Effet inverse de l'hypothèse de départ.{k === "coupe" ? " Les clubs engagés en coupe sont souvent les meilleurs, et le modèle les sous-estime un peu : la fatigue ne se voit pas dans les données." : ""}</p>
            )}
            <p className="muted small">
              {v.n} matchs concernés sur {v.nKnown} vérifiables ({LEVER_TXT[k].detail}).
              {v.gainHyp != null && ` L'hypothèse de départ aurait donné ${signed(v.gainHyp, 4)}.`}
            </p>
          </article>
        ))}
      </div>
      <p className="muted small">
        Un gain positif signifie des pronostics meilleurs avec le levier. Un levier écarté reste visible sur la fiche du
        match pour comprendre, mais il ne change plus le pronostic.
      </p>
    </section>
  );
}

const BLOCKS = {
  rythme: { title: "Le rythme du match", txt: (f) => `Plus de buts en fin de match qu'en début (pente mesurée ${signed(f.gamma, 2)}).` },
  cartons: { title: "Les cartons rouges mesurés", txt: (f) => `Équipe à 10 : ${fx(Math.exp(f.redOwn))} de buts, adversaire : ${fx(Math.exp(f.redOpp))}. Les valeurs fixes (−28 % et +25 %) restent utilisées si la mesure ne fait pas mieux.` },
  score: { title: "L'effet du score", txt: (f) => `Équipe menée : ${fx(Math.exp(f.trail))} de buts, équipe qui mène : ${fx(Math.exp(f.lead))}.` },
  tirs: { title: "Les tirs cadrés déjà obtenus", txt: (f) => `Effet de l'écart entre tirs cadrés obtenus et attendus : ${signed(f.sot, 2)}.` },
};

function Live({ live }) {
  const t = live.table || [];
  return (
    <section className="block">
      <h2>Le direct à l'épreuve des données</h2>
      <p className="muted">
        Les probabilités en direct sont rejouées sur {t[0]?.n || 0} matchs déjà joués ({live.tested.map(seasonLabel).join(", ")}),
        avec des réglages appris uniquement sur les saisons précédentes. Chaque brique du modèle est ajoutée une à une,
        et gardée seulement si elle améliore les pronostics à 15, 30, 45, 60, 75 et 85 minutes.
      </p>
      <div className="lv-cards lv-cards-2">
        {Object.entries(BLOCKS).map(([k, b]) => {
          const st = live.blocks?.[k];
          if (!st) return null;
          return (
            <article key={k} className={`lv-card ${st.kept ? "kept" : "dropped"}`}>
              <header><h3>{b.title}</h3><span className="lv-badge">{st.kept ? "Gardé" : "Écarté"}</span></header>
              <p className="small">{b.txt(live.fitted)}</p>
              <p className="muted small">Gain à elle seule, hors échantillon : {st.gain == null ? "–" : `${signed(st.gain, 4)} de log-loss`}</p>
            </article>
          );
        })}
      </div>
      {t.length > 0 && (
        <>
          <div className="score-table live-table" role="table" aria-label="Validation du modèle en direct">
            <div role="row" className="st-head">
              <span role="columnheader">Minute</span><span role="columnheader">Ancien</span>
              <span role="columnheader">Retenu</span><span role="columnheader">Gain</span>
            </div>
            {t.map((r) => (
              <div role="row" key={r.min}>
                <span role="cell">{r.min === 45 ? "Mi-temps" : `${r.min}e`}</span>
                <span role="cell">{num(r.old.logloss)}</span>
                <span role="cell" className={r.new.logloss < r.old.logloss ? "best" : ""}>{num(r.new.logloss)}</span>
                <span role="cell">{signed(r.old.logloss - r.new.logloss)}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Log-loss moyenne de l'issue finale annoncée à chaque minute (plus bas = mieux).</p>
        </>
      )}
      <p className="explain">
        {live.used === "mesuré"
          ? `Le modèle retenu (${live.chosen.map((c) => BLOCKS[c].title.toLowerCase()).join(", ")}) fait mieux que l'ancien : c'est lui qui calcule le direct.`
          : "Aucune brique ne fait mieux que l'ancien modèle : l'app le garde."}
      </p>
      <p className="muted small">
        Appris sur {live.n} matchs, dont {live.nShots} avec les tirs minute par minute et {live.nReds} cartons rouges.
      </p>
    </section>
  );
}

const STATUS = { ok: "À jour", late: "En retard", partial: "Partiel", ko: "En échec" };

function DataHealth({ meta }) {
  const hs = meta.health || [];
  const ch = meta.checks;
  return (
    <section className="block" id="donnees">
      <h2>L'état des données</h2>
      <p className="muted">
        Dernière collecte {ago(meta.fetchedAt)}, pronostics recalculés {ago(meta.generatedAt)}. Chaque source est
        surveillée : une source en échec garde ses dernières données connues, et l'app le signale ici.
      </p>
      {hs.length > 0 && (
        <ul className="health">
          {hs.map((h) => (
            <li key={h.id} className={`hs-${h.status}`}>
              <i aria-hidden="true" />
              <span><b>{h.label}</b><small>{STATUS[h.status]} · dernier succès {ago(h.lastOk)}{h.count != null ? ` · ${h.count} éléments` : ""}</small>
                {h.error && h.status !== "ok" && <small className="hs-err">{h.error}</small>}</span>
            </li>
          ))}
        </ul>
      )}
      {ch && (
        <>
          <p>
            <b>Contrôle croisé des scores</b> : {ch.agree} matchs sur {ch.compared} identiques chez OneFootball, ESPN et
            football-data.co.uk.
          </p>
          {ch.fixed.length > 0 && (
            <ul className="trace-list">{ch.fixed.map((f) => <li key={f}>Corrigé : {f}</li>)}</ul>
          )}
          {ch.issues.length > 0
            ? <ul className="trace-list warn">{ch.issues.map((f) => <li key={f}>{f}</li>)}</ul>
            : <p className="muted small">Aucune incohérence : équipes toutes reconnues, pas de doublon, journées complètes.</p>}
        </>
      )}
      <p className="muted small">
        Chaque pronostic publié est aussi enregistré avec ses données (probabilités, leviers, météo, presse, heure de
        calcul) et figé au coup d'envoi, dans le dépôt GitHub du projet.
      </p>
    </section>
  );
}
