// Probabilités en direct.
// Les buts arrivent minute après minute. L'intensité de chaque équipe part de ses buts attendus
// d'avant-match, puis dépend :
//   - du moment du match (il y a plus de buts en fin de match),
//   - du score (l'équipe menée pousse, celle qui mène gère),
//   - des cartons rouges,
//   - des tirs cadrés déjà obtenus par rapport à ce qui était attendu.
// Les réglages sont mesurés sur les saisons passées (voir scripts/evaluate.py) et validés sur la
// saison suivante. On simule ensuite toutes les minutes restantes pour obtenir l'issue finale.
import { CFG } from "./config.js";

const SOT_TO_GOALS = 0.31;
const BINS = 90;
// Minute 45 et minute 90 : elles comptent aussi le temps additionnel.
const DEFAULT_DUR = Array.from({ length: BINS + 1 }, (_, u) => (u === 0 ? 0 : u === 45 ? 3 : u === 90 ? 6 : 1));
// Ancien modèle (hypothèses fixes), utilisé tant qu'aucune mesure n'est disponible.
export const OLD = { alpha: 0, gamma: 0, trail: 0, lead: 0, redOwn: Math.log(0.72), redOpp: Math.log(1.25), sot: 0 };

function shape(gamma, dur) {
  const w = dur.map((d, u) => (u === 0 ? 0 : Math.max(1e-6, d * (1 + (gamma * (u - 45.5)) / 45))));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

// Prochaine minute à jouer et part restante de cette minute.
export function position(l) {
  if (!l || l.state !== "in") return { nxt: 1, frac: 1 };
  if (l.halftime) return { nxt: 46, frac: 1 };
  if ((l.period || 1) >= 2) {
    if (l.minute >= 90) return { nxt: 90, frac: Math.max(0.15, (6 - 1 - (l.extra || 0)) / 6) };
    return { nxt: Math.max(46, l.minute + 1), frac: 1 };
  }
  if (l.minute >= 45) return { nxt: 45, frac: Math.max(0.15, (3 - 1 - (l.extra || 0)) / 3) };
  return { nxt: l.minute + 1, frac: 1 };
}

export function liveMarkets(lh, la, l, params) {
  const hg = l?.hg || 0, ag = l?.ag || 0;
  if (!l || l.state === "post") {
    const o = hg > ag ? 0 : hg === ag ? 1 : 2;
    return { p: [0, 1, 2].map((i) => (i === o ? 1 : 0)), pick: o, over25: hg + ag > 2 ? 1 : 0, remaining: 0 };
  }
  const th = params || CFG.live?.params || OLD;
  const dur = CFG.live?.dur || DEFAULT_DUR;
  const w = shape(th.gamma, dur);
  const { nxt, frac } = position(l);
  const cumBefore = w.slice(0, nxt).reduce((a, b) => a + b, 0);
  const rh = l.redH || 0, ra = l.redA || 0;
  let mh = th.alpha + th.redOwn * rh + th.redOpp * ra;
  let ma = th.alpha + th.redOwn * ra + th.redOpp * rh;
  if (th.sot && l.sotH != null && l.sotA != null) {
    mh += th.sot * Math.log((l.sotH + 1) / ((lh / SOT_TO_GOALS) * cumBefore + 1));
    ma += th.sot * Math.log((l.sotA + 1) / ((la / SOT_TO_GOALS) * cumBefore + 1));
  }
  const G = 9;
  let P = Array.from({ length: G + 1 }, () => new Float64Array(G + 1));
  P[0][0] = 1;
  let remaining = 0;
  for (let u = nxt; u <= BINS; u++) {
    const wu = w[u] * (u === nxt ? frac : 1);
    remaining += wu;
    const N = Array.from({ length: G + 1 }, () => new Float64Array(G + 1));
    for (let i = 0; i <= G; i++) {
      for (let j = 0; j <= G; j++) {
        const q = P[i][j];
        if (q < 1e-12) continue;
        const diff = hg + i - (ag + j);
        const ph = 1 - Math.exp(-lh * wu * Math.exp(mh + th.trail * (diff < 0) + th.lead * (diff > 0)));
        const pa = 1 - Math.exp(-la * wu * Math.exp(ma + th.trail * (diff > 0) + th.lead * (diff < 0)));
        const i2 = Math.min(i + 1, G), j2 = Math.min(j + 1, G);
        N[i][j] += q * (1 - ph) * (1 - pa);
        N[i2][j] += q * ph * (1 - pa);
        N[i][j2] += q * (1 - ph) * pa;
        N[i2][j2] += q * ph * pa;
      }
    }
    P = N;
  }
  const p = [0, 0, 0];
  let over25 = 0;
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
    const H = hg + i, A = ag + j, q = P[i][j];
    p[H > A ? 0 : H === A ? 1 : 2] += q;
    if (H + A > 2) over25 += q;
  }
  const pick = p.indexOf(Math.max(...p));
  return { p, pick, over25, remaining };
}
