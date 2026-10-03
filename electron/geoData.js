// Shared geo database + resolver (used by the Node scraper AND the renderer prune).
// CommonJS so electron/main.js can require() it; Vite imports it for the renderer too.
//
// Goal: resolve a free-text location to { country, state } so the user can authorize
// whole states/countries ("california" → every CA city) and unknown foreign cities
// (e.g. "Bengaluru") are reliably classified and excluded.

// Country names / aliases → canonical country key
const COUNTRY_TERMS = {
  'canada': 'canada', 'usa': 'us', 'u.s.': 'us', 'u.s.a': 'us', 'united states': 'us', 'us': 'us',
  'uk': 'uk', 'united kingdom': 'uk', 'england': 'uk', 'scotland': 'uk', 'wales': 'uk', 'britain': 'uk', 'great britain': 'uk', 'northern ireland': 'uk',
  'ireland': 'ireland', 'spain': 'spain', 'italy': 'italy', 'france': 'france', 'germany': 'germany',
  'netherlands': 'netherlands', 'belgium': 'belgium', 'switzerland': 'switzerland', 'austria': 'austria',
  'sweden': 'sweden', 'denmark': 'denmark', 'norway': 'norway', 'finland': 'finland', 'iceland': 'iceland',
  'portugal': 'portugal', 'poland': 'poland', 'czech republic': 'czechia', 'czechia': 'czechia', 'slovakia': 'slovakia',
  'hungary': 'hungary', 'romania': 'romania', 'bulgaria': 'bulgaria', 'greece': 'greece', 'turkey': 'turkey', 'türkiye': 'turkey',
  'russia': 'russia', 'ukraine': 'ukraine', 'belarus': 'belarus', 'serbia': 'serbia', 'croatia': 'croatia',
  'china': 'china', 'india': 'india', 'pakistan': 'pakistan', 'bangladesh': 'bangladesh', 'sri lanka': 'sri lanka', 'nepal': 'nepal',
  'japan': 'japan', 'south korea': 'korea', 'korea': 'korea', 'taiwan': 'taiwan', 'hong kong': 'hong kong',
  'singapore': 'singapore', 'malaysia': 'malaysia', 'indonesia': 'indonesia', 'thailand': 'thailand', 'vietnam': 'vietnam', 'philippines': 'philippines',
  'australia': 'australia', 'new zealand': 'new zealand',
  'brazil': 'brazil', 'mexico': 'mexico', 'argentina': 'argentina', 'chile': 'chile', 'colombia': 'colombia', 'peru': 'peru', 'costa rica': 'costa rica', 'uruguay': 'uruguay',
  'israel': 'israel', 'united arab emirates': 'uae', 'uae': 'uae', 'saudi arabia': 'saudi arabia', 'qatar': 'qatar',
  'egypt': 'egypt', 'south africa': 'south africa', 'nigeria': 'nigeria', 'kenya': 'kenya', 'morocco': 'morocco', 'tunisia': 'tunisia'
};

// US states: abbreviation + full name → canonical full name
const US_STATES = {
  'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas', 'ca': 'california', 'co': 'colorado',
  'ct': 'connecticut', 'de': 'delaware', 'fl': 'florida', 'ga': 'georgia', 'hi': 'hawaii', 'id': 'idaho',
  'il': 'illinois', 'in': 'indiana', 'ia': 'iowa', 'ks': 'kansas', 'ky': 'kentucky', 'la': 'louisiana',
  'me': 'maine', 'md': 'maryland', 'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi',
  'mo': 'missouri', 'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada', 'nh': 'new hampshire', 'nj': 'new jersey',
  'nm': 'new mexico', 'nc': 'north carolina', 'nd': 'north dakota', 'oh': 'ohio', 'ok': 'oklahoma', 'or': 'oregon',
  'pa': 'pennsylvania', 'ri': 'rhode island', 'sc': 'south carolina', 'sd': 'south dakota', 'tn': 'tennessee',
  'tx': 'texas', 'ut': 'utah', 'vt': 'vermont', 'va': 'virginia', 'wa': 'washington', 'wv': 'west virginia',
  'wi': 'wisconsin', 'wy': 'wyoming', 'dc': 'district of columbia',
  'alabama': 'alabama', 'alaska': 'alaska', 'arizona': 'arizona', 'arkansas': 'arkansas', 'california': 'california',
  'colorado': 'colorado', 'connecticut': 'connecticut', 'delaware': 'delaware', 'florida': 'florida', 'georgia': 'georgia',
  'hawaii': 'hawaii', 'idaho': 'idaho', 'illinois': 'illinois', 'indiana': 'indiana', 'iowa': 'iowa', 'kansas': 'kansas',
  'kentucky': 'kentucky', 'louisiana': 'louisiana', 'maine': 'maine', 'maryland': 'maryland', 'massachusetts': 'massachusetts',
  'michigan': 'michigan', 'minnesota': 'minnesota', 'mississippi': 'mississippi', 'missouri': 'missouri', 'montana': 'montana',
  'nebraska': 'nebraska', 'nevada': 'nevada', 'new hampshire': 'new hampshire', 'new jersey': 'new jersey', 'new mexico': 'new mexico', 'new york': 'new york',
  'north carolina': 'north carolina', 'north dakota': 'north dakota', 'ohio': 'ohio', 'oklahoma': 'oklahoma', 'oregon': 'oregon',
  'pennsylvania': 'pennsylvania', 'rhode island': 'rhode island', 'south carolina': 'south carolina', 'south dakota': 'south dakota',
  'tennessee': 'tennessee', 'texas': 'texas', 'utah': 'utah', 'vermont': 'vermont', 'virginia': 'virginia', 'washington': 'washington',
  'west virginia': 'west virginia', 'wisconsin': 'wisconsin', 'wyoming': 'wyoming'
};

// Canadian provinces (always kept — Canada is home)
const CA_PROVINCES = {
  'qc': 'quebec', 'quebec': 'quebec', 'québec': 'quebec', 'on': 'ontario', 'ontario': 'ontario',
  'bc': 'british columbia', 'british columbia': 'british columbia', 'ab': 'alberta', 'alberta': 'alberta',
  'mb': 'manitoba', 'manitoba': 'manitoba', 'sk': 'saskatchewan', 'saskatchewan': 'saskatchewan',
  'ns': 'nova scotia', 'nova scotia': 'nova scotia', 'nb': 'new brunswick', 'new brunswick': 'new brunswick',
  'nl': 'newfoundland', 'newfoundland': 'newfoundland', 'pe': 'prince edward island'
};

// Major job-relevant cities → { c: country, s: state (US/CA only) }.
// Ambiguous names (cambridge, london) are intentionally omitted — they resolve via an
// accompanying state/country token instead.
const CITY_DB = {
  // US — biotech / tech / consulting hubs
  'san francisco': { c: 'us', s: 'california' }, 'south san francisco': { c: 'us', s: 'california' },
  'mountain view': { c: 'us', s: 'california' }, 'sunnyvale': { c: 'us', s: 'california' }, 'palo alto': { c: 'us', s: 'california' },
  'menlo park': { c: 'us', s: 'california' }, 'redwood city': { c: 'us', s: 'california' }, 'foster city': { c: 'us', s: 'california' },
  'santa clara': { c: 'us', s: 'california' }, 'san jose': { c: 'us', s: 'california' }, 'cupertino': { c: 'us', s: 'california' },
  'san mateo': { c: 'us', s: 'california' }, 'emeryville': { c: 'us', s: 'california' }, 'berkeley': { c: 'us', s: 'california' },
  'oakland': { c: 'us', s: 'california' }, 'san diego': { c: 'us', s: 'california' }, 'la jolla': { c: 'us', s: 'california' },
  'carlsbad': { c: 'us', s: 'california' }, 'los angeles': { c: 'us', s: 'california' }, 'irvine': { c: 'us', s: 'california' },
  'thousand oaks': { c: 'us', s: 'california' }, 'sacramento': { c: 'us', s: 'california' }, 'brisbane': { c: 'us', s: 'california' },
  'pleasanton': { c: 'us', s: 'california' }, 'fremont': { c: 'us', s: 'california' }, 'san carlos': { c: 'us', s: 'california' },
  'boston': { c: 'us', s: 'massachusetts' }, 'waltham': { c: 'us', s: 'massachusetts' }, 'lexington': { c: 'us', s: 'massachusetts' },
  'watertown': { c: 'us', s: 'massachusetts' }, 'somerville': { c: 'us', s: 'massachusetts' },
  'new york': { c: 'us', s: 'new york' }, 'new york city': { c: 'us', s: 'new york' }, 'brooklyn': { c: 'us', s: 'new york' },
  'tarrytown': { c: 'us', s: 'new york' }, 'buffalo': { c: 'us', s: 'new york' }, 'rochester': { c: 'us', s: 'new york' },
  'seattle': { c: 'us', s: 'washington' }, 'bothell': { c: 'us', s: 'washington' }, 'redmond': { c: 'us', s: 'washington' },
  'chicago': { c: 'us', s: 'illinois' }, 'austin': { c: 'us', s: 'texas' }, 'houston': { c: 'us', s: 'texas' }, 'dallas': { c: 'us', s: 'texas' },
  'denver': { c: 'us', s: 'colorado' }, 'boulder': { c: 'us', s: 'colorado' }, 'atlanta': { c: 'us', s: 'georgia' },
  'miami': { c: 'us', s: 'florida' }, 'philadelphia': { c: 'us', s: 'pennsylvania' }, 'pittsburgh': { c: 'us', s: 'pennsylvania' },
  'princeton': { c: 'us', s: 'new jersey' }, 'raleigh': { c: 'us', s: 'north carolina' }, 'durham': { c: 'us', s: 'north carolina' },
  'bethesda': { c: 'us', s: 'maryland' }, 'gaithersburg': { c: 'us', s: 'maryland' }, 'rockville': { c: 'us', s: 'maryland' },
  'baltimore': { c: 'us', s: 'maryland' }, 'new haven': { c: 'us', s: 'connecticut' }, 'ann arbor': { c: 'us', s: 'michigan' },
  'minneapolis': { c: 'us', s: 'minnesota' }, 'nashville': { c: 'us', s: 'tennessee' }, 'phoenix': { c: 'us', s: 'arizona' },
  'salt lake city': { c: 'us', s: 'utah' }, 'portland': { c: 'us', s: 'oregon' }, 'washington': { c: 'us', s: 'district of columbia' },
  // Canada
  'montreal': { c: 'canada', s: 'quebec' }, 'montréal': { c: 'canada', s: 'quebec' }, 'laval': { c: 'canada', s: 'quebec' },
  'quebec city': { c: 'canada', s: 'quebec' }, 'gatineau': { c: 'canada', s: 'quebec' }, 'sherbrooke': { c: 'canada', s: 'quebec' },
  'toronto': { c: 'canada', s: 'ontario' }, 'ottawa': { c: 'canada', s: 'ontario' }, 'mississauga': { c: 'canada', s: 'ontario' },
  'hamilton': { c: 'canada', s: 'ontario' }, 'waterloo': { c: 'canada', s: 'ontario' }, 'kitchener': { c: 'canada', s: 'ontario' },
  'vancouver': { c: 'canada', s: 'british columbia' }, 'burnaby': { c: 'canada', s: 'british columbia' }, 'victoria': { c: 'canada', s: 'british columbia' },
  'calgary': { c: 'canada', s: 'alberta' }, 'edmonton': { c: 'canada', s: 'alberta' }, 'winnipeg': { c: 'canada', s: 'manitoba' },
  'halifax': { c: 'canada', s: 'nova scotia' }, 'saskatoon': { c: 'canada', s: 'saskatchewan' },
  // UK / Ireland
  'london': { c: 'uk' }, 'oxford': { c: 'uk' }, 'manchester': { c: 'uk' }, 'birmingham': { c: 'uk' },
  'edinburgh': { c: 'uk' }, 'glasgow': { c: 'uk' }, 'bristol': { c: 'uk' }, 'leeds': { c: 'uk' }, 'stevenage': { c: 'uk' },
  'dublin': { c: 'ireland' }, 'cork': { c: 'ireland' }, 'galway': { c: 'ireland' }, 'limerick': { c: 'ireland' },
  // Europe
  'barcelona': { c: 'spain' }, 'madrid': { c: 'spain' }, 'valencia': { c: 'spain' }, 'sevilla': { c: 'spain' },
  'milan': { c: 'italy' }, 'milano': { c: 'italy' }, 'rome': { c: 'italy' }, 'roma': { c: 'italy' }, 'turin': { c: 'italy' }, 'bologna': { c: 'italy' }, 'siena': { c: 'italy' },
  'paris': { c: 'france' }, 'lyon': { c: 'france' }, 'toulouse': { c: 'france' }, 'grenoble': { c: 'france' }, 'marseille': { c: 'france' },
  'berlin': { c: 'germany' }, 'munich': { c: 'germany' }, 'münchen': { c: 'germany' }, 'frankfurt': { c: 'germany' }, 'hamburg': { c: 'germany' },
  'cologne': { c: 'germany' }, 'stuttgart': { c: 'germany' }, 'heidelberg': { c: 'germany' }, 'kronberg': { c: 'germany' },
  'amsterdam': { c: 'netherlands' }, 'rotterdam': { c: 'netherlands' }, 'utrecht': { c: 'netherlands' }, 'leiden': { c: 'netherlands' },
  'brussels': { c: 'belgium' }, 'ghent': { c: 'belgium' }, 'leuven': { c: 'belgium' }, 'antwerp': { c: 'belgium' },
  'zurich': { c: 'switzerland' }, 'zürich': { c: 'switzerland' }, 'basel': { c: 'switzerland' }, 'geneva': { c: 'switzerland' }, 'lausanne': { c: 'switzerland' },
  'vienna': { c: 'austria' }, 'stockholm': { c: 'sweden' }, 'gothenburg': { c: 'sweden' }, 'copenhagen': { c: 'denmark' },
  'oslo': { c: 'norway' }, 'helsinki': { c: 'finland' }, 'lisbon': { c: 'portugal' }, 'porto': { c: 'portugal' },
  'warsaw': { c: 'poland' }, 'krakow': { c: 'poland' }, 'kraków': { c: 'poland' }, 'wroclaw': { c: 'poland' }, 'gdansk': { c: 'poland' },
  'prague': { c: 'czechia' }, 'budapest': { c: 'hungary' }, 'bucharest': { c: 'romania' }, 'sofia': { c: 'bulgaria' },
  'athens': { c: 'greece' }, 'istanbul': { c: 'turkey' }, 'ankara': { c: 'turkey' },
  // India / South Asia
  'bengaluru': { c: 'india' }, 'bangalore': { c: 'india' }, 'mumbai': { c: 'india' }, 'delhi': { c: 'india' }, 'new delhi': { c: 'india' },
  'gurugram': { c: 'india' }, 'gurgaon': { c: 'india' }, 'noida': { c: 'india' }, 'hyderabad': { c: 'india' }, 'chennai': { c: 'india' },
  'pune': { c: 'india' }, 'kolkata': { c: 'india' }, 'ahmedabad': { c: 'india' }, 'chandigarh': { c: 'india' }, 'kochi': { c: 'india' },
  'coimbatore': { c: 'india' }, 'jaipur': { c: 'india' }, 'indore': { c: 'india' }, 'nagpur': { c: 'india' }, 'thiruvananthapuram': { c: 'india' },
  'karachi': { c: 'pakistan' }, 'lahore': { c: 'pakistan' }, 'islamabad': { c: 'pakistan' }, 'dhaka': { c: 'bangladesh' }, 'colombo': { c: 'sri lanka' },
  // East / SE Asia
  'beijing': { c: 'china' }, 'shanghai': { c: 'china' }, 'shenzhen': { c: 'china' }, 'guangzhou': { c: 'china' }, 'wuhan': { c: 'china' }, 'hangzhou': { c: 'china' },
  'tokyo': { c: 'japan' }, 'osaka': { c: 'japan' }, 'kyoto': { c: 'japan' }, 'seoul': { c: 'korea' }, 'busan': { c: 'korea' },
  'taipei': { c: 'taiwan' }, 'singapore': { c: 'singapore' }, 'kuala lumpur': { c: 'malaysia' }, 'jakarta': { c: 'indonesia' },
  'bangkok': { c: 'thailand' }, 'manila': { c: 'philippines' }, 'ho chi minh city': { c: 'vietnam' }, 'hanoi': { c: 'vietnam' },
  // Oceania
  'sydney': { c: 'australia' }, 'melbourne': { c: 'australia' }, 'brisbane au': { c: 'australia' }, 'perth': { c: 'australia' }, 'auckland': { c: 'new zealand' },
  // LatAm
  'são paulo': { c: 'brazil' }, 'sao paulo': { c: 'brazil' }, 'rio de janeiro': { c: 'brazil' }, 'mexico city': { c: 'mexico' },
  'guadalajara': { c: 'mexico' }, 'monterrey': { c: 'mexico' }, 'buenos aires': { c: 'argentina' }, 'santiago': { c: 'chile' },
  'bogota': { c: 'colombia' }, 'bogotá': { c: 'colombia' }, 'lima': { c: 'peru' }, 'san jose costa rica': { c: 'costa rica' },
  // MEA
  'tel aviv': { c: 'israel' }, 'jerusalem': { c: 'israel' }, 'haifa': { c: 'israel' }, 'dubai': { c: 'uae' }, 'abu dhabi': { c: 'uae' },
  'riyadh': { c: 'saudi arabia' }, 'jeddah': { c: 'saudi arabia' }, 'doha': { c: 'qatar' }, 'cairo': { c: 'egypt' },
  'johannesburg': { c: 'south africa' }, 'cape town': { c: 'south africa' }, 'nairobi': { c: 'kenya' }, 'lagos': { c: 'nigeria' },
  'casablanca': { c: 'morocco' }, 'tunis': { c: 'tunisia' }
};

const wordRe = (terms) => new RegExp('\\b(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i');
const COUNTRY_RE = wordRe(Object.keys(COUNTRY_TERMS).sort((a, b) => b.length - a.length));
const STATE_RE = wordRe(Object.keys(US_STATES).filter(k => k.length > 2).sort((a, b) => b.length - a.length)); // full names only (avoid 'in','or','ca' abbrev false hits in prose)
const PROVINCE_RE = wordRe(Object.keys(CA_PROVINCES).filter(k => k.length > 2));
const CITY_RE = wordRe(Object.keys(CITY_DB).sort((a, b) => b.length - a.length));

// Resolve a location string → { country, state } (state only for US/CA). null if unknown.
// Which Canadian province does this text point to? A written province name wins, otherwise a
// known Canadian city pins it ("Vancouver, Canada" → British Columbia). Used by the province
// filter only — kept out of resolveLocation so display enrichment doesn't start appending the
// province after the country.
const CANADIAN_CITY_RE = wordRe(Object.keys(CITY_DB).filter(k => CITY_DB[k].c === 'canada').sort((a, b) => b.length - a.length));
function canadianProvince(text) {
  const t = (text || '').toLowerCase();
  const pm = t.match(PROVINCE_RE);
  if (pm) return CA_PROVINCES[pm[1].toLowerCase()];
  const cm = t.match(CANADIAN_CITY_RE);
  return cm ? CITY_DB[cm[1].toLowerCase()].s : undefined;
}

// "Decatur, IL": a US place written with a two-letter state code. resolveLocation() ignores bare codes on
// purpose (they collide with ordinary words: "in", "or", "id", "co-op"), so they're recognised here instead,
// under strict conditions: case-sensitive, "City, ST" form, at the END of the text (listings append the
// location after the title), optionally followed by a ZIP code or a "(Hybrid)"-style note, and not right after
// a job-title word ("Medical Director, MD"). Returns the state name, or undefined.
const US_CODE_SET = new Set(Object.keys(US_STATES).filter(k => k.length === 2).map(k => k.toUpperCase()));
const NOT_A_CITY = new Set(['director', 'manager', 'scientist', 'engineer', 'specialist', 'associate', 'analyst', 'lead', 'head',
  'officer', 'consultant', 'physician', 'doctor', 'nurse', 'clinician', 'pharmacist', 'researcher', 'professor', 'technician',
  'coordinator', 'assistant', 'intern', 'fellow', 'president', 'chief', 'counsel', 'advisor', 'architect', 'developer', 'writer']);
const US_CODE_TAIL = /([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ.'’-]{2,}),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:\s*\([^)]*\))?\s*$/;
function usStateFromCode(raw) {
  const m = String(raw || '').match(US_CODE_TAIL);
  if (!m || !US_CODE_SET.has(m[2]) || NOT_A_CITY.has(m[1].toLowerCase())) return undefined;
  return US_STATES[m[2].toLowerCase()];
}

function resolveLocation(text) {
  const t = (text || '').toLowerCase();
  // 1. Explicit country
  const cm = t.match(COUNTRY_RE);
  if (cm) {
    const country = COUNTRY_TERMS[cm[1].toLowerCase()];
    // If US/CA, also try to pin the state
    if (country === 'us') { const sm = t.match(STATE_RE); return { country, state: sm ? US_STATES[sm[1].toLowerCase()] : undefined }; }
    if (country === 'canada') { const pm = t.match(PROVINCE_RE); return { country, state: pm ? CA_PROVINCES[pm[1].toLowerCase()] : undefined }; }
    return { country };
  }
  // 2. US state / CA province (no country word)
  const sm = t.match(STATE_RE); if (sm) return { country: 'us', state: US_STATES[sm[1].toLowerCase()] };
  const pm = t.match(PROVINCE_RE); if (pm) return { country: 'canada', state: CA_PROVINCES[pm[1].toLowerCase()] };
  // 3. Known city
  const cityM = t.match(CITY_RE); if (cityM) { const e = CITY_DB[cityM[1].toLowerCase()]; return { country: e.c, state: e.s }; }
  return null;
}

// Display labels for countries + reverse lookups for the enricher
const COUNTRY_LABEL = {
  us: 'USA', uk: 'UK', canada: 'Canada', ireland: 'Ireland', spain: 'Spain', italy: 'Italy', france: 'France',
  germany: 'Germany', netherlands: 'Netherlands', belgium: 'Belgium', switzerland: 'Switzerland', austria: 'Austria',
  sweden: 'Sweden', denmark: 'Denmark', norway: 'Norway', finland: 'Finland', iceland: 'Iceland', portugal: 'Portugal',
  poland: 'Poland', czechia: 'Czech Republic', slovakia: 'Slovakia', hungary: 'Hungary', romania: 'Romania',
  bulgaria: 'Bulgaria', greece: 'Greece', turkey: 'Turkey', russia: 'Russia', ukraine: 'Ukraine', belarus: 'Belarus',
  serbia: 'Serbia', croatia: 'Croatia', china: 'China', india: 'India', pakistan: 'Pakistan', bangladesh: 'Bangladesh',
  'sri lanka': 'Sri Lanka', nepal: 'Nepal', japan: 'Japan', korea: 'South Korea', taiwan: 'Taiwan', 'hong kong': 'Hong Kong',
  singapore: 'Singapore', malaysia: 'Malaysia', indonesia: 'Indonesia', thailand: 'Thailand', vietnam: 'Vietnam',
  philippines: 'Philippines', australia: 'Australia', 'new zealand': 'New Zealand', brazil: 'Brazil', mexico: 'Mexico',
  argentina: 'Argentina', chile: 'Chile', colombia: 'Colombia', peru: 'Peru', 'costa rica': 'Costa Rica', uruguay: 'Uruguay',
  israel: 'Israel', uae: 'UAE', 'saudi arabia': 'Saudi Arabia', qatar: 'Qatar', egypt: 'Egypt', 'south africa': 'South Africa',
  nigeria: 'Nigeria', kenya: 'Kenya', morocco: 'Morocco', tunisia: 'Tunisia'
};
// state canonical → abbreviation (for "already contains state" checks)
const STATE_ABBR = {};
for (const [k, v] of Object.entries(US_STATES)) { if (k.length === 2) STATE_ABBR[v] = k; }
// country → list of aliases (to detect if the raw string already names the country)
const COUNTRY_ALIASES = {};
for (const [term, country] of Object.entries(COUNTRY_TERMS)) { (COUNTRY_ALIASES[country] = COUNTRY_ALIASES[country] || []).push(term); }
const titleCase = (s) => s.replace(/\b\w/g, c => c.toUpperCase());

// Keep the city visible, and append state + country when the posting didn't include them.
// e.g. "Bengaluru" → "Bengaluru, India"; "Mountain View" → "Mountain View, California, USA".
function enrichLocation(raw) {
  const s = (raw || '').trim();
  if (!s || /\b(remote|anywhere|distributed|t[ée]l[ée]travail|work from home)\b/i.test(s)) return s;
  const res = resolveLocation(s);
  if (!res) return s;
  const low = s.toLowerCase();
  let out = s;
  if (res.state) {
    const abbr = STATE_ABBR[res.state];
    const hasState = low.includes(res.state) || (abbr && new RegExp('\\b' + abbr + '\\b', 'i').test(low));
    if (!hasState) out += ', ' + titleCase(res.state);
  }
  const label = COUNTRY_LABEL[res.country] || res.country;
  const aliases = (COUNTRY_ALIASES[res.country] || []).concat(label.toLowerCase());
  const hasCountry = aliases.some(a => new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(low));
  if (!hasCountry) out += ', ' + label;
  return out;
}

// Classify a user-authorized term as a country and/or a state (for state/country-level allow).
function classifyAllowedTerm(term) {
  const t = String(term || '').trim().toLowerCase();
  const out = {};
  if (COUNTRY_TERMS[t]) out.country = COUNTRY_TERMS[t];
  if (US_STATES[t] && t.length > 2) out.state = US_STATES[t];
  if (CA_PROVINCES[t]) out.state = CA_PROVINCES[t];
  return out;
}

module.exports = { COUNTRY_TERMS, US_STATES, CA_PROVINCES, CITY_DB, resolveLocation, usStateFromCode, canadianProvince, classifyAllowedTerm, enrichLocation, COUNTRY_LABEL };
