# Dispomed / Dr Kevin

# Tableau de Bord de Disponibilité des Produits Pharmaceutiques

## Concept
Ce projet vise à offrir une meilleure transparence et information en matière de santé publique, particulièrement concernant la disponibilité des médicaments. En proposant des données claires et accessibles, nous contribuons à l'amélioration de l'information et de la prise de décision en santé publique.

## Aperçu
Ce projet est un tableau de bord visuel qui suit la disponibilité des produits pharmaceutiques au fil du temps. Il fournit une représentation claire et codée par couleur de l'état des produits sur plusieurs années, permettant une identification facile des tendances d'approvisionnement et des pénuries potentielles.

![screenshot](./public/images/screenshot_project.png)

## Fonctionnalités
- **Visualisation temporelle**: Le tableau de bord affiche la disponibilité des produits de 2021 à 2024, répartie par mois.
- **Code couleur**:
  - Rouge: Indique une rupture d'approvisionnement ou une pénurie importante
  - Jaune: Représente une tension dans la chaîne d'approvisionnement
- **Recherche de produits**: Les utilisateurs peuvent rechercher des produits spécifiques à l'aide de la barre de recherche en haut du tableau de bord.

## Représentation des Données
- Chaque ligne représente un produit pharmaceutique différent.
- Les colonnes sont divisées par année et par mois.
- Les cellules sont codées par couleur pour indiquer l'état de chaque produit pour un mois donné.
- Les chiffres dans les cellules peuvent représenter des niveaux de stock spécifiques ou des codes d'état.

## Utilisation
1. Parcourez la liste des produits sur le côté gauche du tableau de bord.
2. Utilisez la barre de recherche pour trouver rapidement des produits spécifiques.

## Détails Techniques
Ce tableau de bord est construit en utilisant D3.js pour la visualisation.

## Améliorations Futures
- Infobulles interactives pour des informations détaillées au survol
- Options de filtrage par catégorie de produit ou par statut
- Fonctionnalité d'exportation de données
- Analyse de données historiques et prévisions d'approvisionnement

## Configuration de Développement

### Configuration de la Base de Données
Après avoir cloné ou migré le projet, suivez ces étapes pour configurer la base de données:

1. Assurez-vous que PostgreSQL est installé et fonctionne sur votre machine.
2. Créez une nouvelle base de données nommée `dispomed`:
   ```
   createdb dispomed
   ```
3. Créez un fichier `.env` à la racine du projet avec le contenu suivant:
   ```
   DATABASE_URL=postgres://localhost:5432/dispomed
   ```
   Remarque: Ajustez la chaîne de connexion si votre configuration PostgreSQL nécessite un nom d'utilisateur/mot de passe.
4. Initialisez le schéma de la base de données:
   ```
   npm run init-db
   ```

### Exécution de l'Application
1. Installez les dépendances:
   ```
   npm install
   ```
2. Démarrez l'application:
   ```
   npm start
   ```
3. Accédez à l'application à l'adresse http://localhost:3000