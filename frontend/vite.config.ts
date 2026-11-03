import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: { allow: ['..'] }, // the manual pages live in ../manual
    // Dev only: the app calls the API on its own origin (`/v1`), so forward it to a running local backend.
    // Point VITE_API_PROXY at it (default is run_local.py's port). The Origin header is rewritten so the backend's same-origin check accepts it.
    proxy: (() => {
      const target = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000';
      return { '/v1': { target, changeOrigin: true, headers: { origin: target } } };
    })(),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
