import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Use vitePreprocess so <script lang="ts"> works out of the box.
  preprocess: vitePreprocess(),

  kit: {
    // Static SPA build: every route falls back to index.html for the
    // client-side router. Output goes to ../web/v2 so Express can serve it
    // alongside the legacy frontend at web/ and web/mobile/.
    // Build output goes to ./dist at project root. Legacy /mobile/ + /assets/
    // + /floorplans/ stay in web/. Express serves dist/ first (SPA at root),
    // then falls through to web/ for legacy paths.
    adapter: adapter({
      pages: '../dist',
      assets: '../dist',
      fallback: 'index.html',
      precompress: false,
      strict: false
    }),

    // V2 is now the default frontend at site root '/'. Legacy V1
    // (web/index.html + app.js + style.css) was removed; web/mobile/
    // legacy PWA stays at /mobile/. Assets resolve under '/' directly.
    paths: {
      base: ''
    }

    // CSP-Hinweis (siehe src/server.js helmet-Block):
    // adapter-static prerendert index.html zur Build-Zeit, deshalb wird hier
    // KEIN kit.csp gesetzt — eine 'auto'/'nonce'-Mode würde zur Build-Zeit ein
    // statisches Nonce einbacken, das der Express-Helmet-Header nicht kennt.
    // Pfad zu nonce-basiertem CSP siehe TODO in src/server.js (Migration auf
    // csp.mode='hash' oder adapter-node).
  }
};

export default config;
