import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel sets VERCEL=1 automatically during its builds.
// On Vercel/Netlify we serve from the root; on GitHub Pages we serve from /atithi/.
const isRootHost = !!process.env.VERCEL || !!process.env.NETLIFY;

// Honour PORT env var (e.g. when the dev server is launched by a parent
// process that wants to assign a specific port). Fall back to Vite's default.
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig({
  plugins: [react()],
  base: isRootHost ? '/' : '/atithi/',
  server: port ? { port, strictPort: true } : undefined,
});
