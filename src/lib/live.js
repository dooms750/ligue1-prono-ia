// Le direct : score, minute, buts, cartons rouges et tirs cadrés, lus toutes les 30 secondes
// pendant les matchs (source : tableau des scores public d'ESPN, accessible depuis le navigateur).
// Hors des créneaux de match, rien n'est téléchargé.
import { useEffect, useState } from "react";
import { matchId } from "./store.js";

const URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard";
const POLL_MS = 30000;

// Noms ESPN -> codes de l'app.
const ESPN = {
  "Paris Saint-Germain": "PSG", "Lyon": "OL", "Marseille": "OM", "AS Monaco": "MON", "Monaco": "MON",
  "Lille": "LIL", "Lens": "LEN", "Stade Rennais": "REN", "Rennes": "REN", "Nice": "NIC",
  "Strasbourg": "STR", "Brest": "BRE", "Toulouse": "TOU", "Paris FC": "PFC", "Lorient": "LOR",
  "Angers": "ANG", "AJ Auxerre": "AUX", "Auxerre": "AUX", "Le Havre AC": "HAV", "Le Havre": "HAV",
  "Le Mans": "LMA", "Troyes": "TRO",
};

const kickoffMs = (m) => new Date(`${m.date}T${m.time || "21:00"}:00`).getTime();

// Un match est « dans la fenêtre du direct » de 20 minutes avant à 2 h 40 après le coup d'envoi.
function inWindow(m, now) {
  const k = kickoffMs(m);
  return now > k - 20 * 60000 && now < k + 160 * 60000;
}

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

// "45'+2'" -> { min: 45, extra: 2 } ; "67'" -> { min: 67, extra: 0 }
function parseClock(s) {
  const m = /(\d+)'?(?:\+(\d+))?/.exec(s || "");
  return m ? { min: +m[1], extra: +(m[2] || 0) } : { min: 0, extra: 0 };
}

function parseEvent(ev, homeId) {
  const c = parseClock(ev.clock?.displayValue);
  const side = ev.team?.id === homeId ? "H" : "A";
  const type = ev.scoringPlay ? (ev.ownGoal ? "csc" : ev.penaltyKick ? "penalty" : "but") : ev.redCard ? "rouge" : null;
  if (!type) return null;
  return { type, side, min: c.min, extra: c.extra, label: ev.clock?.displayValue || "", player: ev.athletesInvolved?.[0]?.displayName || "" };
}

function stat(team, name) {
  const s = (team?.statistics || []).find((x) => x.name === name);
  const v = s ? parseFloat(s.displayValue) : NaN;
  return Number.isFinite(v) ? v : null;
}

function parse(json) {
  const out = {};
  for (const e of json.events || []) {
    const comp = e.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors.find((t) => t.homeAway === "home");
    const away = comp.competitors.find((t) => t.homeAway === "away");
    const h = ESPN[home?.team?.displayName], a = ESPN[away?.team?.displayName];
    if (!h || !a) continue;
    const st = e.status || {};
    const events = (comp.details || []).map((d) => parseEvent(d, home.team.id)).filter(Boolean);
    const clock = parseClock(st.displayClock);
    out[`${h}-${a}`] = {
      state: st.type?.state, // "pre", "in", "post"
      detail: st.type?.shortDetail || "",
      halftime: st.type?.name === "STATUS_HALFTIME",
      period: st.period || 0,
      minute: clock.min, extra: clock.extra, clock: st.displayClock || "",
      hg: +home.score || 0, ag: +away.score || 0,
      redH: events.filter((x) => x.type === "rouge" && x.side === "H").length,
      redA: events.filter((x) => x.type === "rouge" && x.side === "A").length,
      sotH: stat(home, "shotsOnTarget"), sotA: stat(away, "shotsOnTarget"),
      shotsH: stat(home, "totalShots"), shotsA: stat(away, "totalShots"),
      events,
    };
  }
  return out;
}

// Renvoie { [matchId]: état du direct } pour les matchs à venir en cours ou tout juste terminés.
export function useLive(upcoming) {
  const [live, setLive] = useState({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let stop = false, timer;
    const run = async () => {
      const now = Date.now();
      const watch = (upcoming || []).filter((m) => inWindow(m, now));
      if (!watch.length || document.visibilityState === "hidden") {
        timer = setTimeout(run, POLL_MS);
        return;
      }
      const days = [...new Set(watch.map((m) => ymd(new Date(kickoffMs(m)))))];
      try {
        const results = await Promise.all(days.map((d) => fetch(`${URL}?dates=${d}`).then((r) => r.json())));
        const byTeams = Object.assign({}, ...results.map(parse));
        const next = {};
        for (const m of watch) {
          const l = byTeams[`${m.home}-${m.away}`];
          if (l && l.state !== "pre") next[matchId(m)] = { ...l, fetchedAt: now };
        }
        if (!stop) setLive(next);
      } catch {
        // Réseau indisponible : on garde le dernier état connu.
      }
      if (!stop) timer = setTimeout(run, POLL_MS);
    };
    run();
    const vis = () => document.visibilityState === "visible" && setTick((t) => t + 1);
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); };
  }, [upcoming, tick]);

  return live;
}

export function liveLabel(l) {
  if (!l) return "";
  if (l.state === "post") return "Terminé";
  if (l.halftime) return "Mi-temps";
  return l.clock || `${l.minute}'`;
}
