// Les « leviers » : facteurs de contexte qui déplacent les buts attendus, donc les probabilités.
// Chacun s'allume tout seul quand les données le détectent (presse, calendrier, météo), avec sa source.
//
// Leurs effets ne sont plus supposés : scripts/evaluate.py les mesure sur les saisons passées et
// vérifie, dans l'ordre chronologique, qu'ils améliorent les pronostics des matchs suivants.
// Un levier qui n'améliore rien reste visible pour comprendre, mais il est écarté : il ne
// s'allume plus et ne change pas le pronostic.
import { CFG } from "./config.js";

// Hypothèses d'origine, utilisées tant qu'aucune mesure n'est disponible.
const HYP = {
  buteur: { own: 0.86, other: 1 },
  coupe: { own: 0.95, other: 1.03 },
  meteo: { own: 0.9, other: 0.9 },
};

const pctTxt = (f) => `${f < 1 ? "−" : "+"}${Math.round(Math.abs(1 - f) * 100)} %`;

function effect(kind) {
  const m = CFG.levers?.[kind];
  if (!m) return { ...HYP[kind], measured: false, kept: true };
  return { own: m.own, other: m.other, measured: true, kept: m.kept, n: m.n, nTest: m.nTest, gain: m.gain, raw: m.measuredOwn };
}

function verdict(kind, e) {
  if (!e.measured) return " (hypothèse, pas encore mesurée)";
  if (!e.kept) {
    return ` Écarté : sur ${e.n} matchs passés concernés, l'effet mesuré (${pctTxt(e.raw ?? 1)} de buts) n'améliore pas les pronostics des matchs suivants.`;
  }
  return ` Effet mesuré sur ${e.n} matchs passés, et validé hors échantillon sur ${e.nTest} matchs.`;
}

export function buildLevers(match, teams) {
  const H = teams[match.home].name;
  const A = teams[match.away].name;
  const c = match.ctx || {};
  const pr = c.press || {};
  const scorer = (side) => pr[side]?.scorer;
  const who = (side) => (scorer(side) ? `${scorer(side).name} (${scorer(side).goals} but${scorer(side).goals > 1 ? "s" : ""})` : "son meilleur buteur");
  const eB = effect("buteur"), eC = effect("coupe"), eM = effect("meteo");

  const buteur = (side, team, key, other) => {
    const out = pr[side]?.scorerOut;
    return {
      id: `but${side}`, kind: "buteur", label: `${team} sans ${who(side)}`,
      detected: (c[`abs${side}`] || []).includes("buteur"),
      kept: eB.kept, measured: eB.measured,
      source: out ? { text: `« ${out.title} »`, by: out.publisher, url: out.url } : null,
      apply: (x) => ({ ...x, [key]: x[key] * eB.own, [other]: x[other] * eB.other }),
      why: `Sans son meilleur buteur, ${team} marque moins : ${pctTxt(eB.own)} de buts attendus.` +
        verdict("buteur", eB) + (out ? ` La presse l'annonce absent (${out.publisher}).` : ""),
    };
  };

  const coupe = (side, team, own, other) => {
    const g = c[`cup${side}`];
    return {
      id: `eur${side}`, kind: "coupe",
      label: g ? `${team} a joué ${g.day} en ${g.competition}` : `${team} a joué un match de coupe en semaine`,
      detected: !!c[`europe${side}`],
      kept: eC.kept, measured: eC.measured,
      source: g ? { text: `${g.competition}, ${g.home ? "contre" : "à"} ${g.opponent}, ${g.hoursBefore} h avant`, by: "calendrier OneFootball" } : null,
      apply: (x) => ({ ...x, [own]: x[own] * eC.own, [other]: x[other] * eC.other }),
      why: (eC.measured && eC.own > 1
        ? `Surprise des données : les clubs qui ont joué une coupe en semaine marquent plutôt plus que prévu (${pctTxt(eC.own)}). Ce sont souvent les meilleurs clubs, que le modèle sous-estime un peu ; la fatigue, elle, ne se voit pas.`
        : `Un match de coupe quelques jours avant coûte de la fraîcheur et pousse à faire tourner : ${pctTxt(eC.own)} de buts pour ${team}.`) + verdict("coupe", eC),
    };
  };

  const w = c.meteo;
  const levers = [
    buteur("H", H, "lh", "la"),
    buteur("A", A, "la", "lh"),
    coupe("H", H, "lh", "la"),
    coupe("A", A, "la", "lh"),
    {
      id: "pluie", kind: "meteo",
      label: w ? `Pluie ou vent pendant le match (risque ${Math.round(Math.max(w.pRain, w.pWind) * 100)} %)` : "Pluie ou vent pendant le match",
      detected: c.weather === "pluie" || c.weather === "vent",
      kept: eM.kept, measured: eM.measured,
      source: w && !w.roof ? { text: `${Math.round(w.pRain * 100)} % de risque de pluie, rafales vers ${w.gust} km/h, confiance ${w.confidenceLabel}`, by: "ECMWF et Météo-France" } : null,
      apply: (x) => ({ lh: x.lh * eM.own, la: x.la * eM.own }),
      why: `Un terrain lourd ou du vent : ${pctTxt(eM.own)} de buts pour les deux équipes.` + verdict("meteo", eM),
    },
  ];
  // Un levier écarté peut être détecté, mais il ne s'allume pas tout seul.
  return levers.map((l) => ({ ...l, on: l.detected && l.kept }));
}

export function applyLevers(match, levers, active) {
  return levers.reduce((x, l) => (active[l.id] && l.kept ? l.apply(x) : x), { lh: match.lh, la: match.la });
}

export function defaultActive(levers) {
  return Object.fromEntries(levers.filter((l) => l.on).map((l) => [l.id, true]));
}
