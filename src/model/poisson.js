// Moteur de probabilités côté navigateur.
// À partir des buts attendus (lambda) de chaque équipe, on calcule la grille
// des scores possibles avec la loi de Poisson, puis tous les marchés.

const MAX_GOALS = 8;

function poissonPmf(k, lambda) {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * lambda ** k) / fact;
}

export function scoreGrid(lh, la) {
  const gh = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(k, lh));
  const ga = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(k, la));
  const grid = gh.map((ph) => ga.map((pa) => ph * pa));
  const total = grid.flat().reduce((s, x) => s + x, 0);
  return grid.map((row) => row.map((x) => x / total));
}

export function computeMarkets(lh, la) {
  const grid = scoreGrid(lh, la);
  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0;
  const scores = [];
  grid.forEach((row, i) =>
    row.forEach((p, j) => {
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      if (i + j > 2) over25 += p;
      if (i > 0 && j > 0) btts += p;
      scores.push({ h: i, a: j, p });
    }),
  );
  scores.sort((x, y) => y.p - x.p);
  const p = [home, draw, away];
  const pick = p.indexOf(Math.max(...p));
  return { p, pick, over25, btts, topScores: scores.slice(0, 5), grid, lh, la };
}

// Indice de confiance : à quel point le match est lisible.
export function confidence(p) {
  const max = Math.max(...p);
  if (max >= 0.58) return { level: 3, label: "Forte", text: "Un favori net se dégage." };
  if (max >= 0.45) return { level: 2, label: "Moyenne", text: "Un favori, mais rien n'est joué." };
  return { level: 1, label: "Faible", text: "Match très ouvert : l'IA ne voit pas de favori clair." };
}

// Cotes du marché -> probabilités, en retirant la marge du bookmaker.
export function impliedFromOdds(odds) {
  if (!odds) return null;
  const raw = odds.map((o) => 1 / o);
  const sum = raw.reduce((s, x) => s + x, 0);
  return { p: raw.map((x) => x / sum), margin: sum - 1 };
}

export const OUTCOMES = ["dom", "nul", "ext"];

export function outcomeOf(hg, ag) {
  return hg > ag ? 0 : hg === ag ? 1 : 2;
}

// Score de Brier : 0 = parfait, plus c'est bas mieux c'est.
export function brier(p, outcome) {
  return p.reduce((s, x, i) => s + (x - (i === outcome ? 1 : 0)) ** 2, 0);
}
