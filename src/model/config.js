// Réglages du modèle mesurés sur les saisons passées (scripts/evaluate.py), lus dans season.json.
// Sans données mesurées, on garde les hypothèses d'origine.
export const CFG = { levers: null, live: null };

export function setModelConfig(model) {
  CFG.levers = model?.levers || null;
  CFG.live = model?.live || null;
}
