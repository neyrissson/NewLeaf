// Junk-detector for scraped "job" titles that aren't real postings — career-site
// boilerplate (legal/policy pages, application-process guidance, CSR/culture content)
// that scrapers sometimes sweep up alongside real listings, even from clean ATS APIs.
//
// This used to be an ALLOWLIST (title must contain a recognized role noun), but that
// kept rejecting real jobs with industry-specific or unconventional titles — "Medical
// Illustrator / Animator", "Internal Audit/Controls Assurance - Senior", "Product
// Builder, a Founder Track role" — because no fixed word list can keep up with how
// varied real job titles are across industries. A denylist of the junk itself is far
// more stable: the junk is a small, recognizable set of *topics* (policy pages,
// application FAQs, CSR content), not the open-ended diversity of real professions.
// So titles pass by default now, and only get rejected for matching a known junk shape.
// Titles are accent-folded before matching (see textFold.ts), so every pattern below is written
// without accents and covers both English and French career sites.

import { foldText } from './textFold';

export const OK_WORDS_KEY = 'newleaf_ok_job_words';
export const TRASH_WORDS_KEY = 'newleaf_trash_job_words';

// Both editable in Settings — two simple, plain-phrase safety nets around the smart
// regex patterns below, same shape as the existing negative/positive filters.
// OK words: a title containing any of these always passes (teach past a false reject).
// Trash words: a title containing any of these always fails (teach past a false accept).
export const DEFAULT_OK_WORDS: string[] = [];
export const DEFAULT_TRASH_WORDS: string[] = [];

const loadList = (key: string, fallback: string[]): string[] => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
  } catch {}
  return fallback;
};
export const loadOkWords = (): string[] => loadList(OK_WORDS_KEY, DEFAULT_OK_WORDS);
export const loadTrashWords = (): string[] => loadList(TRASH_WORDS_KEY, DEFAULT_TRASH_WORDS);

const JUNK_PATTERNS: RegExp[] = [
  // Legal / policy / compliance boilerplate
  /conditions? of use/i, /terms (of|and) (service|use)/i, /privacy policy/i, /cookie policy/i,
  /accessibility statement/i, /\bdisclosures?\b/i,
  /conditions? (generales )?d'utilisation/i, /termes et conditions/i, /conditions generales/i, /mentions legales/i,
  /politique (de|relative aux?) (confidentialite|temoins|cookies)/i, /declaration (de|d') ?(confidentialite|accessibilite)/i,
  /protection des (renseignements personnels|donnees)/i, /avis de non-responsabilite/i,
  // Application-process meta content (guidance about applying, not a posting itself)
  /application (hints|tips|process|faq)/i, /candidate (guidance|faq)/i,
  /get matched/i, /upload your resume/i, /how to apply\b/i, /interview (process|tips|faq)/i,
  // Corporate CSR / ESG / culture content
  /well-?being/i, /diversity( and | & )?inclusion/i, /\bDEI\b/i, /sustainability/i,
  /environmental (accounting|action|impact)/i, /grants and contribution/i,
  /corporate (social )?responsibility/i, /\blife at [A-Z]/,
  /^our (culture|team|values|story|mission)$/i, /^employee benefits\b/i,
  /new graduates? ?&? ?entry-level/i,
  /bien-etre/i, /diversite,? (et|&) inclusion/i, /equite,? diversite/i, /developpement durable/i, /responsabilite (sociale|d'entreprise)/i,
  // Cookie-consent banners swept up as if they were listings ("Consent", "[#IABV2SETTINGS#]", "Google5",
  // "Cross-domain consent[#BULK_CONSENT_DOMAINS_COUNT#]")
  /\[#.*#\]/, /^consent( decree\b.*)?$/i, /cross-domain consent/i, /\bcookies?\b.*\b(settings|preferences|notice|consent|banner|list)\b/i,
  // A lone name + count ("Google5", "Microsoft4", "careers.amaris.com2") or a bare domain ("amaris.com") is a
  // cookie-vendor row or a footer link, never a role
  /^[a-z][a-z.-]*\d{1,3}$/i, /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|ca|co|ai|bio|fr|de|uk|us)\/?$/i,
];

// Bare site-navigation labels (the WHOLE title, nothing else) — menu items and section headings that
// generic page scraping mistakes for postings. Exact matches only, so a real title that merely
// contains one of these words ("Oncology Scientist") is never touched. General-application postings
// ("Join our talent community", "Open application") are left out on purpose: ATS APIs list those as
// real postings, and they're not obviously junk to someone who wants to apply.
const NAV_LABELS = [
  // English
  'about( us)?', 'careers?', 'home', 'contact( us)?', 'news', 'blog', 'press', 'investor relations', 'locations', 'faq', 'site ?map',
  'who we are', 'our (science|story|team|people|pipeline|approach|company)', 'leadership( team)?', 'management team', 'executive team',
  'board of directors', '(scientific )?advisory board', 'publications', 'products', 'services', 'resources', 'partnering', 'partnerships',
  'portfolio', 'case studies', 'clinical trials', 'patients', 'healthcare professionals', 'media', 'press releases?', 'newsroom',
  'science', 'oncology', 'immunology', 'pharma', 'innovation', 'manufacturing', 'access',
  'accessibility', 'disclaimer', 'donate', 'privacy', 'legal', 'cookies?', 'skip to (main )?(content|navigation)', 'click(ing)? here',
  'search( jobs)?', 'job search', 'see all (jobs|openings)', 'view all (jobs|openings)', 'all (our )?jobs', 'find a job',
  'sign ?in', 'log ?in', 'register',
  'learn more', 'read more', 'continue reading', 'load more', 'show more', 'view more', 'accept( all)?', 'reject( all)?', 'decline',
  'francais', 'english', 'deutsch', 'espanol', 'italiano', 'portugues',
  // French
  'accueil', 'a propos( de nous)?', 'qui nous sommes', 'notre (science|histoire|mission|equipe|approche)', 'nos (valeurs|produits|equipes)',
  'nous (joindre|contacter|rejoindre)', 'contactez-nous', 'rejoignez-nous', 'plan du site', 'nouvelles', 'actualites', 'blogue',
  'communiques de presse', 'salle de presse', 'carrieres?', 'emplois?', 'offres? d\'emploi', 'direction', 'dirigeants',
  'equipe de (direction|gestion)', 'conseil d\'administration', 'comite consultatif( scientifique)?', 'produits', 'ressources',
  'partenariats', 'portefeuille', 'etudes de cas', 'essais cliniques', 'professionnels de la sante', 'medias', 'oncologie', 'immunologie',
  'fabrication', 'acces', 'accessibilite', 'confidentialite', 'vie privee', 'temoins', 'avertissement', 'faire un don', 'don',
  'aller au contenu( principal)?', 'passer au contenu( principal)?', 'continuer la lecture', 'lire la suite', 'en savoir plus',
  'voir plus', 'afficher plus', 'charger plus', 'tout accepter', 'accepter tout', 'refuser', 'rechercher', 'recherche',
  'se connecter', 'connexion', 'inscription', 'voir toutes les offres', 'toutes nos offres', 'trouver un emploi',
];
const NAV_ONLY = new RegExp('^(' + NAV_LABELS.join('|') + ')$', 'i');

// ---------------------------------------------------------------------------------------------------
// Does a title name a job at all? ("Senior Scientist", "Chargée de projet", "Data Engineer (H/F)")
// Only used on listings found by reading a company web page, where the scraper also picks up menu
// entries, headings and staff names ("Our Philosophy", "Request a quote", "Angèle Maki"). The check
// is deliberately generous — a wrong "yes" just leaves a menu item in the feed, a wrong "no" hides a
// real job — and it never applies to jobs that come from a job board's own feed.
// ---------------------------------------------------------------------------------------------------
const ROLE_WORDS_SHORT = ['vp', 'svp', 'evp', 'rep', 'qa', 'sre', 'dba', 'ceo', 'cfo', 'cto', 'coo', 'cio', 'emt', 'lead', 'chair', 'dean', 'chef', 'head of'];
const ROLE_WORDS = [
  // English
  'manager', 'director', 'engineer', 'scientist', 'analyst', 'specialist', 'associate', 'consultant', 'developer', 'technician',
  'coordinator', 'researcher', 'president', 'vice-president', 'intern', 'internship', 'architect', 'advisor', 'adviser', 'designer',
  'administrator', 'supervisor', 'representative', 'executive', 'principal', 'fellow', 'postdoc', 'postdoctoral', 'professor', 'writer',
  'editor', 'strategist', 'partner', 'assistant', 'operator', 'auditor', 'accountant', 'counsel', 'counsellor', 'counselor', 'recruiter',
  'generalist', 'biologist', 'chemist', 'statistician', 'physician', 'pharmacist', 'nurse', 'trainer', 'evaluator', 'reviewer', 'expert',
  'tutor', 'annotator', 'investigator', 'planner', 'controller', 'buyer', 'scheduler', 'clerk', 'secretary', 'receptionist', 'driver',
  'mechanic', 'electrician', 'welder', 'machinist', 'inspector', 'underwriter', 'actuary', 'trader', 'broker', 'banker', 'sales',
  'marketer', 'producer', 'curator', 'librarian', 'paralegal', 'attorney', 'lawyer', 'solicitor', 'translator', 'interpreter',
  'instructor', 'teacher', 'lecturer', 'founder', 'agent', 'adjuster', 'examiner', 'technologist', 'programmer', 'coder', 'tester',
  'sysadmin', 'apprentice', 'trainee', 'graduate', 'student', 'scholar', 'resident', 'liaison', 'contractor', 'contributor', 'advocate',
  'ambassador', 'coach', 'mentor', 'owner', 'monitor', 'leader', 'modeler', 'modeller', 'preparer', 'pilot', 'dispatcher', 'fundraiser',
  'professional', 'actor', 'senior', 'junior', 'sr', 'jr',
  // French (accent-free: titles are folded before matching)
  'scientifique', 'stagiaire', 'etudiant', 'chercheur', 'chercheuse', 'ingenieur', 'gestionnaire', 'directeur', 'directrice', 'responsable',
  'chargee', 'charge', 'conseiller', 'conseillere', 'analyste', 'specialiste', 'coordonnateur', 'coordonnatrice', 'coordinateur',
  'coordinatrice', 'technicien', 'technicienne', 'adjoint', 'adjointe', 'developpeur', 'developpeuse', 'architecte', 'concepteur',
  'conceptrice', 'redacteur', 'redactrice', 'biologiste', 'chimiste', 'statisticien', 'pharmacien', 'infirmier', 'infirmiere', 'medecin',
  'comptable', 'avocat', 'avocate', 'juriste', 'notaire', 'formateur', 'formatrice', 'enseignant', 'professeur', 'representant',
  'vendeur', 'vendeuse', 'acheteur', 'acheteuse', 'preparateur', 'operateur', 'operatrice', 'mecanicien', 'electricien', 'soudeur',
  'inspecteur', 'controleur', 'auditeur', 'superviseur', 'animateur', 'animatrice', 'associe', 'associee', 'apprenti', 'postdoctorant',
  'laborantin', 'technologue', 'physicien', 'mathematicien', 'economiste', 'psychologue', 'therapeute', 'clinicien', 'consolideur', 'president',
  // biology-flavoured job nouns that don't end in a common suffix
  'bioinformatician', 'biostatistician', 'epidemiologist', 'immunologist', 'pharmacologist', 'microbiologist', 'neuroscientist', 'geneticist',
];
const ROLE_RE = new RegExp('\\b(?:' + ROLE_WORDS_SHORT.join('|') + ')\\b|\\b(?:' + ROLE_WORDS.join('|') + ')(?:s|es|x|e|ne|nne)?\\b', 'i');
// "-ist / -ician / -iste / -ologue …" agent nouns the list above doesn't spell out (pharmacologue, biostatisticien …)
const AGENT_NOUN_RE = /\b[a-z]{4,}(?:ist|ician|ologist|iste|logue|ien|ienne)(?:s|es)?\b/i;
// Contract / gender markers that French and German postings put right in the title: "(H/F)", "(m/w/d)", "CDI"
const POSTING_MARKER_RE = /\b(?:h\/f|f\/h|m\/f|m\/w\/d|f\/m\/x|cdi|cdd)\b/i;

export const titleNamesARole = (title: string | null | undefined): boolean => {
  if (!title) return false;
  // Scraped link text often glues words together ("Computational BiologistRemote", "Scientist2Pleasanton")
  const t = foldText(title).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2');
  return ROLE_RE.test(t) || AGENT_NOUN_RE.test(t) || POSTING_MARKER_RE.test(t);
};

export const isLikelyJobTitle = (title: string | null | undefined): boolean => {
  if (!title) return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  const folded = foldText(trimmed);
  const lower = folded.toLowerCase();

  // Her own overrides take priority over the built-in patterns either way — OK wins
  // over trash if a title happens to match both (rescuing it is the safer default).
  const ok = loadOkWords();
  if (ok.some(w => w.trim() && lower.includes(foldText(w).trim().toLowerCase()))) return true;

  const trash = loadTrashWords();
  if (trash.some(w => w.trim() && lower.includes(foldText(w).trim().toLowerCase()))) return false;

  if (NAV_ONLY.test(folded.replace(/[\s.:!>›»→…]+$/, ''))) return false;
  return !JUNK_PATTERNS.some(re => re.test(folded));
};
