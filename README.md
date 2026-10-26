# Lucide : les pronos de Ligue 1 expliqués

Lucide est une application web qui décrypte chaque match de Ligue 1 **avant** et **après** le coup d'envoi.
L'objectif n'est pas de donner des « tuyaux », mais de faire comprendre un pronostic : d'où viennent
les probabilités, ce qui les fait bouger, et si l'IA a vraiment raison sur la durée.

> Version actuelle : prototype avec une saison **simulée** (les 18 clubs de la Ligue 1 2026-27, mais des
> résultats, absences et cotes fictifs). Voir plus bas pour brancher de vraies données.

## Ce que fait l'app

| Écran | Rôle |
| --- | --- |
| **Journée** | L'affiche de la journée dans un stade 3D de nuit, puis les 9 matchs avec le pronostic de l'IA. |
| **Stories** | L'avant-match en 7 écrans, avec une caméra qui se déplace dans le stade : affiche, forme, attaque contre défense, contexte, verdict de l'IA, raisons, ton avis. |
| **Fiche match** | Le stade 3D (à faire tourner au doigt) où chaque issue est une colonne de lumière et où le ballon roule vers le favori, les **leviers** (absences, Europe, météo, enjeu) qui font monter ou descendre les colonnes, la grille des scores, la comparaison avec les cotes. |
| **Débrief** | Prono contre réalité pour chaque match, avec ce qui a fait basculer la rencontre (carton rouge, renversement, but tardif). |
| **Bilan** | Le bilan public de l'IA : taux de réussite, score de Brier contre le marché, calibration. Chaque prono est calculé avec les seuls matchs joués avant. |
| **Académie** | 5 notions manipulables : ce que veut dire 60 %, la loi de Poisson, la marge des bookmakers, la régression vers la moyenne, le jeu responsable. |

## La scène 3D

`src/components/Stadium3D.jsx` construit le stade avec [Three.js](https://threejs.org) : pelouse et lignes dessinées
dans une texture, tribunes avec les supporters aux couleurs des deux clubs, projecteurs, colonnes de probabilités
animées et ballon. La scène se met en pause hors de l'écran, respecte le réglage « réduire les animations »
et bascule sur la barre de probabilités en 2D si l'appareil ne gère pas WebGL.

## Démarrer

Il faut [Node.js](https://nodejs.org) 20+ et Python 3.10+.

```bash
npm install
npm run dev          # ouvre http://localhost:5173
```

Pour régénérer la saison de démonstration :

```bash
pip install -r requirements.txt
npm run data:demo
```

Tests du moteur de probabilités : `npm test`.

## Le modèle

Fichier `scripts/build_data.py` :

1. Chaque équipe a une **force d'attaque** et une **faiblesse défensive**, plus un avantage du terrain commun.
2. Buts attendus à domicile = `exp(moyenne + domicile + attaque_dom + défense_ext)` (et l'inverse pour l'extérieur).
3. Les paramètres sont estimés par maximum de vraisemblance (loi de Poisson), en donnant plus de poids aux matchs récents
   et en ramenant les équipes vers la moyenne quand il y a peu de matchs.
4. La grille des scores donne toutes les probabilités : 1N2, plus de 2,5 buts, les deux équipes marquent, score exact.

Les leviers de contexte (`src/model/levers.js`) ajustent ensuite les buts attendus avec des effets simples et lisibles.
Ce sont des ordres de grandeur à affiner avec des données réelles.

## Brancher de vraies données

Le script accepte les fichiers CSV de [football-data.co.uk](https://www.football-data.co.uk/francem.php) (Ligue 1 = `F1.csv`) :

```bash
python3 scripts/build_data.py --csv F1.csv --fixtures prochaine_journee.csv
```

`prochaine_journee.csv` contient les colonnes `Date,HomeTeam,AwayTeam` (date au format `AAAA-MM-JJ`).
Vérifie les conditions d'utilisation de chaque source de données avant une mise en ligne publique.

Pistes pour la suite : absences réelles via une API football, xG par match, saison précédente pour démarrer
la nouvelle saison, résumés rédigés par un modèle de langage à partir des mêmes faits, mise à jour automatique
avec une GitHub Action programmée.

## Publier sur GitHub Pages

1. Crée un dépôt public sur GitHub, puis pousse ce dossier :
   ```bash
   git remote add origin https://github.com/<ton-compte>/ligue1-prono-ia.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages → Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` teste, construit et publie l'app à chaque push.
   Elle sera en ligne sur `https://<ton-compte>.github.io/ligue1-prono-ia/`.

## Jeu responsable

Lucide explique des probabilités, elle ne garantit aucun résultat. Les jeux d'argent sont interdits aux mineurs.
Besoin d'aide : Joueurs Info Service, 09 74 75 13 13 (appel non surtaxé).

## Licence

MIT
