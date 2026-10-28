# Lucide : les pronos de Ligue 1 expliqués

Lucide est une application web qui décrypte chaque match de Ligue 1 **avant** et **après** le coup d'envoi.
L'objectif n'est pas de donner des « tuyaux », mais de faire comprendre un pronostic : d'où viennent
les probabilités, ce qui les fait bouger, et si l'IA a vraiment raison sur la durée.

> L'app utilise les **vrais matchs de Ligue 1**, collectés sur [OneFootball](https://onefootball.com/fr/competition/ligue-1-23)
> (résultats, buteurs, cartons, tirs, compos, matchs à venir) et dans la **presse spécialisée française** agrégée par
> OneFootball (blessures, suspensions, retours). Mise à jour automatique deux fois par jour.

## Ce que fait l'app

| Écran | Rôle |
| --- | --- |
| **Journée** | L'affiche de la journée dans un stade 3D de nuit, puis les 9 matchs avec le pronostic de l'IA. |
| **Stories** | L'avant-match en 7 écrans, avec une caméra qui se déplace dans le stade : affiche, forme, attaque contre défense, contexte, verdict de l'IA, raisons, ton avis. |
| **Fiche match** | Le stade 3D (à faire tourner au doigt) où chaque issue est une colonne de lumière et où le ballon roule vers le favori, les **5 leviers** (meilleur buteur absent pour chaque équipe, match de coupe en semaine pour chaque équipe, pluie ou vent), allumés automatiquement avec leur source, qui font monter ou descendre les colonnes, la grille des scores, la comparaison avec les cotes. |
| **Débrief** | Prono contre réalité pour chaque match, avec ce qui a fait basculer la rencontre (carton rouge, renversement, but tardif). |
| **Bilan** | Le bilan public de l'IA : taux de réussite, score de Brier contre le marché, calibration. Chaque prono est calculé avec les seuls matchs joués avant. |
| **Académie** | 5 notions manipulables : ce que veut dire 60 %, la loi de Poisson, la marge des bookmakers, la régression vers la moyenne, le jeu responsable. |

## Le direct

Pendant les matchs, l'app lit le tableau des scores public d'ESPN toutes les 30 secondes, directement depuis le
téléphone (`src/lib/live.js`) : score, minute, buts (avec le temps additionnel, par exemple 45'+2') et cartons rouges.
Rien n'est téléchargé en dehors des créneaux de match (de 20 minutes avant à 2 h 40 après le coup d'envoi).

- **Accueil** : un bandeau « En direct » avec les matchs en cours ; dans le programme, l'heure laisse place au score et à la minute.
- **Fiche du match** : le score et la minute dans le bandeau, et des **probabilités en direct** (`src/model/liveProbs.js`) :
  on part du score actuel et on ajoute les buts encore possibles sur le temps restant, avec la même loi de Poisson
  qu'avant le match, en tenant compte des cartons rouges (−28 % de buts pour l'équipe à 10, +25 % pour l'adversaire).
  Les colonnes du stade 3D suivent. La chronologie des buts et cartons rouges s'affiche dessous.

Les résultats définitifs restent ceux de OneFootball : pendant les créneaux de match, GitHub fait une collecte légère
toutes les 20 minutes (seulement les matchs en cours ou terminés depuis peu), pour qu'ils entrent vite dans le débrief.

## L'animation de lancement

À chaque ouverture, `src/components/Intro.jsx` joue une séquence d'environ 3 secondes : les quatre projecteurs
s'allument un par un et croisent leurs faisceaux, les supporters mitraillent les tribunes, les lignes du terrain se
tracent en perspective, la caméra monte au-dessus de la pelouse et le rond central devient le logo, puis l'affiche
de la journée balaie l'écran aux couleurs des deux clubs. L'animation couvre le chargement des données, se passe d'un
toucher et se réduit à un simple fondu si le réglage « réduire les animations » est actif.

## Installer l'app sur un téléphone

Lucide est une application web installable (PWA) : icône sur l'écran d'accueil, ouverture en plein écran,
consultation hors connexion des derniers pronos téléchargés.

- **iPhone (Safari)** : ouvrir le site, toucher le bouton Partager, puis « Sur l'écran d'accueil », puis « Ajouter ».
- **Android (Chrome)** : ouvrir le site, menu ⋮, puis « Installer l'application ».

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

Les 5 leviers de contexte (`src/model/levers.js`) ajustent ensuite les buts attendus avec des effets simples et lisibles :

| Levier | Effet | Détecté par |
| --- | --- | --- |
| Sans son meilleur buteur (une par équipe) | −14 % de buts pour l'équipe | Titres de presse récents qui citent le joueur avec un mot d'absence |
| Match de coupe en semaine (une par équipe) | −5 % de buts pour l'équipe, +3 % pour l'adversaire | Calendrier OneFootball du club : Ligue des champions, Ligue Europa, Ligue Conférence ou Coupe de France joué entre 12 h et 4,5 jours avant |
| Pluie ou vent | −10 % de buts pour les deux équipes | Prévision d'ensemble ECMWF : plus de 50 % de risque |

Les leviers sans source fiable (gardien, défenseur, enjeu du maintien) ont été retirés : leur effet était faible et
rien ne permettait de les activer automatiquement.

## Les données

| Fichier | Contenu | Source |
| --- | --- | --- |
| `data/raw/onefootball_<saison>.json` | Chaque match : date, score, buteurs avec la minute, penaltys, csc, cartons rouges, tirs, tirs cadrés, possession, titulaires. Les matchs des deux prochaines semaines. Les derniers articles de chaque club (titre, média, heure, lien). | OneFootball et presse spécialisée |
| `data/raw/F1_<saison>.csv`, `fixtures_F1.csv` | Cotes moyennes du marché, pour comparer l'IA aux bookmakers | football-data.co.uk |
| `data/raw/F1_<saison précédente>.csv` | Saison précédente, pour que l'IA ne parte pas de zéro | football-data.co.uk |
| `public/data/season.json` | Ce que lit l'app : forces des équipes, pronos, classement, bilan, contexte presse | calculé |

**La presse dans le modèle.** `scripts/onefootball_source.py` lit les titres récents de chaque club et repère ceux qui
parlent d'absence (blessé, forfait, suspendu, incertain…). Si un titre cite le meilleur buteur du club (calculé à partir
des buteurs de la saison) sans annonce de retour plus récente, le levier « sans son meilleur buteur » s'allume, avec le
titre et le média affichés pour que chacun puisse vérifier. L'app ne reprend que les titres, avec un lien vers l'article.

**La météo du match, de J-7 à J-2.** `scripts/fetch_weather.py` publie une prévision pour chaque match dès 7 jours
avant le coup d'envoi, puis l'affine à chaque mise à jour. Elle s'appuie sur les 51 scénarios de la prévision
d'ensemble ECMWF (la part des scénarios qui annoncent plus de 1,5 mm de pluie pendant le match, ou des rafales de plus
de 55 km/h, donne le risque) et sur Météo-France (AROME / ARPEGE) pour le ciel et la température à moins de 4 jours,
le tout via [Open-Meteo](https://open-meteo.com). L'**indice de confiance** (0 à 100) combine l'accord des scénarios
et l'échéance : à 7 jours, il plafonne autour de 60 ; à 2 jours, il peut dépasser 90. L'historique de chaque prévision
est conservé pour voir comment elle évolue. Si le risque de pluie ou de vent dépasse 50 %, le levier météo s'allume
et il pleut dans le stade 3D. Le stade Pierre-Mauroy (Lille), couvert, n'est pas concerné.

**Le score à la pause.** OneFootball note le temps additionnel de la 1re mi-temps comme « 47' ». La mi-temps de chaque
but est donc déduite de l'ordre des événements de la page (un « 47' » qui précède les changements de la 46e minute
est encore en 1re mi-temps), et le score à la pause publié par football-data.co.uk fait foi quand il est disponible.

**Les tirs cadrés à la place des xG.** OneFootball ne publie pas d'xG : l'IA apprend des buts et des tirs cadrés
(environ 0,3 but par tir cadré en Ligue 1), un indicateur de la qualité des occasions plus stable que le score seul.

Mettre à jour à la main :

```bash
npm run data:fetch   # collecte OneFootball (matchs, presse) puis les cotes, dans data/raw/
npm run data:real    # recalcule les pronostics
```

Le workflow GitHub fait la même chose tout seul deux fois par jour (6 h 17 et 17 h 17 UTC), enregistre les
nouvelles données dans le dépôt puis republie le site. Si le téléchargement échoue, il garde les derniers fichiers.

La collecte est volontairement lente (une page toutes les 0,8 seconde) et ne recharge que les matchs non terminés.
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
