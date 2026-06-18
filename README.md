# Conversion WebP — Inspire

Deux outils pour convertir beaucoup d'images en WebP :

1. **`index.html`** — convertisseur dans le navigateur, à partager avec l'équipe (aucune installation).
2. **Script Node** (`npm run convert`) — pour HEIC / RAW / gros TIFF et l'automatisation par lots.

## L'outil navigateur (`index.html`)

Ouvrez `index.html` par double-clic (fonctionne **hors-ligne**), ou hébergez ce
fichier unique sur GitHub Pages, Netlify, Cloudflare Pages, SharePoint ou intranet,
puis partagez le lien.

Fonctionnalités :

- glisser-déposer de fichiers **et de dossiers entiers** (sans limite de nombre) ;
- 100 % local : aucune image envoyée sur un serveur, aucun compte ;
- **qualité réglable** (défaut 90 = aucune perte visible, fichier léger) ;
- **mode sans perte** (lossless) — produit du vrai VP8L lossless quand le
  navigateur le supporte (Chrome/Edge) ; un **badge lossless/lossy** indique
  honnêtement, pour chaque image, ce qui a réellement été encodé ;
- **redimensionnement** largeur/hauteur max avec ratio conservé, réduction par
  paliers pour rester net, option « ne jamais agrandir » ;
- **comparaison avant/après** zoomable (curseur de balayage + zoom + pan) pour
  vérifier la qualité ;
- statistiques de gain et **téléchargement de tout en un `.zip`**.

À savoir :

- le navigateur doit savoir lire le format source (OK pour JPEG, PNG, WebP, AVIF,
  SVG, BMP ; GIF animé → image fixe) ;
- conversion et ZIP travaillent en mémoire : pour plusieurs centaines de fichiers
  très lourds, convertir par paquets ;
- sur les photos, le lossless gonfle souvent le fichier autant que l'original —
  préférer la qualité 90 et vérifier avec le comparateur ;
- pour HEIC, RAW, gros TIFF ou l'automatisation, utiliser le script Node ci-dessous.

## Installation

```bash
npm install
```

## Usage equipe

1. Mettez les images dans `input/`.
2. Lancez:

```bash
npm run convert
```

3. Recuperez les fichiers WebP dans `output/`.

Le script garde les sous-dossiers. Exemple:

```text
input/clients/site-a/hero.jpg
output/clients/site-a/hero.webp
```

## Commandes utiles

Convertir un autre dossier:

```bash
npm run convert -- ./mes-images ./webp
```

Forcer la reconversion:

```bash
npm run convert:overwrite
```

Changer la qualite:

```bash
npm run convert -- ./input ./output --quality 85
```

Convertir sans garder les sous-dossiers:

```bash
npm run convert -- ./input ./output --flat
```

## Formats acceptes

`jpg`, `jpeg`, `png`, `gif`, `tif`, `tiff`, `bmp`, `avif`, `heic`, `heif`, `svg`, `webp`.

Par defaut, les metadonnees sont supprimees. Bon pour sites web: fichiers plus legers, moins de donnees inutiles.
