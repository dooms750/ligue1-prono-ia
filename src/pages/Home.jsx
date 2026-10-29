import React from "react";
import { Badge, DemoBanner, isPast, ProbaBlade, Countdown, pairColors } from "../components/ui.jsx";
import Stadium3D from "../components/Stadium3D.jsx";
import { predict } from "../model/predict.js";
import { buildLevers } from "../model/levers.js";
import { ord, pct } from "../model/narrative.js";
import { confidence, outcomeOf } from "../model/poisson.js";
import { matchId } from "../lib/store.js";
import { liveLabel } from "../lib/live.js";
import { liveMarkets } from "../model/liveProbs.js";
import { Sparkline, Delta, trendColor } from "../components/charts.jsx";

const PICK_SHORT = ["1", "N", "2"];

export default function Home({ data, picks, setPick, live = {} }) {
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

      <LiveStrip upcoming={upcoming} teams={teams} live={live} />

      <section className="market">
        <header className="market-head">
          <div>
            <h2>Marchés de la journée</h2>
            <span>{upcoming.length} matchs · cours = probabilité du favori selon l'IA</span>
          </div>
        </header>
        {days.map((d) => (
          <div className="market-day" key={d.date}>
            <h3>{dayLabel(d.date)}</h3>
            <ul>
              {d.items.map((m) => (
                <MarketRow key={matchId(m)} m={m} teams={teams} mine={picks[matchId(m)]} meta={meta}
                  l={live[matchId(m)]} onPick={(o) => setPick(matchId(m), picks[matchId(m)] === o ? null : o)} />
              ))}
            </ul>
          </div>
        ))}
        <p className="market-note">
          Touche 1, N ou 2 pour prendre position (en points virtuels, sans argent) : elle rejoint ton portefeuille.
        </p>
      </section>

      <Movers teams={teams} />

      <a className="teaser3" href={`#/debrief/${meta.lastMatchday}`}>
        <span className="teaser3-k">{iaRight}<small>/{last.length}</small></span>
        <span>
          <strong>Débrief de la {meta.lastMatchday}e journée</strong>
          L'IA a trouvé le bon résultat dans {iaRight} matchs. Voir ce qui a fait basculer les autres.
        </span>
      </a>
      <a className="link-btn academy-link" href="#/academie">L'Académie : 5 notions pour lire un pronostic</a>
    </>
  );
}

const OUT = ["1", "N", "2"];

// Une ligne de marché : le match, son cours (probabilité du favori), sa variation et sa courbe.
function MarketRow({ m, teams, mine, meta, l, onPick }) {
  const id = matchId(m);
  const H = teams[m.home], A = teams[m.away];
  const pr = predict(m, teams);
  const lp = l ? liveMarkets(pr.lh, pr.la, l) : null;
  const p = lp ? lp.p : pr.p;
  const fav = p.indexOf(Math.max(...p));
  const trend = (m.trend || []).map((t) => t.p[fav]);
  const prev = trend.length > 1 ? trend[trend.length - 2] : p[fav];
  const delta = (p[fav] - (lp ? pr.p[fav] : prev)) * 100;
  const past = isPast(m) && !l;
  const detected = buildLevers(m, teams).filter((x) => x.on).length;
  const favName = fav === 1 ? "Nul" : fav === 0 ? H.name : A.name;
  const locked = past || (l && l.state !== "pre");
  return (
    <li className={`mrow ${l ? `mrow-live mrow-${l.state}` : ""} ${past ? "mrow-past" : ""}`}>
      <a className="mrow-main" href={`#/match/${id}`}>
        <span className="mrow-teams">
          <span><Badge team={H} size={22} /><b>{H.name}</b></span>
          <span><Badge team={A} size={22} /><b>{A.name}</b></span>
        </span>
        <span className="mrow-spark">
          <Sparkline values={lp ? [pr.p[fav], p[fav]] : [...trend.slice(0, -1), p[fav]]} width={74} height={34} color={trendColor(delta)} />
        </span>
        <span className="mrow-price">
          <b>{Math.round(p[fav] * 100)}<small>%</small></b>
          <Delta value={delta} unit=" pt" />
          <em>{favName}</em>
        </span>
      </a>
      <div className="mrow-foot">
        <span className="mrow-time">
          {l ? (
            <><b className="live-score">{l.hg}-{l.ag}</b> <span className={l.state === "in" ? "live-min" : ""}>{liveLabel(l)}</span></>
          ) : (
            <>{m.time ? m.time.replace(":", "h") : "–"}{m.md !== meta.nextMatchday && ` · J${m.md}`}{detected > 0 && <span className="mrow-hot"> · {detected} facteur{detected > 1 ? "s" : ""}</span>}</>
          )}
        </span>
        <span className="mrow-btns" role="group" aria-label={`Prendre position sur ${H.name} contre ${A.name}`}>
          {p.map((q, i) => (
            <button key={i} type="button" disabled={locked} aria-pressed={mine === i}
              className={`tbtn tbtn-${i} ${mine === i ? "on" : ""}`} onClick={() => onPick(i)}>
              <span>{OUT[i]}</span><b>{Math.round(q * 100)}%</b>
            </button>
          ))}
        </span>
      </div>
    </li>
  );
}

// Les plus fortes hausses et baisses de l'indice de force des clubs sur 3 journées.
function Movers({ teams }) {
  const rows = Object.entries(teams).map(([code, t]) => {
    const h = t.history || [];
    const now = h[h.length - 1]?.index, before = h[Math.max(0, h.length - 4)]?.index;
    return { code, t, now, chg: now && before ? ((now - before) / before) * 100 : 0, values: h.map((x) => x.index) };
  }).filter((r) => r.now).sort((a, b) => b.chg - a.chg);
  if (!rows.length) return null;
  const picks = [...rows.slice(0, 3), ...rows.slice(-3).reverse()];
  return (
    <section className="movers">
      <header className="market-head">
        <div><h2>Clubs qui bougent</h2><span>Indice de force Lucide, sur 3 journées</span></div>
        <a href="#/clubs" className="see-all">Tous les clubs</a>
      </header>
      <div className="movers-row">
        {picks.map((r) => (
          <a key={r.code} className="mover" href={`#/club/${r.code}`}>
            <span className="mover-top"><Badge team={r.t} size={24} /><b>{r.t.short}</b></span>
            <Sparkline values={r.values.slice(-4)} width={110} height={36} color={trendColor(r.chg)} />
            <span className="mover-val"><b>{r.now.toFixed(1).replace(".", ",")}</b><Delta value={r.chg} unit=" %" /></span>
          </a>
        ))}
      </div>
    </section>
  );
}

// Le bandeau « En direct » en tête de l'accueil, quand des matchs se jouent.
function LiveStrip({ upcoming, teams, live }) {
  const now = upcoming.filter((m) => live[matchId(m)]?.state === "in");
  if (!now.length) return null;
  return (
    <section className="live-strip" aria-live="polite">
      <h2><span className="live-dot" aria-hidden="true" />En direct</h2>
      <div className="live-cards">
        {now.map((m) => {
          const l = live[matchId(m)];
          const H = teams[m.home], A = teams[m.away];
          const pr = predict(m, teams);
          const lp = liveMarkets(pr.lh, pr.la, l);
          const [cH, cA] = pairColors(H, A);
          return (
            <a key={matchId(m)} className="live-card" href={`#/match/${matchId(m)}`}>
              <span className="lc-top">
                <span className="lc-team" style={{ "--c": cH }}>{H.short}{l.redH > 0 && <i className="red" aria-label="carton rouge" />}</span>
                <b className="lc-score">{l.hg}<span>-</span>{l.ag}</b>
                <span className="lc-team lc-away" style={{ "--c": cA }}>{l.redA > 0 && <i className="red" aria-label="carton rouge" />}{A.short}</span>
              </span>
              <span className="lc-min">{liveLabel(l)}</span>
              <ProbaBlade p={lp.p} home={H} away={A} size="sm" />
            </a>
          );
        })}
      </div>
    </section>
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
