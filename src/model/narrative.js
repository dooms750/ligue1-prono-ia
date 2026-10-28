// Transforme les chiffres en phrases claires.
// Ici, des modèles de phrases ; plus tard, un LLM pourra rédiger à partir des mêmes faits.

import { outcomeOf } from "./poisson.js";

export const fr1 = (x) => x.toFixed(1).replace(".", ",");
export const ord = (n) => (n === 1 ? "1er" : `${n}e`);
export const pct = (x) => `${Math.round(x * 100)} %`;

export function teamStats(t) {
  const n = Math.max(t.played, 1);
  return {
    gpg: t.gf / n,
    gapg: t.ga / n,
    wins5: t.form.filter((f) => f === "V").length,
    losses5: t.form.filter((f) => f === "D").length,
    rating: t.att - t.def,
  };
}

export function formSentence(t) {
  const s = teamStats(t);
  if (s.wins5 >= 4) return `En grande forme : ${s.wins5} victoires sur les 5 derniers matchs.`;
  if (s.losses5 >= 3) return `En difficulté : ${s.losses5} défaites sur les 5 derniers matchs.`;
  if (s.wins5 === 0) return `Toujours sans victoire sur les 5 derniers matchs.`;
  return `Forme irrégulière : ${s.wins5} victoire${s.wins5 > 1 ? "s" : ""} sur les 5 derniers matchs.`;
}

// Les raisons principales du pronostic, de la plus importante à la moins importante.
export function reasons(match, teams, active) {
  const H = teams[match.home], A = teams[match.away];
  const sh = teamStats(H), sa = teamStats(A);
  const out = [];

  const gap = sh.rating - sa.rating;
  if (Math.abs(gap) > 0.25) {
    const fav = gap > 0 ? H : A;
    out.push({ w: Math.abs(gap) * 3, text: `Sur l'ensemble de la saison, ${fav.name} est nettement plus solide (${ord(fav.rank)} du classement, ${fr1(teamStats(fav).gpg)} but par match).` });
  } else {
    out.push({ w: 0.6, text: `Les deux équipes ont un niveau proche cette saison (${ord(H.rank)} contre ${ord(A.rank)}).` });
  }

  out.push({ w: 0.7, text: `${H.name} joue à domicile : en Ligue 1, cela vaut en moyenne un quart de but de plus.` });

  if (sh.gpg > 1.6 && sa.gapg > 1.3)
    out.push({ w: 1.1, text: `L'attaque de ${H.name} (${fr1(sh.gpg)} but par match) affronte une défense qui encaisse beaucoup (${fr1(sa.gapg)}).` });
  if (sa.gpg > 1.6 && sh.gapg > 1.3)
    out.push({ w: 1.1, text: `${A.name} marque beaucoup (${fr1(sa.gpg)} par match) et ${H.name} encaisse ${fr1(sh.gapg)} but par match : danger.` });

  if (sh.wins5 >= 4 || sh.losses5 >= 3) out.push({ w: 0.5, text: `${H.name} : ${formSentence(H).toLowerCase()}` });
  if (sa.wins5 >= 4 || sa.losses5 >= 3) out.push({ w: 0.5, text: `${A.name} : ${formSentence(A).toLowerCase()}` });

  if (active?.butH) out.push({ w: 1, text: `${H.name} est privé de son meilleur buteur.` });
  if (active?.butA) out.push({ w: 1, text: `${A.name} est privé de son meilleur buteur.` });
  const cup = (t, g) => (g ? `${t.name} a joué ${g.day} en ${g.competition} : de la fatigue et sans doute de la rotation.` : `${t.name} sort d'un match de coupe en semaine.`);
  if (active?.eurH) out.push({ w: 0.5, text: cup(H, match.ctx?.cupH) });
  if (active?.eurA) out.push({ w: 0.5, text: cup(A, match.ctx?.cupA) });
  if (active?.pluie) out.push({ w: 0.4, text: `La météo annoncée devrait freiner le jeu et le nombre de buts.` });

  return out.sort((x, y) => y.w - x.w).slice(0, 4).map((r) => r.text);
}

// Débrief d'un match joué : verdict + ce qui a fait basculer la rencontre.
export function debrief(m, teams) {
  const H = teams[m.home], A = teams[m.away];
  const o = outcomeOf(m.hg, m.ag);
  const p = m.pred.p;
  const pick = p.indexOf(Math.max(...p));
  const pActual = p[o];
  const right = pick === o;
  const lines = [];

  if (m.redH || m.redA) {
    const who = m.redH && m.redA ? "les deux équipes" : m.redH ? H.name : A.name;
    const when = typeof (m.redH || m.redA) === "number" && (m.redH || m.redA) > 1 ? ` à la ${m.redH || m.redA}e minute` : "";
    lines.push(`Le tournant : un carton rouge pour ${who}${when}. Jouer à 10 change complètement l'équilibre, et aucun modèle d'avant-match ne peut l'anticiper.`);
  }
  if (m.htH != null) {
    const htO = outcomeOf(m.htH, m.htA);
    if (htO !== o && htO !== 1 && o !== 1)
      lines.push(`Renversement : ${m.htH}-${m.htA} à la pause, ${m.hg}-${m.ag} au coup de sifflet final.`);
    else if (htO === 1 && o !== 1)
      lines.push(`Tout s'est joué en seconde période (${m.htH}-${m.htA} à la pause).`);
  }
  if (m.goals && m.goals.length) {
    const late = m.goals.filter(([, min]) => min >= 80);
    if (late.length && Math.abs(m.hg - m.ag) <= 1)
      lines.push(`Un but dans les dix dernières minutes (${late[late.length - 1][1]}e) a décidé du résultat.`);
  }

  let verdict;
  if (right && pActual >= 0.55) verdict = "Logique respectée : le favori a fait le travail.";
  else if (right) verdict = "Bien vu par l'IA, dans un match qui restait ouvert.";
  else if (pActual < 0.2) verdict = `Grosse surprise : l'IA ne donnait que ${pct(pActual)} de chances à ce résultat.`;
  else verdict = `Raté, mais pas absurde : ce résultat avait ${pct(pActual)} de chances selon l'IA.`;

  if (Math.abs(m.hg - m.ag) >= 3)
    lines.push(`Une victoire large, avec ${Math.abs(m.hg - m.ag)} buts d'écart : ${o === 0 ? H.name : A.name} a dominé de bout en bout.`);
  if (m.xgH != null && m.xgA != null) {
    const xo = Math.abs(m.xgH - m.xgA) < 0.35 ? 1 : m.xgH > m.xgA ? 0 : 2;
    const sot = m.sotH != null;
    const xgTxt = sot ? `${m.sotH} tirs cadrés contre ${m.sotA}` : `${fr1(m.xgH)} contre ${fr1(m.xgA)}`;
    if (xo !== o && xo !== 1)
      lines.push(`${sot ? "Les tirs cadrés" : "Les xG"} racontent une autre histoire (${xgTxt}) : ${xo === 0 ? H.name : A.name} s'est créé les meilleures occasions, mais ${o === 1 ? "n'a pas su gagner" : "a perdu"}. Le score n'a pas suivi le jeu.`);
    else if (xo !== 1 && xo === o)
      lines.push(`Victoire méritée ${sot ? "au vu des occasions" : "aux xG"} (${xgTxt}) : les occasions et le score vont dans le même sens.`);
    else if (xo === 1 && o !== 1)
      lines.push(`${sot ? "Côté occasions" : "Aux xG"}, le match était équilibré (${xgTxt}) : l'efficacité devant le but a fait la différence.`);
  }
  if (!lines.length) {
    lines.push(
      o === 1
        ? "Un match équilibré, sans événement majeur, qui finit logiquement à égalité."
        : `${o === 0 ? H.name : A.name} a fait la différence sans fait de jeu marquant dans les données.`,
    );
  }
  const scorers = (m.scorers || []).filter((g) => g.player).map((g) =>
    `${g.player.split(" ").slice(-1)[0]} ${g.half === 1 && g.min > 45 ? `45+${g.min - 45}` : g.min}'${g.kind === "penalty" ? " (pen.)" : g.kind === "csc" ? " (csc)" : ""}`);
  return { right, pActual, pick, outcome: o, verdict, lines, surprise: 1 - pActual, scorers };
}
