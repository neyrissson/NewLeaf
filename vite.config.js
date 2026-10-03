import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const here = fileURLToPath(new URL('.', import.meta.url))
const PRIVATE_SEED = `${here}src/data/seed.private.ts`

// The real target-company list lives in src/data/seed.private.ts (gitignored: it holds personal notes).
// src/data/jobs.ts imports ./seed.active, which in git is an empty stub. For a real build on a machine
// that has the private file, the stub is swapped for it here. Demo and blank (shareable) builds never
// resolve the private file at all, so it can't end up in their bundle however tree-shaking behaves.
const privateSeed = (mode) => {
  const env = { ...loadEnv(mode, here, 'VITE_'), ...process.env }
  const shareable = env.VITE_DEMO_MODE === 'true' || env.VITE_BLANK_MODE === 'true'
  return {
    name: 'newleaf-private-seed',
    enforce: 'pre',
    resolveId(source) {
      if (!shareable && /(^|\/)seed\.active$/.test(source) && fs.existsSync(PRIVATE_SEED)) return PRIVATE_SEED
      return null
    },
  }
}

// electron/geoData.js is CommonJS (main.js require()s it) but the UI imports it too. Production builds
// convert it; the dev server serves it as-is and the browser rejects it ("no export named 'default'"),
// which left `npm run dev` on a blank page. Wrap it as an ES module for the dev server only.
const geoDataForDevServer = {
  name: 'newleaf-geodata-esm',
  apply: 'serve',
  transform(code, id) {
    if (!/electron\/geoData\.js$/.test(id.split('?')[0])) return null
    return `const module = { exports: {} };\n${code}\nexport default module.exports;`
  },
}

// Using .js config to avoid iCloud Drive EPERM issue when Vite bundles a .ts config
export default defineConfig(({ mode }) => ({
  plugins: [react(), privateSeed(mode), geoDataForDevServer],
  base: './', // CRITICAL: This ensures asset paths are relative, so Electron can load them from file://
  cacheDir: '/tmp/vite-jobradar-cache',
}))
