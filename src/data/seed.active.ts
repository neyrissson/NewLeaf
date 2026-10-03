// Stub for the pre-loaded company list: empty in git, so a fresh clone of the public source starts with
// no companies. vite.config.js swaps this file for the private src/data/seed.private.ts when making a real
// (non-demo, non-blank) build on a machine that has it.
import type { Company } from './jobs';

const seed: Company[] = [];
export default seed;
