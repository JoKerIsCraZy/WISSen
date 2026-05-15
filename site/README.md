# WISSen Website

Public docs + landing site, deployed to **GitHub Pages** at <https://jokeriscrazy.github.io/wissen/>.

Built with [Astro Starlight](https://starlight.astro.build) and deployed via GitHub Actions.

## Lokal entwickeln

```bash
cd site
npm install
npm run dev    # http://localhost:4321
```

## Build

```bash
npm run build  # → site/dist/
npm run preview
```

## Deploy

Auto-Deploy bei jedem Push auf `main` der `site/**` ändert, über
[`.github/workflows/deploy-site.yml`](../.github/workflows/deploy-site.yml).

### GitHub Pages-Einstellungen einmalig setzen

Im Repo: **Settings → Pages → Source: GitHub Actions**

Erster Push triggert den Workflow automatisch. Site ist dann live unter
<https://jokeriscrazy.github.io/wissen/>.

### Astro-Konfiguration

- `site: 'https://jokeriscrazy.github.io'`
- `base: '/wissen'` — alle internen Links werden mit `/wissen/`-Prefix gerendert

## Struktur

```
site/
├── astro.config.mjs        # Starlight-Config + Sidebar
├── public/
│   ├── favicon.ico
│   └── pwa-demo/           # Statische PWA-Demo mit eigenem Mock-API-Layer
└── src/
    ├── assets/logo.png
    ├── components/         # AnimatedHero, FeatureGrid, Showcase, …
    ├── content/docs/       # alle Doku-Seiten als .md/.mdx
    └── styles/custom.css   # Brand-Tokens + Polish
```
