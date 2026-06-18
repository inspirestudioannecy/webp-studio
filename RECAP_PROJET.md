# Récapitulatif du Projet : Inspire Convert (Inspire Conversion)

Ce document récapitule les objectifs, les choix techniques, les fonctionnalités implémentées et les perspectives d'évolution du projet **Inspire Convert**.

---

## 🎯 Quel est le but de ce projet ?

L'objectif est de fournir à l'**équipe de création / design d'Inspire** un outil ultra-rapide, illimité et accessible de partout pour convertir leurs images de création au format **WebP** (et optionnellement **AVIF**) pour le web.

---

## 💡 Pourquoi cette architecture "Local-First" ?

Plutôt que d'utiliser des convertisseurs en ligne payants ou lents (qui requièrent d'uploader les images sur un serveur distant), nous avons choisi une approche **100 % client-side** (dans le navigateur) :
1. **Confidentialité absolue** : Les créations des clients ne transitent par aucun réseau. Tout reste en mémoire locale sur l'ordinateur de l'utilisateur.
2. **Vitesse instantanée** : Pas de temps de transfert réseau (upload/download). La conversion de gros fichiers (même de 50 Mo) est immédiate.
3. **Zéro coût & Zéro limite** : L'outil ne coûte rien à héberger (simple fichier statique) et ne souffre d'aucune limite de poids ou de nombre de fichiers.
4. **Utilisable partout** : L'outil fonctionne en double-cliquant sur le fichier HTML, même sans connexion internet (hors-ligne).

---

## ✨ Fonctionnalités Implémentées

### 1. Interface Premium & Minimaliste
- **Design moderne** : Thème clair par défaut avec un fond blanc quadrillé ("blanc carreau"), bordures grises épurées ("béton card simple rounded") et accents vert émeraude d'Inspire.
- **Thème Sombre** : Bascule en mode sombre via un bouton dédié dans l'en-tête, avec mémorisation du choix.
- **UX Épurée** : Les contrôles complexes sont masqués par défaut sous un volet déroulant *Options avancées*. Le volet principal se concentre sur le dépôt et les presets.

### 2. Import Simplifié (Glisser-Déposer & Clic)
- **Zone active cliquable** : Cliquer n'importe où dans le cadre permet de sélectionner ses images.
- **Dossiers et sous-dossiers** : Glisser un dossier complet conserve l'arborescence des fichiers lors de l'export final.
- **Support HEIC (iPhone)** : Les photos d'iPhone au format `.heic` sont décodées localement à la volée en mémoire pour être converties.

### 3. File de traitement progressive & Concurrence
- **Promise Pool** : Traitement de plusieurs conversions en parallèle (réglable de 1 à 8 images simultanées) pour tirer parti des processeurs multi-cœurs.
- **Galerie en cartes** : Joli aperçu visuel de chaque fichier avec son état (prêt, en cours, terminé, erreur), sa taille finale et son gain de poids.
- **Téléchargement Groupé** : Un bouton permet d'exporter d'un coup toutes les images traitées dans une archive `.zip`.

### 4. Comparateur Visuel Pro (Avant / Après)
- Une visionneuse interactive permet de comparer pixel par pixel l'image originale et sa version compressée grâce à :
  - Un curseur de balayage vertical ajustable.
  - Un outil de Zoom (de 25% à 400%).
  - Un outil de Pan (déplacement à la souris/au pavé tactile).

---

## 🛠️ Options de Simplification du Code

Actuellement, tout le code réside dans un seul fichier `index.html` pour faciliter le double-clic hors-ligne. Pour simplifier la maintenance future, nous prévoyons deux chemins :
1. **Découpage classique** : Séparer le CSS dans `style.css` et le JavaScript dans `app.js` pour alléger le fichier HTML.
2. **Migration vers Vite.js** : Utiliser un build-tool moderne pour automatiser la compilation, la minification et le rechargement en direct lors du développement.

---

## 🚀 Options de Déploiement Gratuit

Pour que l'équipe créative puisse utiliser l'outil sans installer de fichiers locaux :
- **Netlify / Vercel** : Déploiement en glissant-déposant le dossier sur l'interface web (gratuit, adresse personnalisable).
- **GitHub Pages** : Hébergement automatique et gratuit lié directement au dépôt Git du projet.
