# Lucide : les pronos de Ligue 1 expliqués

Lucide est une application web qui décrypte chaque match de Ligue 1 **avant** et **après** le coup d'envoi.
L'objectif n'est pas de donner des « tuyaux », mais de faire comprendre un pronostic : d'où viennent
les probabilités, ce qui les fait bouger, et si l'IA a vraiment raison sur la durée.

> L'app utilise les **vrais matchs de Ligue 1** (résultats, xG, cotes et matchs de la semaine,
> source [football-data.co.uk](https://www.football-data.co.uk/francem.php)), mis à jour automatiquement deux fois par jour.

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

## Les données

| Fichier | Contenu |
| --- | --- |
| `data/raw/F1_<saison>.csv` | Résultats de la saison : score, mi-temps, xG, cartons rouges, cotes moyennes |
| `data/raw/F1_<saison précédente>.csv` | Saison précédente, pour que l'IA ne parte pas de zéro en début de saison |
| `data/raw/fixtures_F1.csv` | Matchs de la semaine avec leurs cotes (heures converties à l'heure de Paris) |
| `public/data/season.json` | Ce que lit l'app : forces des équipes, pronos, classement, bilan |

Mettre à jour à la main :

```bash
npm run data:fetch   # télécharge les fichiers dans data/raw/
npm run data:real    # recalcule les pronostics
```

Le workflow GitHub fait la même chose tout seul deux fois par jour (6 h 17 et 17 h 17 UTC), enregistre les
nouvelles données dans le dépôt puis republie le site. Si le téléchargement échoue, il garde les derniers fichiers.

Ce que la source ne fournit pas : les absences et la météo. Dans l'app, ces facteurs sont à activer avec les leviers.
La saison simulée reste disponible avec `npm run data:demo`.

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
