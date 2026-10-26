import React, { useState } from "react";
import { fr1 } from "../model/narrative.js";

export default function Academie() {
  return (
    <>
      <header className="page-head">
        <h1>L'académie</h1>
        <p className="lead">
          Cinq notions pour lire un pronostic comme un analyste. Chacune se manipule en quelques secondes.
        </p>
      </header>
      <div className="lessons">
        <Lesson n={1} title="60 %, ce n'est pas « sûr »" open>
          <p>
            Une équipe à 60 % de chances de gagner perdra ou fera nul 4 fois sur 10. Le pronostic peut être
            excellent et le résultat décevant : c'est la nature d'une probabilité.
          </p>
          <SixtyPercent />
        </Lesson>

        <Lesson n={2} title="Comment l'IA compte les buts">
          <p>
            L'IA estime combien de buts chaque équipe devrait marquer en moyenne (les « buts attendus »).
            Une loi mathématique, la loi de Poisson, transforme cette moyenne en chances de marquer 0, 1, 2 buts ou plus.
            On croise ensuite les deux équipes pour obtenir tous les scores possibles.
          </p>
          <PoissonPlay />
        </Lesson>

        <Lesson n={3} title="Une cote n'est pas une probabilité">
          <p>
            Une cote de 2,00 suggère 50 % de chances, mais le bookmaker gonfle légèrement les probabilités
            pour garder une marge. Additionne les trois probabilités d'un match : tu dépasses toujours 100 %.
            Ce surplus, c'est sa commission.
          </p>
          <OddsConverter />
        </Lesson>

        <Lesson n={4} title="Les séries finissent toujours par s'arrêter">
          <p>
            Une équipe qui gagne 5 matchs d'affilée a souvent aussi eu de la réussite : poteaux rentrants,
            arrêts décisifs, adversaires réduits à 10. Cette part de chance ne se répète pas forcément. C'est la
            « régression vers la moyenne » : sur la durée, les résultats se rapprochent du vrai niveau de l'équipe.
          </p>
          <p>
            C'est pour ça que l'IA donne plus de poids à la saison entière qu'aux 5 derniers matchs, et qu'elle
            se méfie des débuts de saison, quand elle a encore peu de données.
          </p>
        </Lesson>

        <Lesson n={5} title="Garder le contrôle">
          <p>
            Comprendre un match ne permet pas de gagner à coup sûr. Personne ne bat durablement le marché
            sans méthode, discipline et une bonne dose de chance. Si tu paries de l'argent :
          </p>
          <ul className="plain">
            <li>fixe un budget mensuel que tu peux perdre sans conséquence, et ne le dépasse pas ;</li>
            <li>ne cherche jamais à « te refaire » après une perte ;</li>
            <li>utilise les limites de dépôt proposées par les sites agréés par l'ANJ.</li>
          </ul>
          <p>
            Si le jeu devient un souci, pour toi ou un proche : Joueurs Info Service, 09 74 75 13 13,
            ou joueurs-info-service.fr.
          </p>
        </Lesson>
      </div>
    </>
  );
}

function Lesson({ n, title, open, children }) {
  return (
    <details className="lesson" open={open}>
      <summary><span className="lesson-n">{n}</span>{title}</summary>
      <div className="lesson-body">{children}</div>
    </details>
  );
}

function SixtyPercent() {
  const [runs, setRuns] = useState(null);
  const play = () => setRuns(Array.from({ length: 20 }, () => Math.random() < 0.6));
  const wins = runs ? runs.filter(Boolean).length : 0;
  return (
    <div className="play">
      <button className="btn" onClick={play}>{runs ? "Rejouer 20 matchs" : "Simuler 20 matchs à 60 %"}</button>
      {runs && (
        <>
          <div className="dots" aria-label={`${wins} victoires sur 20`}>
            {runs.map((w, i) => <span key={i} className={w ? "w" : "l"}>{w ? "V" : "×"}</span>)}
          </div>
          <p className="muted">{wins} victoires sur 20. Relance : le total bouge à chaque fois, même avec exactement 60 %.</p>
        </>
      )}
    </div>
  );
}

function PoissonPlay() {
  const [lambda, setLambda] = useState(1.5);
  const probs = Array.from({ length: 6 }, (_, k) => {
    let f = 1;
    for (let i = 2; i <= k; i++) f *= i;
    return (Math.exp(-lambda) * lambda ** k) / f;
  });
  const max = Math.max(...probs);
  return (
    <div className="play">
      <label className="slider">
        Buts attendus : <b>{fr1(lambda)}</b>
        <input type="range" min="0.3" max="3.5" step="0.1" value={lambda}
          onChange={(e) => setLambda(Number(e.target.value))} />
      </label>
      <div className="poisson">
        {probs.map((p, k) => (
          <div key={k}>
            <span className="pv">{Math.round(p * 100)}%</span>
            <i style={{ height: `${(p / max) * 100}%` }} />
            <span>{k === 5 ? "5+" : k} but{k > 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        Avec {fr1(lambda)} but attendu, l'équipe reste muette dans {Math.round(probs[0] * 100)} % des matchs.
      </p>
    </div>
  );
}

function OddsConverter() {
  const [odds, setOdds] = useState(["2,10", "3,40", "3,60"]);
  const vals = odds.map((o) => parseFloat(o.replace(",", ".")));
  const valid = vals.every((v) => v > 1);
  const raw = valid ? vals.map((v) => 1 / v) : null;
  const sum = raw ? raw.reduce((s, x) => s + x, 0) : 0;
  return (
    <div className="play">
      <div className="odds">
        {["Domicile", "Nul", "Extérieur"].map((l, k) => (
          <label key={l}>
            {l}
            <input inputMode="decimal" value={odds[k]} aria-invalid={!(vals[k] > 1)}
              onChange={(e) => setOdds(odds.map((o, i) => (i === k ? e.target.value : o)))} />
          </label>
        ))}
      </div>
      {valid ? (
        <>
          <p>
            Probabilités affichées : {raw.map((x) => `${Math.round(x * 100)} %`).join(" + ")} ={" "}
            <b>{Math.round(sum * 100)} %</b>
          </p>
          <p>
            Marge du bookmaker : <b>{fr1((sum - 1) * 100)} %</b>. Probabilités réelles estimées :{" "}
            {raw.map((x) => `${Math.round((x / sum) * 100)} %`).join(" / ")}.
          </p>
        </>
      ) : (
        <p className="error">Chaque cote doit être un nombre supérieur à 1, par exemple 2,10.</p>
      )}
    </div>
  );
}
