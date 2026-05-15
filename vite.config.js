import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel sets VERCEL=1 automatically during its builds.
// On Vercel/Netlify we serve from the root; on GitHub Pages we serve from /atithi/.
const isRootHost = !!process.env.VERCEL || !!process.env.NETLIFY;

export default defineConfig({
  plugins: [react()],
  base: isRootHost ? '/' : '/atithi/',
});
