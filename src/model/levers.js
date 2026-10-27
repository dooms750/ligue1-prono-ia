// Les « leviers » : 5 facteurs qui déplacent les buts attendus, donc les probabilités.
// Chacun s'allume tout seul quand les données le détectent (presse, calendrier, météo),
// avec sa source. L'utilisateur peut toujours le couper ou l'allumer.

export function buildLevers(match, teams) {
  const H = teams[match.home].name;
  const A = teams[match.away].name;
  const c = match.ctx || {};
  const pr = c.press || {};
  const scorer = (side) => pr[side]?.scorer;
  const who = (side) => (scorer(side) ? `${scorer(side).name} (${scorer(side).goals} but${scorer(side).goals > 1 ? "s" : ""})` : "son meilleur buteur");

  const buteur = (side, team, key) => {
    const out = pr[side]?.scorerOut;
    return {
      id: `but${side}`, label: `${team} sans ${who(side)}`,
      on: (c[`abs${side}`] || []).includes("buteur"),
      source: out ? { text: `« ${out.title} »`, by: out.publisher, url: out.url } : null,
      apply: (x) => ({ ...x, [key]: x[key] * 0.86 }),
      why: `Sans son meilleur buteur, ${team} convertit moins ses occasions : environ 14 % de buts attendus en moins.` +
        (out ? ` La presse l'annonce absent (${out.publisher}).` : ""),
    };
  };

  const coupe = (side, team, own, other) => {
    const g = c[`cup${side}`];
    return {
      id: `eur${side}`,
      label: g ? `${team} a joué ${g.day} en ${g.competition}` : `${team} a joué un match de coupe en semaine`,
      on: !!c[`europe${side}`],
      source: g ? { text: `${g.competition}, ${g.home ? "contre" : "à"} ${g.opponent}, ${g.hoursBefore} h avant`, by: "calendrier OneFootball" } : null,
      apply: (x) => ({ ...x, [own]: x[own] * 0.95, [other]: x[other] * 1.03 }),
      why: `Un match de coupe quelques jours avant coûte de la fraîcheur et pousse souvent l'entraîneur à faire tourner : environ 5 % de buts en moins pour ${team}.`,
    };
  };

  const w = c.meteo;
  const levers = [
    buteur("H", H, "lh"),
    buteur("A", A, "la"),
    coupe("H", H, "lh", "la"),
    coupe("A", A, "la", "lh"),
    {
      id: "pluie",
      label: w ? `Pluie ou vent pendant le match (risque ${Math.round(Math.max(w.pRain, w.pWind) * 100)} %)` : "Pluie ou vent pendant le match",
      on: c.weather === "pluie" || c.weather === "vent",
      source: w && !w.roof ? { text: `${Math.round(w.pRain * 100)} % de risque de pluie, rafales vers ${w.gust} km/h, confiance ${w.confidenceLabel}`, by: "ECMWF et Météo-France" } : null,
      apply: (x) => ({ lh: x.lh * 0.9, la: x.la * 0.9 }),
      why: "Un terrain lourd ou du vent font baisser le nombre de buts : le nul et le « moins de 2,5 buts » gagnent du terrain.",
    },
  ];
  return levers;
}

export function applyLevers(match, levers, active) {
  return levers.reduce((x, l) => (active[l.id] ? l.apply(x) : x), { lh: match.lh, la: match.la });
}

export function defaultActive(levers) {
  return Object.fromEntries(levers.filter((l) => l.on).map((l) => [l.id, true]));
}
