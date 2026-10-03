// Renderer-side mirror of the scraper's geo filter (electron/main.js isGeoExcludedNode).
// Uses the shared city→state→country resolver so "california" authorizes all CA cities
// and unlisted foreign cities resolve to their country and get excluded.
// @ts-ignore — CommonJS module shared with the Electron main process
import geoData from '../../electron/geoData.js';
import { CANADA_PROVINCES } from './geoConfig';

// Must stay identical to GEO_INTL_REGEX / GEO_US_REGEX in electron/main.js (the scan-time filter),
// or the feed and the scraper disagree about which jobs are out of area.
const INTL = /\b(china|india|uk|united kingdom|england|scotland|wales|britain|germany|france|japan|brazil|austria|spain|italy|dubai|singapore|wuhan|beijing|shanghai|korea|seoul|australia|sydney|ireland|dublin|emea|apac|europe|switzerland|basel|zurich|london|netherlands|amsterdam|belgium|taiwan|hong kong|israel|sweden|denmark|portugal|poland|russia|mexico|argentina|chile|colombia|peru|south africa|egypt|nigeria|kenya|new zealand|auckland|melbourne|brisbane|perth|tokyo|osaka|kyoto|milan|rome|paris|lyon|berlin|munich|frankfurt|hamburg|madrid|barcelona|lisbon|vienna|geneva|stockholm|copenhagen|oslo|helsinki|warsaw|prague|budapest|athens|istanbul|abu dhabi|tel aviv|mumbai|delhi|bangalore|bengaluru|gurugram|gurgaon|noida|pune|kolkata|ahmedabad|chandigarh|kochi|coimbatore|jaipur|indore|nagpur|karachi|lahore|dhaka|colombo|hyderabad|chennai|manila|bangkok|kuala lumpur|jakarta|ho chi minh|hanoi|taipei|busan|costa rica|puerto rico|saudi arabia|qatar|johannesburg|cape town)\b/i;
const US = /\b(usa|u\.s\.|united states|california|massachusetts|new jersey|texas|florida|illinois|pennsylvania|north carolina|maryland|georgia|colorado|arizona|minnesota|michigan|ohio|indiana|tennessee|missouri|wisconsin|virginia|connecticut|oregon|utah|san francisco|south san francisco|boston|seattle|san diego|chicago|los angeles|austin|cambridge|raleigh|durham|bethesda|princeton|philadelphia|houston|denver|atlanta|miami|dallas|nashville|phoenix|minneapolis|pittsburgh|baltimore|waltham|lexington|emeryville|berkeley|palo alto|menlo park|redwood city|foster city|mountain view|sunnyvale|santa clara|san jose|irvine|thousand oaks|gaithersburg|rockville|tarrytown|new haven|ann arbor|salt lake city|kansas city|st\.? louis|new york|washington)\b/i;
const REMOTE = /\b(remote|télétravail|teletravail|work from home|anywhere|distributed)\b/i;
const HYBRID = /\b(hybrid|hybride)\b/i;
const escapeTerm = (s: string) => s.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CANADA_TERMS = 'canada|montreal|montréal|quebec|québec|ontario|toronto|vancouver|laval|ottawa|calgary|edmonton|winnipeg|halifax|ca-qc';

// Demo build (NewLeaf 2.0): Canada only. Remote must be tied to Canada specifically;
// on-site/hybrid must match one of the explicitly listed Accepted Work Locations —
// no "anywhere in Canada" carve-out, no unresolved-defaults-to-keep fallback.
const isJobLocationExcludedDemo = (text: string, allowedExtra: string[]): boolean => {
  const t = (text || '').toLowerCase();
  const isRemote = REMOTE.test(t);
  const res = geoData.resolveLocation(t);
  const isCanada = (res && res.country === 'canada') || new RegExp('\\b(' + CANADA_TERMS + ')\\b', 'i').test(t);
  if (isRemote) return !isCanada;
  const extra = (allowedExtra || []).map(escapeTerm).filter(Boolean);
  if (extra.length === 0) return true; // nothing listed yet -> nothing on-site qualifies
  const listedRe = new RegExp('\\b(' + extra.join('|') + ')\\b', 'i');
  return !listedRe.test(t);
};

// Which Canadian provinces count as "home" for on-site/hybrid roles — same default
// (all of them) and same semantics as electron/main.js's getCanadaHomeTerms/provincesAllowed.
// Full names only (length > 2): 2-letter codes collide with ordinary words and other
// countries' codes ("ON" in "On-site", "QC" in "QC Analyst", "NL" = Netherlands); ambiguous
// city names are left to the resolver, which weighs the rest of the location text.
const AMBIGUOUS_CA_CITIES = new Set(['victoria', 'hamilton', 'waterloo']);
const getCanadaHomeTerms = (allowedProvinces: string[]): string[] => {
  if (!allowedProvinces || allowedProvinces.length === 0) return [];
  const allowed = new Set(allowedProvinces);
  const provinceTerms = Object.keys(geoData.CA_PROVINCES).filter((k: string) => k.length > 2 && allowed.has(geoData.CA_PROVINCES[k]));
  const cityTerms = Object.keys(geoData.CITY_DB).filter((k: string) => geoData.CITY_DB[k].c === 'canada' && !AMBIGUOUS_CA_CITIES.has(k) && allowed.has(geoData.CITY_DB[k].s));
  // Bare "canada" is only a blanket keep while every province is allowed (see electron/main.js).
  const allProvinces = CANADA_PROVINCES.every(p => allowed.has(p.id));
  return [...(allProvinces ? ['canada'] : []), ...provinceTerms, ...cityTerms, ...(allowed.has('quebec') ? ['ca-qc'] : [])];
};

// True when a job's location text should be filtered OUT under the current allowed list.
export const isJobLocationExcluded = (text: string, allowedExtra: string[], allowedProvinces?: string[]): boolean => {
  if (import.meta.env.VITE_DEMO_MODE === 'true') return isJobLocationExcludedDemo(text, allowedExtra);
  const t = (text || '').toLowerCase();
  if (REMOTE.test(t)) return false;
  const provinces = allowedProvinces ?? CANADA_PROVINCES.map(p => p.id);   // unspecified = all of Canada
  const extra = (allowedExtra || []).map(escapeTerm).filter(Boolean);
  const homeTerms = [...getCanadaHomeTerms(provinces), ...extra].map(escapeTerm).filter(Boolean);
  const homeRe = new RegExp('\\b(' + (homeTerms.length ? homeTerms.join('|') : '(?!)') + ')\\b', 'i');
  if (homeRe.test(t)) return false;

  let res = geoData.resolveLocation(t);
  // "Decatur, IL": a US place written with a state code, which the resolver ignores on purpose (case-sensitive: original text)
  if (!res) { const st = geoData.usStateFromCode(text); if (st) res = { country: 'us', state: st }; }
  if (res) {
    const allowedC = new Set<string>(), allowedS = new Set<string>();
    (allowedExtra || []).forEach(term => {
      const c = geoData.classifyAllowedTerm(term);
      if (c.country) allowedC.add(c.country);
      if (c.state) allowedS.add(c.state);
    });
    // A listing that names Canada next to another country ("United States / Canada") resolves to
    // whichever came first — still judge its Canadian part by province.
    if (res.country === 'canada' || /\bcanada\b/.test(t)) {
      const province = geoData.canadianProvince(t);   // "Vancouver, Canada" → BC
      return province ? !provinces.includes(province) : provinces.length === 0;
    }
    if (res.country && allowedC.has(res.country)) return false;
    if (res.state && allowedS.has(res.state)) return false;
    return true;
  }
  const isIntl = INTL.test(t);
  if (!isIntl && HYBRID.test(t)) return false;
  return isIntl || US.test(t);
};

// Keep the city visible, adding state/country when the posting omitted them.
export const enrichLocation = (raw: string): string => geoData.enrichLocation(raw || '');
