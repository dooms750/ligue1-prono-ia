// Probabilités en direct : on part du score actuel et on ajoute les buts encore possibles
// sur le temps restant, avec la même loi de Poisson que le pronostic d'avant-match.
import { computeMarkets } from "./poisson.js";

const RED_OWN = 0.72;   // une équipe à 10 marque environ 28 % de buts en moins
const RED_OTHER = 1.25; // et en encaisse environ 25 % de plus

export function remainingShare(l) {
  if (!l || l.state === "post") return 0;
  if (l.state !== "in") return 1;
  if (l.halftime) return 0.5;
  const played = l.period >= 2 ? Math.max(45, l.minute) + l.extra : Math.min(45, l.minute);
  // Environ 4 minutes de temps additionnel en fin de match.
  return Math.max(0, (94 - played) / 94);
}

export function liveMarkets(lh, la, l) {
  const r = remainingShare(l);
  if (r === 0) {
    const hg0 = l?.hg || 0, ag0 = l?.ag || 0, o = hg0 > ag0 ? 0 : hg0 === ag0 ? 1 : 2;
    return { p: [0, 1, 2].map((i) => (i === o ? 1 : 0)), pick: o, over25: hg0 + ag0 > 2 ? 1 : 0, remaining: 0 };
  }
  let fh = 1, fa = 1;
  for (let i = 0; i < (l?.redH || 0); i++) { fh *= RED_OWN; fa *= RED_OTHER; }
  for (let i = 0; i < (l?.redA || 0); i++) { fa *= RED_OWN; fh *= RED_OTHER; }
  const rem = computeMarkets(Math.max(lh * fh * r, 1e-6), Math.max(la * fa * r, 1e-6));
  const hg = l?.hg || 0, ag = l?.ag || 0;
  // Grille des buts restants -> issue finale.
  const p = [0, 0, 0];
  let over25 = 0;
  rem.grid.forEach((row, i) => row.forEach((q, j) => {
    const H = hg + i, A = ag + j;
    p[H > A ? 0 : H === A ? 1 : 2] += q;
    if (H + A > 2) over25 += q;
  }));
  const pick = p.indexOf(Math.max(...p));
  return { p, pick, over25, remaining: r };
}
