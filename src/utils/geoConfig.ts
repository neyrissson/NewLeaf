// Accepted work locations BEYOND Canada + remote (which are always kept).
// Editable in Settings; stored in localStorage under 'newleaf_geo_allowed'.
// Must mirror GEO_DEFAULT_EXTRA in electron/main.js.
const DEFAULT_GEO_ALLOWED_SEED = [
  // SF Bay Area / California
  'san francisco', 'south san francisco', 'sf bay', 'bay area', 'california',
  'mountain view', 'sunnyvale', 'palo alto', 'menlo park', 'redwood city', 'foster city',
  'santa clara', 'san jose', 'cupertino', 'san mateo', 'emeryville', 'berkeley', 'oakland',
  // United States (whole country accepted) + notable cities kept for display/back-compat
  'united states', 'usa', 'new york', 'boston', 'san diego', 'la jolla', 'carlsbad', 'torrey pines',
  // Spain / Barcelona
  'barcelona', 'spain', 'madrid',
  // UK / Scotland / England
  'uk', 'united kingdom', 'england', 'london', 'cambridge', 'oxford', 'scotland', 'edinburgh', 'glasgow', 'wales', 'britain', 'great britain',
  // Ireland
  'ireland', 'dublin', 'cork', 'galway',
  // Italy
  'italy', 'milan', 'milano', 'rome', 'roma', 'turin', 'bologna'
];

// Demo build (NewLeaf 2.0) starts with an empty list — Canada-only policy, cities
// added by hand in Settings (see isJobLocationExcludedDemo in geoFilter.ts).
export const DEFAULT_GEO_ALLOWED = import.meta.env.VITE_DEMO_MODE === 'true' ? [] : DEFAULT_GEO_ALLOWED_SEED;

export const GEO_ALLOWED_KEY = 'newleaf_geo_allowed';

export const loadGeoAllowed = (): string[] => {
  try {
    const raw = localStorage.getItem(GEO_ALLOWED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch {}
  return DEFAULT_GEO_ALLOWED;
};

// Push the current list to the Electron backend so the scraper's geo filter uses it.
export const pushGeoAllowed = (list?: string[]) => {
  const el = (window as any).electron;
  if (el?.setGeoLocations) {
    try { el.setGeoLocations(list ?? loadGeoAllowed()); } catch {}
  }
};

// Which Canadian provinces count as "home" for ON-SITE/hybrid roles (remote is
// unaffected — any remote role is always kept regardless of province). Must mirror
// the unique values of CA_PROVINCES in electron/geoData.js. Defaults to all of them
// (today's "anywhere in Canada" behavior) — e.g. narrow this temporarily to just
// Ontario/Quebec while working-authorization is province-limited, then widen it back
// once that's no longer a constraint.
export const CANADA_PROVINCES: { id: string; label: string }[] = [
  { id: 'ontario', label: 'Ontario' },
  { id: 'quebec', label: 'Quebec' },
  { id: 'british columbia', label: 'British Columbia' },
  { id: 'alberta', label: 'Alberta' },
  { id: 'manitoba', label: 'Manitoba' },
  { id: 'saskatchewan', label: 'Saskatchewan' },
  { id: 'nova scotia', label: 'Nova Scotia' },
  { id: 'new brunswick', label: 'New Brunswick' },
  { id: 'newfoundland', label: 'Newfoundland and Labrador' },
  { id: 'prince edward island', label: 'Prince Edward Island' },
];

export const PROVINCES_ALLOWED_KEY = 'newleaf_ca_provinces_allowed';

export const loadProvincesAllowed = (): string[] => {
  try {
    const raw = localStorage.getItem(PROVINCES_ALLOWED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch {}
  return CANADA_PROVINCES.map(p => p.id); // default: all provinces (today's behavior)
};

export const pushProvincesAllowed = (list?: string[]) => {
  const el = (window as any).electron;
  if (el?.setProvincesAllowed) {
    try { el.setProvincesAllowed(list ?? loadProvincesAllowed()); } catch {}
  }
};
