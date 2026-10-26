// Les « leviers » : des facteurs que l'utilisateur active ou désactive
// pour voir comment ils déplacent les buts attendus, donc les probabilités.
// Les effets sont des ordres de grandeur volontairement simples et lisibles.

export function buildLevers(match, teams) {
  const H = teams[match.home].name;
  const A = teams[match.away].name;
  const c = match.ctx || {};
  const rankH = teams[match.home].rank;
  const rankA = teams[match.away].rank;

  const levers = [
    {
      id: "butH", group: H, label: `${H} sans son meilleur buteur`,
      on: (c.absH || []).includes("buteur"),
      apply: (x) => ({ ...x, lh: x.lh * 0.86 }),
      why: `Sans son meilleur buteur, ${H} convertit moins ses occasions : environ 14 % de buts attendus en moins.`,
    },
    {
      id: "gardH", group: H, label: `${H} sans son gardien titulaire`,
      on: (c.absH || []).includes("gardien"),
      apply: (x) => ({ ...x, la: x.la * 1.1 }),
      why: `Un gardien remplaçant laisse passer un peu plus de tirs : ${A} gagne environ 10 % de buts attendus.`,
    },
    {
      id: "defH", group: H, label: `${H} sans un défenseur central`,
      on: (c.absH || []).includes("defenseur"),
      apply: (x) => ({ ...x, la: x.la * 1.06 }),
      why: `Une charnière remaniée, c'est moins d'automatismes : effet réel, mais modeste.`,
    },
    {
      id: "eurH", group: H, label: `${H} a joué en Coupe d'Europe en semaine`,
      on: !!c.europeH,
      apply: (x) => ({ ...x, lh: x.lh * 0.95, la: x.la * 1.03 }),
      why: `La fatigue et la rotation après un match européen coûtent un peu d'intensité à ${H}.`,
    },
    {
      id: "butA", group: A, label: `${A} sans son meilleur buteur`,
      on: (c.absA || []).includes("buteur"),
      apply: (x) => ({ ...x, la: x.la * 0.86 }),
      why: `Sans son meilleur buteur, ${A} perd une bonne partie de sa menace à l'extérieur.`,
    },
    {
      id: "gardA", group: A, label: `${A} sans son gardien titulaire`,
      on: (c.absA || []).includes("gardien"),
      apply: (x) => ({ ...x, lh: x.lh * 1.1 }),
      why: `Avec un gardien remplaçant en face, ${H} a plus de chances de marquer.`,
    },
    {
      id: "defA", group: A, label: `${A} sans un défenseur central`,
      on: (c.absA || []).includes("defenseur"),
      apply: (x) => ({ ...x, lh: x.lh * 1.06 }),
      why: `Une défense remaniée concède un peu plus : petit avantage pour ${H}.`,
    },
    {
      id: "eurA", group: A, label: `${A} a joué en Coupe d'Europe en semaine`,
      on: !!c.europeA,
      apply: (x) => ({ ...x, la: x.la * 0.95, lh: x.lh * 1.03 }),
      why: `Un déplacement après un match européen, c'est souvent des jambes lourdes pour ${A}.`,
    },
    {
      id: "pluie", group: "Conditions", label: "Pluie forte ou vent sur le stade",
      on: c.weather === "pluie" || c.weather === "vent",
      apply: (x) => ({ lh: x.lh * 0.9, la: x.la * 0.9 }),
      why: "Un terrain lourd ou du vent font baisser le nombre de buts : le nul et le « moins de 2,5 buts » gagnent du terrain.",
    },
    {
      id: "maintien", group: "Conditions",
      label: rankA > rankH ? `${A} joue sa survie` : `${H} joue sa survie`,
      on: false,
      apply: (x) => (rankA > rankH ? { ...x, la: x.la * 1.05 } : { ...x, lh: x.lh * 1.05 }),
      why: "L'enjeu pèse, mais moins qu'on l'imagine : les études trouvent un effet faible sur le résultat.",
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
