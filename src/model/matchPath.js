// Le « graphique du match » : comment les probabilités ont bougé minute après minute,
// au fil des buts et des cartons rouges, avec le même modèle que le direct.
import { liveMarkets } from "./liveProbs.js";

const toBin = (min, half) => (half === 1 || (half == null && min <= 45) ? Math.min(Math.max(min, 1), 45) : Math.min(Math.max(min, 46), 90));

// Événements d'un match joué (season.json).
export function playedEvents(m) {
  const ev = (m.scorers || []).filter((g) => g.kind !== "refuse" && g.kind !== "refusé")
    .map((g) => ({ side: g.side === "home" ? "H" : "A", type: "but", bin: toBin(g.min || 1, g.half), player: g.player }));
  if (m.redH) ev.push({ side: "H", type: "rouge", bin: toBin(m.redH) });
  if (m.redA) ev.push({ side: "A", type: "rouge", bin: toBin(m.redA) });
  return ev.sort((a, b) => a.bin - b.bin);
}

// Événements du direct (ESPN).
export function liveEvents(l) {
  return (l?.events || []).map((e) => ({
    side: e.side, type: e.type === "rouge" ? "rouge" : "but", bin: toBin(e.min || 1, e.min <= 45 ? 1 : 2), player: e.player,
  })).sort((a, b) => a.bin - b.bin);
}

// Probabilités [1, N, 2] de la minute 0 à upTo (90 = fin du match).
export function matchPath(lh, la, events, upTo = 90, final = null) {
  const out = [];
  for (let t = 0; t <= upTo; t++) {
    const done = events.filter((e) => e.bin <= t);
    const hg = done.filter((e) => e.type === "but" && e.side === "H").length;
    const ag = done.filter((e) => e.type === "but" && e.side === "A").length;
    const redH = done.filter((e) => e.type === "rouge" && e.side === "H").length;
    const redA = done.filter((e) => e.type === "rouge" && e.side === "A").length;
    const last = t === 90 && final;
    const l = last
      ? { state: "post", hg: final[0], ag: final[1] }
      : { state: "in", period: t > 45 ? 2 : 1, minute: t, extra: 0, halftime: t === 45, hg, ag, redH, redA };
    out.push({ t, p: liveMarkets(lh, la, l).p, hg, ag });
  }
  return out;
}
