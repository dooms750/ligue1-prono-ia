import { buildLevers, applyLevers, defaultActive } from "./levers.js";
import { computeMarkets } from "./poisson.js";

// Pronostic de l'IA pour un match à venir, contexte connu inclus.
export function predict(match, teams, active) {
  const levers = buildLevers(match, teams);
  const act = active || defaultActive(levers);
  const { lh, la } = applyLevers(match, levers, act);
  return { ...computeMarkets(lh, la), levers, active: act };
}
