import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Proxy API calls to the existing Express server during dev so the
      // SvelteKit dashboard can talk to the real backend without CORS pain.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
