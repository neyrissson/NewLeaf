// Aggregator sweep configuration (shared by App and Settings)

// Pseudo-company that holds jobs found by the LinkedIn aggregator sweep
// (companies outside the registry). Never scanned as a regular career page.
export const SWEEP_COMPANY_ID = 'aggregator_linkedin';

// One query per line — editable in Settings (stored in newleaf_sweep_queries)
export const DEFAULT_SWEEP_QUERIES =
  'bioinformatics\ncomputational biology\nmolecular biology scientist\nlife sciences consultant';
