// Pre-scoring filters (free, app-side) that decide which jobs are worth sending to Haiku.
//  - NEGATIVE filter: drop obvious wrong-function roles by TITLE.
//  - POSITIVE filter: a job's DESCRIPTION must contain ≥1 relevance keyword to be scored.
// Both lists are editable in Settings. Jobs that don't qualify aren't erased — they go
// to a reviewable "Filtered out" section and can still be scored manually.
//
// Bilingual: every built-in English term has its French counterpart (keywordsFr.ts), and matching
// ignores accents, so French and English postings are judged alike.

import { isLikelyJobTitle, titleNamesARole } from './jobTitleFilter';
import { isJobLocationExcluded } from './geoFilter';
import { foldText } from './textFold';
import { FR_NEGATIVE, FR_POSITIVE, withFrench } from './keywordsFr';

export const NEGATIVE_KEY = 'newleaf_negative_filters';
export const POSITIVE_KEY = 'newleaf_positive_filters';

// Obvious wrong FUNCTIONS (matched against the job title). Deliberately excludes
// sales / account-exec / field-sales / social-media, which in biotech are often
// scientific/technical roles worth letting the AI judge.
const EN_NEGATIVE = [
  // Support / service
  'customer service', 'customer success', 'help desk', 'helpdesk', 'technical support', 'desktop support',
  // HR / recruiting
  'recruiter', 'talent acquisition', 'human resources', 'hr generalist', 'hr business partner', 'payroll', 'benefits administrator',
  // Finance-clerical
  'accounts payable', 'accounts receivable', 'bookkeeper', 'staff accountant',
  // Admin
  'receptionist', 'executive assistant', 'administrative assistant', 'office manager', 'office coordinator',
  // Ops / trades
  'warehouse', 'forklift', 'machine operator', 'production operator', 'assembler', 'maintenance technician', 'janitor', 'custodian', 'security guard', 'housekeeping',
  // Clinical care
  'registered nurse', 'nurse practitioner', 'phlebotomist', 'medical assistant', 'pharmacy technician', 'patient care',
  // Legal / facilities
  'paralegal', 'facilities'
];

// Relevance keywords (matched against the job description). Covers science + your
// business-side interests (consulting / strategy / VC). Broad on purpose — trim in Settings.
const EN_POSITIVE = [
  'life science', 'life sciences', 'biology', 'biological', 'biologist', 'biotech', 'biotechnology',
  'genetics', 'genetic', 'genomic', 'genomics', 'molecular', 'cellular', 'dna', 'rna', 'protein', 'proteomics',
  'epigenetic', 'epigenetics', 'epigenomic', 'epigenomics', 'chromatin', 'sequencing', 'ngs', 'crispr', 'gene', 'genome',
  'bioinformatics', 'bioinformatic', 'computational', 'python', 'machine learning', 'deep learning', 'llm', 'ai',
  // AI / AI-safety
  'ai safety', 'ai alignment', 'alignment', 'red team', 'red-teaming', 'red teaming', 'rlhf', 'interpretability',
  'frontier model', 'frontier ai', 'responsible ai', 'trust and safety', 'model evaluation', 'safety research', 'agentic',
  'data science', 'data scientist', 'scientist', 'scientific', 'research', 'laboratory', 'assay',
  'immunology', 'oncology', 'neuroscience', 'microbiology', 'biochemistry', 'biophysics', 'chemistry', 'chemist',
  'drug', 'therapeutic', 'therapeutics', 'pharma', 'pharmaceutical', 'clinical', 'preclinical', 'translational',
  'consultant', 'consulting', 'strategy', 'strategic', 'venture', 'business development'
];

export const DEFAULT_NEGATIVE = withFrench(EN_NEGATIVE, FR_NEGATIVE);
export const DEFAULT_POSITIVE = withFrench(EN_POSITIVE, FR_POSITIVE);

// Saved lists predate the French terms. Once per list, add the French counterpart of every term she
// still has: terms she removed stay removed, and a list she emptied (filter switched off) stays empty.
// A list that was never saved just uses the (already bilingual) defaults.
const BILINGUAL_FLAG = 'newleaf_fr_terms_added:';
const addFrenchToSavedList = (key: string, map: Record<string, string[]>) => {
  try {
    if (localStorage.getItem(BILINGUAL_FLAG + key)) return;
    localStorage.setItem(BILINGUAL_FLAG + key, '1');   // flag first: a failure below must not retry forever
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved) && saved.length > 0) localStorage.setItem(key, JSON.stringify(withFrench(saved, map)));
  } catch {}
};

const loadList = (key: string, fallback: string[], frenchMap: Record<string, string[]>): string[] => {
  addFrenchToSavedList(key, frenchMap);
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) return a; }
  } catch {}
  return fallback;
};
export const loadNegative = () => loadList(NEGATIVE_KEY, DEFAULT_NEGATIVE, FR_NEGATIVE);
export const loadPositive = () => loadList(POSITIVE_KEY, DEFAULT_POSITIVE, FR_POSITIVE);

// Terms are folded (accents off) to match the folded text they're tested against — see getFilterReason.
const escapeTerm = (s: string) => foldText(s).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const buildMatcher = (list: string[]): RegExp | null => {
  const terms = (list || []).map(escapeTerm).filter(Boolean);
  if (terms.length === 0) return null;
  return new RegExp('\\b(' + terms.join('|') + ')\\b', 'i');
};

interface FilterJob { title?: string; description?: string; forcedOk?: boolean; location?: string; dateDiscovered?: string; link?: string }

// Accepted work locations (Settings → Accepted Work Locations): the extra cities/states list
// plus the Canadian provinces allowed for on-site roles.
export interface GeoContext { extra: string[]; provinces: string[] }

// Languages the user speaks (roles requiring anything else are dropped).
const KNOWN_LANGUAGES = /\b(english|french|français|francais|anglais)\b/i;
const FOREIGN_LANGUAGE = /\b(german|deutsch|spanish|español|espanol|swedish|norwegian|danish|finnish|dutch|flemish|italian|italiano|portuguese|português|polish|czech|slovak|hungarian|romanian|bulgarian|greek|turkish|arabic|hebrew|hindi|urdu|punjabi|bengali|tamil|telugu|marathi|gujarati|kannada|malayalam|mandarin|cantonese|chinese|japanese|korean|vietnamese|thai|indonesian|malay|tagalog|filipino|russian|ukrainian|serbian|croatian|farsi|persian|afrikaans|swahili|catalan|basque|galician)\b/i;
const LANGUAGE_CONTEXT = /\b(language|languages|speaking|speaker|speakers|fluent|fluency|native|bilingual|proficiency|proficient|multilingual)\b/i;

// Compiled once at module load — these used to be rebuilt with `new RegExp(...)` on
// every single job checked, which made filtering hundreds of jobs visibly slow.
const FOREIGN_LANGUAGE_ALT = FOREIGN_LANGUAGE.source.replace(/^\\b\(|\)\\b$/g, '');
const STRONG_LANGUAGE_RE = new RegExp('\\b(fluent in|fluency in|native|proficient in|proficiency in|must speak|speak fluent)\\s+(' + FOREIGN_LANGUAGE_ALT + ')', 'i');
const STRONG_LANGUAGE_RE_2 = new RegExp('\\b(' + FOREIGN_LANGUAGE_ALT + ')\\s+(language required|is required|speaker required|speaking required|native speaker)', 'i');
const ENGLISH_FRENCH_COMBO_RE = /\b(english|french) (and|or|\/|,)/i;

// True when the role clearly requires a language the user doesn't speak (EN/FR only).
const requiresForeignLanguage = (title: string, desc: string): boolean => {
  // Turing-style titles: "Business Analyst (Swedish Language)" / "(German-speaking)"
  const parens = title.match(/\(([^)]*)\)/g) || [];
  for (const p of parens) {
    if (FOREIGN_LANGUAGE.test(p) && (LANGUAGE_CONTEXT.test(p) || /speaking|language/i.test(p)) && !KNOWN_LANGUAGES.test(p)) return true;
  }
  // Title mentions a foreign language + a language-context word
  if (FOREIGN_LANGUAGE.test(title) && LANGUAGE_CONTEXT.test(title) && !KNOWN_LANGUAGES.test(title)) return true;
  // Strong description pattern: "fluent in German", "native Spanish speaker", "German language required"
  const d = desc || '';
  if ((STRONG_LANGUAGE_RE.test(d) || STRONG_LANGUAGE_RE_2.test(d)) && !ENGLISH_FRENCH_COMBO_RE.test(d)) return true;
  return false;
};

// Listings found by reading a company's web page (no "Source • date" tag in dateDiscovered — every job-board
// feed adds one) are often not postings at all but the page's own links: menu entries, headings, staff names
// ("Our Philosophy", "Request a quote", "Slovenia | English"). Without this check they'd sail through the
// keyword filter on the strength of the page text attached to them, and get paid for at scoring time.
// So: a page-scraped listing whose title names no job, and whose link isn't a recognisable posting URL,
// is treated as "not a job" (shown in Dismissed with the "✓ This is a job" rescue; nothing is deleted).
// Jobs from the API feeds, and jobs with no discovery info at all, are never judged this way.
const SOURCE_TAG = / • /;
const POSTING_URL = /\/(?:job|jobs|position|positions|posting|postings|opening|openings|vacancy|vacancies|requisition|req)\/[^/?#]*\d|[?&](?:jobid|job_id|jid|gh_jid|requisitionid|reqid|postingid)=|myworkdayjobs\.com\/.+\/job\/|greenhouse\.io\/[^/]+\/jobs\/\d+|lever\.co\/[^/]+\/[0-9a-f-]{20,}|ashbyhq\.com\/[^/]+\/[0-9a-f-]{20,}|icims\.com\/jobs\/\d+|smartrecruiters\.com\/[^/]+\/\d+|workable\.com\/j\//i;
const isPageNoise = (job: FilterJob): boolean => {
  const found = job.dateDiscovered || '';
  if (!found || SOURCE_TAG.test(found)) return false;
  if (titleNamesARole(job.title)) return false;
  return !POSTING_URL.test(job.link || '');
};

// Why a job was held back from auto-scoring: null = eligible (auto-score).
export type FilterReason = null | 'role' | 'language' | 'offtopic' | 'nodesc' | 'notjob' | 'location';

export const getFilterReason = (job: FilterJob, negRe: RegExp | null, posRe: RegExp | null, geo?: GeoContext): FilterReason => {
  const title = job.title || '';
  const desc = (job.description || '').trim();
  if (job.forcedOk) return null;                                  // manually confirmed via "This is a job"
  if (!isLikelyJobTitle(title)) return 'notjob';                  // probably scraper junk, not a real posting
  if (isPageNoise(job)) return 'notjob';                          // page-scraped menu entry / heading / staff name
  // Judged live (not baked in at scan time) so changing the accepted locations re-sorts the
  // existing feed — and re-ticking a province brings those jobs straight back.
  if (geo && isJobLocationExcluded(`${title} ${job.location || ''}`, geo.extra, geo.provinces)) return 'location';
  if (negRe && negRe.test(foldText(title))) return 'role';        // wrong-function title
  if (requiresForeignLanguage(title, desc)) return 'language';   // needs a language you don't speak
  if (!posRe) return null;                                       // positive filter disabled → score everything that passed negative
  if (desc.length < 40) return 'nodesc';                         // no usable description → can't verify relevance
  if (!posRe.test(foldText(desc))) return 'offtopic';            // description has no relevance keyword
  return null;
};

export const isScoreEligible = (job: FilterJob, negRe: RegExp | null, posRe: RegExp | null, geo?: GeoContext): boolean =>
  getFilterReason(job, negRe, posRe, geo) === null;

// Which positive keyword(s) actually matched — posRe only tells you true/false via
// .test(), this re-runs it with the 'g' flag to recover the specific term(s) found,
// so the UI can explain *why* a job was judged relevant instead of just asserting it.
export const getMatchedPositiveKeywords = (desc: string, posRe: RegExp | null): string[] => {
  if (!posRe || !desc) return [];
  const folded = foldText(desc);
  const global = new RegExp(posRe.source, posRe.flags.includes('g') ? posRe.flags : posRe.flags + 'g');
  // Matching ran on accent-free text; when folding kept the length (the usual case) show each hit as the
  // description wrote it ("protéine"), otherwise fall back to the folded form.
  const sameLength = folded.length === desc.length;
  const hits = Array.from(folded.matchAll(global), m => (sameLength ? desc.slice(m.index!, m.index! + m[0].length) : m[0]).toLowerCase());
  return Array.from(new Set(hits));
};

export const FILTER_REASON_LABEL: Record<Exclude<FilterReason, null>, string> = {
  role: 'Filtered: off-target role',
  language: 'Filtered: requires a language you don\'t speak',
  offtopic: 'Filtered: description has no relevant keywords',
  nodesc: 'Not scored: no description available',
  notjob: 'Doesn\'t look like a real job posting (title has no recognizable role) — check before dismissing',
  location: 'Filtered: outside your accepted work locations'
};
