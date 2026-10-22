import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: ['..'] } }, // the manual pages live in ../manual
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
