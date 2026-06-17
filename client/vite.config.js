import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function apiOrigin() {
  const fromEnv = process.env.VITE_API_TARGET?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const portFile = path.join(__dirname, '..', '.api-port');
  try {
    const port = fs.readFileSync(portFile, 'utf8').trim();
    if (/^\d+$/.test(port)) return `http://localhost:${port}`;
  } catch {
    /* no file yet */
  }

  return 'http://localhost:3001';
}

const target = apiOrigin();

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/upload': { target, changeOrigin: true },
      '/health': { target, changeOrigin: true },
    },
  },
});
