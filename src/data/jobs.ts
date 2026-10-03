import realSeed from './seed.active';

export type JobStatus = 'interested' | 'applied' | 'interviewing' | 'offer' | 'rejected';

export type Industry =
  | 'Biotech'
  | 'Pharma'
  | 'Consulting'
  | 'Finance'
  | 'VC'
  | 'Research'
  | 'HealthTech'
  | 'Innovation'
  | 'AI'
  | 'Tech'
  | 'Startup'
  | 'Government'
  | 'Publisher'
  | 'Marketing'
  | 'Other';

export type CompanySize = 'Small' | 'Medium' | 'Large' | 'Enterprise';

export interface Company {
  id: string;
  name: string;
  industry: Industry;
  website?: string;
  careerPage?: string;
  openApplicationUrl?: string;  
  linkedinUrl?: string;
  indeedUrl?: string;
  indeedRating?: number;
  glassdoorUrl?: string;
  glassdoorRating?: number;
  possibleContact?: string;
  coldCallEmail?: string;
  status?: JobStatus;           
  applied?: boolean;             
  noScan?: boolean;              // tracked (applications, notes) but skipped by "Scan all" — its careers site gives the scraper nothing but menus and cookie banners
  talentCommunity?: boolean;     
  notes?: string;
  scrapedJobs?: { title: string, link: string, dateDiscovered?: string, location?: string, description?: string, aiStrategy?: string, forcedOk?: boolean }[];
  lastScanResult?: { count: number, error?: string, timestamp: string };
  // Application status portal ("my account" page some companies provide)
  applicationPortalUrl?: string;   // login/portal URL to check application status
  portalUsername?: string;         // email or username used (NOT the password)
  portalNote?: string;             // free note, e.g. "signed up with Google"
}

export type RejectionReason = 'no_response' | 'screening' | 'technical' | 'cultural' | 'overqualified' | 'underqualified' | 'role_filled' | 'other';

export interface SubmittedApplication {
  id: string;
  companyId: string;
  jobTitle: string;
  dateSubmitted: string;
  responseDate?: string;
  status: JobStatus;
  responseFromCompany?: string;
  jobDescription?: string;
  coverLetter?: string;
  coverLetterFile?: { name: string, path: string };
  cvFile?: { name: string, path: string };
  notes?: string;
  // New fields
  whyIWantThis?: string;          // Personal motivation notes
  followUpDate?: string;          // ISO date when to follow up
  followedUp?: boolean;           // Whether follow-up was sent
  rejectionReason?: RejectionReason; // Populated when status → rejected
  fitScore?: number;              // 0-100 AI fit score
  jobUrl?: string;                // Original job posting link
  trackingUrl?: string;           // "View my profile / track this application" portal link
  desiredSalary?: string;         // What you asked for when applying (free text)
}

export interface SavedCV {
  id: string;
  name: string;                   // e.g. "Consulting - McKinsey 2025"
  type: 'Consulting' | 'VC/Finance' | 'Biotech/Research' | 'Tech' | 'Marketing' | 'General' | 'Other';
  text: string;                   // Full CV text (extracted from PDF or pasted)
  fileName?: string;              // Original filename for display
  dateAdded: string;
}


// Colors are limited to the 6 palette classes actually defined in index.css
// (tag-purple/emerald/sky/amber/rose/slate) — grouped by theme, not 1:1 per industry.
export const INDUSTRY_TAG: Record<Industry, string> = {
  AI: 'tag-purple', VC: 'tag-purple', Marketing: 'tag-purple',
  Pharma: 'tag-emerald', HealthTech: 'tag-emerald',
  Biotech: 'tag-sky', Research: 'tag-sky', Publisher: 'tag-sky',
  Consulting: 'tag-amber', Innovation: 'tag-amber',
  Finance: 'tag-rose', Startup: 'tag-rose',
  Tech: 'tag-slate', Government: 'tag-slate', Other: 'tag-slate'
};

export const INDUSTRY_EMOJI: Record<Industry, string> = {
  Biotech: '🧬', Pharma: '💊', Consulting: '💼', Finance: '💰', VC: '📈',
  Research: '🔬', HealthTech: '💻', Innovation: '💡', AI: '🤖', Tech: '⚙️', Startup: '🚀',
  Government: '🏛️', Publisher: '📚', Marketing: '📣', Other: '📌'
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  interested: 'Bookmarked', applied: 'Applied', interviewing: 'Interviewing',
  rejected: 'Rejected', offer: 'Offer'
};

export const STATUS_COLORS: Record<JobStatus, string> = {
  interested: 'status-interested', applied: 'status-applied', interviewing: 'status-interviewing',
  rejected: 'status-rejected', offer: 'status-offer'
};

// The real target-company list is personal (its notes talk about her own background), so it lives in
// src/data/seed.private.ts, which is gitignored and never published. Importing ./seed.active gets an empty
// list in git; vite.config.js substitutes the private file for a real build on a machine that has it, and
// never for a demo/blank build (see COMPANIES below).
const COMPANIES_SEED: Company[] = realSeed;

// Published/shared demo: ships with zero companies. Whoever's trying it adds their
// own via Discovery → Add Company and sees the scan/scoring pipeline run for real —
// see REMOVED_DEMO_SEED_IDS in App.tsx, which purges the older seeded companies
// (Anthropic, BioRender, Deep Genomics, Freenome, Moderna (Laval), and before that
// the marketing/MBA test matrix) from anyone's already-saved demo data, since
// emptying this array alone wouldn't remove them from a install that already has them.
const DEMO_COMPANIES_SEED: Company[] = [];

// VITE_BLANK_MODE: the shareable full-featured build (see package-share.command) — the real
// app, but with no pre-loaded companies. Both flags are checked inline so the bundler can
// drop COMPANIES_SEED from those builds (and vite.config.js keeps the private file out entirely).
export const COMPANIES: Company[] = (import.meta.env.VITE_DEMO_MODE === 'true' || import.meta.env.VITE_BLANK_MODE === 'true') ? DEMO_COMPANIES_SEED : COMPANIES_SEED;
