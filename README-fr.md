# dispomed — ruptures et tensions d'approvisionnement des médicaments

Application web qui suit dans le temps la disponibilité des médicaments signalés par
l'ANSM, et met cette information à portée d'un pharmacien en trente secondes au
comptoir : quel est le statut, depuis quand, que dit l'agence, et **par quoi
remplacer**.

*(English version: [README.md](./README.md))*

---

## 1. Périmètre

Ce dépôt contient **l'application seule**. La donnée est produite par un second
dépôt, `incident_scraper`, qui scrute quotidiennement l'ANSM et alimente la base
PostgreSQL `incidents_json`. dispomed ne fait que lire cette base.

Ce qui est suivi : les signalements de rupture et de tension publiés par l'ANSM —
soit très majoritairement des médicaments d'intérêt thérapeutique majeur et des
vaccins (environ 83 % des produits suivis), mais pas uniquement. Le périmètre est
donc défini par **la source**, pas par une liste réglementaire.

Ce qui n'est pas suivi : les dispositifs médicaux, les ruptures locales non
déclarées à l'ANSM, et l'état réel des stocks chez les grossistes — information
qu'aucune source publique ne fournit.

---

## 2. Ce que l'application montre

**Liste principale.** Une ligne par produit, avec une frise temporelle colorée
(rupture, tension, arrêt de commercialisation, disponible) sur 12, 24 mois ou la
totalité de l'historique depuis avril 2021. Filtres par recherche libre, classe
ATC, molécule, vaccins seuls, médicaments essentiels seuls.

**Marqueurs de ligne.** `H` réserve hospitalière, `V` vaccin, `EU` incident
également suivi au niveau européen (EMA). Volontairement en gris, hors du langage
couleur des statuts.

**Aperçu au survol.** Une fiche produit en réduction : fil d'Ariane ATC/DCI,
bandeau de statut, substituts disponibles, situation ANSM ville et hôpital, date
de remise à disposition annoncée, codes CIS concernés.

**Fiche produit** (en overlay depuis la liste, ou en page autonome) :

- statut courant et décompte des substituts sans signalement ;
- codes CIS concernés, en accordéon ;
- **substituts officiels** — les autres spécialités du même groupe générique BDPM,
  avec leur disponibilité du jour ;
- situation ANSM détaillée, issue des fiches publiées par l'agence ;
- jours de disponibilité par année et score de disponibilité ;
- ventes en nombre de boîtes par présentation (source Open Medic) ;
- historique complet des incidents en frise.

---

## 3. Deux règles de conception qui expliquent beaucoup de choix

**« Aucun signalement » n'est pas « disponible ».** Le statut d'un substitut est
déterminé en cascade : fichier officiel des ruptures BDPM d'abord, nos incidents
ensuite, fiche ANSM en repli, et à défaut « aucun signalement ». Cette dernière
valeur signifie que rien n'est déclaré — pas qu'il y a du stock chez le grossiste.
Le libellé le dit explicitement plutôt que de laisser croire à une garantie.

**Substitution de droit uniquement.** La carte des substituts n'affiche que les
membres du groupe générique du répertoire ANSM, où la substitution est légalement
possible. Un indice de similitude thérapeutique existe dans la base
(`substitution.equivalences_therapeutiques`) mais **n'est pas affiché** : il n'a
pas été évalué, et proposer une alternative hors groupe générique sortirait du
champ de compétence du pharmacien.

---

## 4. Architecture

```
Navigateur ──► Express (app.js) ──► fichiers SQL (sql/) ──► PostgreSQL incidents_json
   │                                                              │
   └── D3.js (public/js/) : liste, frises, overlay produit        └── alimentée par incident_scraper
```

| Élément | Rôle |
|---------|------|
| `app.js` | serveur Express, une route par question posée à la base |
| `sql/` | **toutes** les requêtes, en fichiers `.sql` — jamais de SQL dans le JS |
| `views/` | gabarits Pug (`chart`, `product`, `substitutions`, `layout`, erreurs) |
| `public/js/draw.js` | liste principale, frises, aperçu au survol, overlay |
| `public/js/draw_product_page.js` | fiche produit |
| `public/js/00_fetch_data.js`, `01_store_data.js` | accès API et état client |
| `public/stylesheets/common.css`, `product.css` | styles (pas de framework CSS) |
| `database/connect_db.js` | pool PostgreSQL, `dbQuery()`, `loadSqlFile()` |
| `deploy_prod.sh` | déploiement base + code vers Heroku |

Les fichiers SQL sont relus à chaque requête : modifier une requête ne demande pas
de redémarrer le serveur.

### Points d'entrée API

| Route | Ce qu'elle sert |
|-------|-----------------|
| `/api/incidents` | liste principale, filtres `monthsToShow`, `product`, `atcClass`, `molecule`, `vaccinesOnly`, `essentialsOnly` |
| `/api/incidents/product/:id` | incidents d'un produit |
| `/api/incidents/ATCClasses` | classes ATC présentes |
| `/api/search` | recherche produit/molécule hors fenêtre temporelle |
| `/api/substitutes/:productId` | substituts officiels + disponibilité |
| `/api/substitutes-counts` | décomptes pour tous les produits (préchargé par la liste) |
| `/api/ansm-info`, `/api/ansm-info/all` | fiches ANSM par CIS |
| `/api/ema-incidents`, `/api/ema-active-cis` | incidents européens |
| `/api/sales-by-cis`, `/api/sales-years` | ventes Open Medic |

---

## 5. Données lues

Base `incidents_json`, schéma par schéma :

| Schéma | Tables lues | Contenu |
|--------|-------------|---------|
| `public` | `produits`, `incidents`, `molecules`, `produits_molecules`, `classe_atc`, `product_sales`, `ansm_info` | cœur applicatif |
| `dbpm` | `cis_bdpm`, `cis_gener_bdpm`, `cis_cip_dispo_spec` | référentiel BDPM : dénominations, groupes génériques, ruptures officielles |
| `incidents_ema` | `incidents`, `french_translations`, `cis_mappings` | incidents européens traduits |
| `substitution` | `equivalences_therapeutiques` | indice non validé, page héritée `/substitutions/:cis` |

Colonnes de `produits` portant les marqueurs : `reserve_hospitaliere` (issue des
conditions de prescription BDPM) et `essentiel` (liste des médicaments essentiels
de la DGS, rapprochée par ATC).

---

## 6. Installation locale

Prérequis : Node 20, PostgreSQL 16 ou plus, et une base `incidents_json` alimentée
par `incident_scraper`.

```bash
npm install
echo "DATABASE_URL=postgres://localhost:5432/incidents_json" > .env
npm start          # http://localhost:3000
npm test           # Jest
```

---

## 7. Déploiement

```bash
./deploy_prod.sh
```

Le script dumpe la base locale, la restaure sur Heroku, **vérifie que les données
sont bien arrivées**, puis propose de pousser le code. Chaque étape destructrice
demande confirmation.

**La base part toujours avant le code.** Une requête qui lit une colonne nouvelle
suppose que cette colonne existe déjà en production ; un `git push heroku` isolé a
cassé la prod deux fois pour cette raison.

Le dump est volontairement maigre — la production ne reçoit que ce que
l'application interroge. Détail des exclusions et procédure complète dans
`incident_scraper/README-fr.md`.

---

## 8. Sources

- **ANSM** — [Disponibilité des produits de santé](https://ansm.sante.fr/disponibilites-des-produits-de-sante/medicaments), scrape quotidien
- **BDPM** — [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr/), référentiel et fichier officiel des ruptures
- **Open Medic / Medic'AM** — Assurance Maladie, ventes en ville et rattachement ATC
- **EMA** — [rapport de pénuries](https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/medicine-shortages), mis à jour deux fois par jour
- **DGS** — liste des médicaments essentiels, actualisée chaque année en juin
