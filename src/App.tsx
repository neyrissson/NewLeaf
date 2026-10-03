import { useState, useEffect, useRef } from 'react'
import './index.css'
import type { Company, JobStatus, SubmittedApplication, SavedCV } from './data/jobs'
import { COMPANIES } from './data/jobs'
import { Discovery } from './components/Discovery'
import { Tracker } from './components/Tracker'
import { Settings } from './components/Settings'
import { CVBank } from './components/CVBank'
import { JobOpenings } from './components/JobOpenings'
import { SubmittedApplications } from './components/SubmittedApplications'
import { ManualJobModal } from './components/ManualJobModal'
import { QuestionBank } from './components/QuestionBank'
import { InterviewerCoach } from './components/InterviewerCoach'
import { JobApplyModal } from './components/JobApplyModal'
import { INITIAL_INTERVIEWER_QUESTIONS } from './data/interviewerQuestions'
import { SWEEP_COMPANY_ID, DEFAULT_SWEEP_QUERIES } from './utils/sweepConfig'
import { isLikelyJobTitle } from './utils/jobTitleFilter'
import { pushGeoAllowed, pushProvincesAllowed, loadGeoAllowed, loadProvincesAllowed } from './utils/geoConfig'
import { buildMatcher, loadNegative, loadPositive, isScoreEligible } from './utils/jobFilter'
import { loadTheme, applyTheme, type Theme } from './utils/theme'

type Tab = 'discovery' | 'tracker' | 'job_openings' | 'submitted_applications' | 'to_apply' | 'settings' | 'interview_prep' | 'interviewer_coach' | 'cv_bank'

// Demo build only: ids that used to be in the seed — the marketing/MBA test matrix,
// 'moderna' (renamed to 'modernalaval'), and finally the whole real-companies set
// once the published demo moved to shipping with zero companies. Removing them from
// the seed alone isn't enough — a saved demo already has them under those ids, and
// the merge logic below would otherwise resurrect them as "user-added" companies.
const REMOVED_DEMO_SEED_IDS = new Set([
  'snc_lavalin', 'fasken', 'ogilvy', 'deloitte_consulting', 'benevity', 'vidyard', 'ecobee', 'lightspeed_commerce', 'poka', 'thomson_reuters',
  'moderna', 'anthropic', 'biorender', 'deep_genomics', 'freenome', 'modernalaval'
]);

// Same idea for every build: companies dropped from the real seed (their careers pages only ever returned
// navigation menus, cookie banners or staff names, or — Accenture's global Workday feed — SAP roles in other
// countries and languages). Without this, the saved data of anyone who had them
// would bring them back as nameless "user-added" companies.
const REMOVED_SEED_IDS = new Set(['ability', 'accenture_life_sciences']);

export interface InterviewerQuestion {
  id: string;
  text: string;
  category: 'Background & Motivation' | 'Strategic Thinking' | 'Data, Analytics & AI' | 'Consulting-Specific' | 'VC & Finance-Specific' | 'Pharma & Life Sciences Knowledge' | 'Collaboration & Communication' | 'Growth, Ambition & Learning Agility' | 'Problem-Solving & Execution' | 'Compensation, Fit & Logistics' | 'Experience' | 'Behavioral' | 'Leadership' | 'Motivation' | 'Red Flag';
  userNote?: string;
  aiSuggestion?: string;
}

export interface InterviewQuestion {
  id: string;
  text: string;
  jobType: string;
  companyType: string;
  notes?: string;
  answers?: { [companyId: string]: string };
}

export interface InterestedJob {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  link: string;
  dateDiscovered: string;
  description?: string;
  aiStrategy?: string;
  location?: string;
}

const isStaleJob = (dateStr?: string) => {
  if (!dateStr) return false;
  
  // 1. Try to extract YYYY-MM-DD format
  const match = dateStr.match(/\d{4}-\d{2}-\d{2}/);
  if (match) {
    const diffTime = Math.abs(Date.now() - new Date(match[0]).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 30; // stale if older than 30 days
  }
  
  // 2. Check if the string mentions "month" or "months"
  const low = dateStr.toLowerCase();
  if (low.includes('month') || low.includes('mois') || low.includes('90 day') || low.includes('60 day') || low.includes('30+ day')) {
    return true;
  }
  
  return false;
};

function App() {
  const [companies, setCompanies] = useState<Company[]>(() => {
    try {
      const saved = localStorage.getItem('jobRadar_companies')
      if (saved) {
        const parsedSaved = JSON.parse(saved) as Record<string, Partial<Company>>
        // Merge static seed companies with dynamic saved state (status, applied, notes)
        const merged = COMPANIES.map(c => {
          const s = parsedSaved[c.id]
          if (s) {
            // Automatically prune stale job postings older than 30 days, and any
            // non-job junk (career-site boilerplate pages like "General Conditions of
            // Use") that slipped through during the brief window before the
            // isLikelyJobTitle fix landed — so nothing gets scored by accident.
            // A noScan company never keeps scraped "jobs": whatever was stored from before is menu junk.
            const activeScrapedJobs = c.noScan ? [] : (s.scrapedJobs || []).filter(j => !isStaleJob(j.dateDiscovered) && (j.forcedOk || isLikelyJobTitle(j.title)));
            return {
              ...c,
              status: s.status ?? c.status,
              applied: s.applied ?? c.applied,
              talentCommunity: s.talentCommunity ?? c.talentCommunity,
              notes: s.notes ?? c.notes,
              scrapedJobs: activeScrapedJobs,
              website: s.website ?? c.website,
              // Curated ATS seed URLs (Greenhouse/Lever/Ashby/Workday/BambooHR) are
              // scraped via reliable APIs — always prefer them over stale saved values.
              // Also ignore saved linkedin.com/company pages (they hit the login authwall).
              careerPage: (/greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|myworkdayjobs\.com|bamboohr\.com/.test(c.careerPage || ''))
                            ? c.careerPage
                            : (s.careerPage && !s.careerPage.includes('linkedin.com/company/') ? s.careerPage : c.careerPage),
              linkedinUrl: s.linkedinUrl ?? c.linkedinUrl,
              indeedUrl: s.indeedUrl ?? c.indeedUrl,
              glassdoorUrl: s.glassdoorUrl ?? c.glassdoorUrl
            }
          }
          return c
        })

        // Also add any companies that were manually added by the user
        // (those whose IDs are not in the static COMPANIES list)
        const staticIds = new Set(COMPANIES.map(c => c.id))
        const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'
        // Demo build only: guard against the same company sitting twice under two
        // different ids (e.g. it was seeded once under an old id, then re-seeded later
        // under a cleaned-up id — the old id's entry becomes "user-added" and duplicates
        // it). Static seed entries always win, so drop any user-added entry whose name
        // already matches one already on the merged list.
        const staticNames = new Set(merged.map(c => c.name.trim().toLowerCase()))
        const userAdded = Object.keys(parsedSaved)
          .filter(id => !staticIds.has(id) && !REMOVED_SEED_IDS.has(id) && !(isDemo && REMOVED_DEMO_SEED_IDS.has(id)))
          .filter(id => !(isDemo && staticNames.has(((parsedSaved[id] as Company).name || '').trim().toLowerCase())))
          .map(id => {
            const c = parsedSaved[id] as Company;
            return {
              ...c,
              scrapedJobs: (c.scrapedJobs || []).filter(j => !isStaleJob(j.dateDiscovered) && (j.forcedOk || isLikelyJobTitle(j.title)))
            };
          })

        return [...merged, ...userAdded].sort((a, b) => a.name.localeCompare(b.name))
      }
    } catch(e) {
      console.error('Failed to load companies from localStorage', e)
    }
    return COMPANIES
  })

  // Save changes to localStorage whenever companies update
  // skipSaveRef prevents saving on every individual company update during a scan
  const skipSaveRef = useRef(false)
  useEffect(() => {
    if (skipSaveRef.current) return;
    try {
      // Create a mapped object saving only the fields that change, keyed by company id
      const dataToSave = companies.reduce((acc, c) => {
        const isStatic = COMPANIES.find(orig => orig.id === c.id)
        if (isStatic) {
          // Only save deltas for static companies to save space
          if (c.status || c.applied || c.talentCommunity || c.notes || c.scrapedJobs || c.website || c.careerPage || c.linkedinUrl || c.indeedUrl || c.glassdoorUrl) {
            acc[c.id] = {
              status: c.status,
              applied: c.applied,
              talentCommunity: c.talentCommunity,
              notes: c.notes,
              scrapedJobs: c.scrapedJobs,
              website: c.website,
              careerPage: c.careerPage,
              linkedinUrl: c.linkedinUrl,
              indeedUrl: c.indeedUrl,
              glassdoorUrl: c.glassdoorUrl
            }
          }
        } else {
          // Save FULL object for user-added companies
          acc[c.id] = c
        }
        return acc
      }, {} as Record<string, Partial<Company>>)
      
      localStorage.setItem('jobRadar_companies', JSON.stringify(dataToSave))
    } catch(e) {
      console.error('Failed to save to localStorage', e)
    }
  }, [companies])

  const [applications, setApplications] = useState<SubmittedApplication[]>(() => {
    try {
      const saved = localStorage.getItem('jobRadar_applications')
      if (saved) return JSON.parse(saved)
    } catch(e) {}
    return []
  })

  useEffect(() => {
    localStorage.setItem('jobRadar_applications', JSON.stringify(applications))
  }, [applications])

  const [activeTab, setActiveTab] = useState<Tab>('discovery')
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  useEffect(() => { applyTheme(theme); localStorage.setItem('newleaf_theme', theme); }, [theme])
  const [showManualModal, setShowManualModal] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ current: number, total: number, name: string } | null>(null)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [draftApplication, setDraftApplication] = useState<{companyId: string, jobTitle: string, jobUrl?: string} | null>(null)
  const cancelScanRef = useRef(false)
  const [generatingBriefId, setGeneratingBriefId] = useState<string | null>(null)

  const [discardedJobs, setDiscardedJobs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('discardedJobs')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // Undo stack for deleted listings (session-only; recovers misclicks)
  const [undoStack, setUndoStack] = useState<{ kind: 'discard', removed: { companyId: string, job: any }[], link: string, title?: string }[]>([])

  const [discardedTitles, setDiscardedTitles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('discardedTitles')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const [interestedJobs, setInterestedJobs] = useState<InterestedJob[]>(() => {
    try {
      const saved = localStorage.getItem('interestedJobs')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // Watch discarded jobs and sync to localstorage
  useEffect(() => {
    localStorage.setItem('discardedJobs', JSON.stringify(discardedJobs))
  }, [discardedJobs])

  useEffect(() => {
    localStorage.setItem('discardedTitles', JSON.stringify(discardedTitles))
  }, [discardedTitles])

  useEffect(() => {
    localStorage.setItem('interestedJobs', JSON.stringify(interestedJobs))
  }, [interestedJobs])

  const [applyAITarget, setApplyAITarget] = useState<InterestedJob | null>(null);

  // CV Bank
  const [savedCVs, setSavedCVs] = useState<SavedCV[]>(() => {
    try {
      const saved = localStorage.getItem('newleaf_saved_cvs');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem('newleaf_saved_cvs', JSON.stringify(savedCVs));
  }, [savedCVs]);

  const handleAddSavedCV = (cv: Omit<SavedCV, 'id' | 'dateAdded'>) => {
    const newCV: SavedCV = { ...cv, id: crypto.randomUUID(), dateAdded: new Date().toISOString().split('T')[0] };
    setSavedCVs(prev => [...prev, newCV]);
  };
  const handleDeleteSavedCV = (id: string) => setSavedCVs(prev => prev.filter(c => c.id !== id));
  const handleUpdateSavedCV = (id: string, updates: Partial<SavedCV>) =>
    setSavedCVs(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

  // Track new jobs since last scan (link set)
  const [newJobLinks, setNewJobLinks] = useState<Set<string>>(new Set());
  const [fitScores, setFitScores] = useState<Record<string, {score: number, reason: string, topSkillMatch?: string}>>(() => {
    try { return JSON.parse(localStorage.getItem('newleaf_fit_scores') || '{}'); } catch { return {}; }
  });

  // Scoring profile — compact competency string for fast job fit scoring
  const [scoringProfile, setScoringProfile] = useState<string>(() => {
    // Personal default lives in the gitignored .env.local (VITE_DEFAULT_SCORING_PROFILE) so it
    // never reaches the repo. Only her own real build uses it: a clean checkout, the published demo
    // and the shareable blank build all start empty.
    return localStorage.getItem('newleaf_scoring_profile') || (import.meta.env.VITE_BLANK_MODE === 'true' || import.meta.env.VITE_DEMO_MODE === 'true' ? '' : (import.meta.env.VITE_DEFAULT_SCORING_PROFILE ?? ''));
  });
  useEffect(() => {
    localStorage.setItem('newleaf_scoring_profile', scoringProfile);
  }, [scoringProfile]);

  // Follow-up overdue count for sidebar badge
  const overdueFollowUps = applications.filter(a => {
    if (a.followedUp || a.status === 'rejected' || a.status === 'offer') return false;
    if (!a.followUpDate) return false;
    return new Date(a.followUpDate) <= new Date();
  }).length;

  // Background scoring worker
  const handleStartBackgroundScoring = async () => {
    const profile = scoringProfile.trim();
    if (profile.length < 20) {
      alert("Please configure your Scoring Profile in Settings first.");
      return;
    }
    const el = (window as any).electron;
    if (!el?.scoreJobFit) return;

    // Read latest scores from localStorage to avoid stale React closures
    const currentScores = JSON.parse(localStorage.getItem('newleaf_fit_scores') || '{}');
    const allJobs = companies.flatMap(c => (c.scrapedJobs || []).map((j: any) => ({ ...j, company: c })));
    // Only auto-score jobs that pass the pre-scoring filters (saves Haiku cost).
    // Filtered-out jobs stay in the feed's "Filtered out" section and can be scored manually.
    const negRe = buildMatcher(loadNegative());
    const posRe = buildMatcher(loadPositive());
    const unscored = allJobs.filter((j: any) => !currentScores[j.link] && j.title?.length > 3 && isScoreEligible(j, negRe, posRe, { extra: loadGeoAllowed(), provinces: loadProvincesAllowed() }));

    if (unscored.length === 0) {
      alert("No unscored jobs found!");
      return;
    }

    (window as any).cancelScoring = false;
    alert(`Starting background scoring for ${unscored.length} jobs! Keep the app open.`);

    for (const job of unscored) {
      if ((window as any).cancelScoring) break;
      
      try {
        let jobDescription = (job as any).description || '';
        if (!jobDescription && el.fetchJobDescription && job.link?.startsWith('http')) {
          try { jobDescription = await el.fetchJobDescription({ url: job.link }); } catch {}
        }
        
        // Visual dummy state
        setFitScores(prev => ({ ...prev, [job.link]: { score: 0, reason: 'Evaluating...' } }));

        const engine = localStorage.getItem('newleaf_scoring_engine') || 'ollama';
        const anthropicApiKey = localStorage.getItem('newleaf_anthropic_api_key') || '';

        if (engine === 'haiku' && !anthropicApiKey) {
          alert("Missing Anthropic API Key! Please add it in the Settings tab.");
          (window as any).cancelScoring = true;
          setFitScores(prev => { const next = { ...prev }; delete next[job.link]; return next; });
          break;
        }

        const result = await el.scoreJobFit({
          jobTitle: job.title,
          jobDescription,
          profile,
          engine,
          anthropicApiKey
        });

        if (result?.usage) {
           const usage = JSON.parse(localStorage.getItem('newleaf_haiku_usage') || '{"input":0,"output":0}');
           usage.input = (Number(usage.input) || 0) + (Number(result.usage.input) || 0);
           usage.output = (Number(usage.output) || 0) + (Number(result.usage.output) || 0);
           localStorage.setItem('newleaf_haiku_usage', JSON.stringify(usage));
        }

        if (result && !(window as any).cancelScoring) {
          setFitScores(prev => {
            const next = { ...prev, [job.link]: result };
            localStorage.setItem('newleaf_fit_scores', JSON.stringify(next));
            return next;
          });
        } else if (!(window as any).cancelScoring) {
          setFitScores(prev => { const next = { ...prev }; delete next[job.link]; return next; });
        }
      } catch {
        setFitScores(prev => { const next = { ...prev }; delete next[job.link]; return next; });
      }
    }
  };

  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>(() => {
    try {
      const saved = localStorage.getItem('newleaf_interview_questions')
      if (saved) return JSON.parse(saved)
      
      return [
        // Role & Scope
        { id: 'q1', text: "How does this team currently use data to inform strategic decisions, and where do you see the biggest gaps?", jobType: 'Strategy', companyType: 'All' },
        { id: 'q2', text: "What does success look like in this role at 6 months vs. 18 months — and how is that measured?", jobType: 'General', companyType: 'All' },
        { id: 'q3', text: "How embedded is this role in the decision-making process? Am I advising leadership, or executing on decisions already made upstream?", jobType: 'Strategy', companyType: 'All' },
        { id: 'q4', text: "What's the ratio of strategic work to operational/execution work in this role day-to-day?", jobType: 'Strategy', companyType: 'All' },
        { id: 'q5', text: "How mature is the data infrastructure here? Are we building from scratch, optimizing existing systems, or somewhere in between?", jobType: 'Technical', companyType: 'All' },
        { id: 'q6', text: "Is AI/ML currently being used in your workflows, and what's the roadmap for adoption?", jobType: 'Technical', companyType: 'All' },
        
        // Pharma
        { id: 'q7', text: "Where is this company in its pipeline, and how does this role contribute to moving programs forward?", jobType: 'General', companyType: 'Pharma' },
        { id: 'q8', text: "How does your team balance the tension between speed-to-market and scientific rigor?", jobType: 'General', companyType: 'Pharma' },
        { id: 'q9', text: "How is commercial strategy integrated with R&D here — are those teams siloed or closely aligned?", jobType: 'Strategy', companyType: 'Pharma' },
        { id: 'q10', text: "What's your approach to real-world evidence and data partnerships with payers or hospitals?", jobType: 'Technical', companyType: 'Pharma' },
        { id: 'q11', text: "How is the company thinking about AI applications in drug discovery or clinical development specifically?", jobType: 'Technical', companyType: 'Pharma' },

        // Consulting
        { id: 'q12', text: "What types of clients and mandates does the Montreal office specialize in, particularly in life sciences?", jobType: 'General', companyType: 'Consulting' },
        { id: 'q13', text: "How does the firm staff projects — do I have influence over the sectors or clients I work with early on?", jobType: 'General', companyType: 'Consulting' },
        { id: 'q14', text: "What's the mentorship model here? How do senior consultants invest in junior talent?", jobType: 'Management', companyType: 'Consulting' },
        { id: 'q15', text: "How does the firm differentiate itself from competitors when pitching for the same mandate?", jobType: 'Strategy', companyType: 'Consulting' },
        { id: 'q16', text: "How much original IP, frameworks, or thought leadership does this office produce vs. applying global methodologies?", jobType: 'Strategy', companyType: 'Consulting' },

        // VC
        { id: 'q17', text: "What does the portfolio support function look like — how involved are team members post-investment?", jobType: 'Operations', companyType: 'VC' },
        { id: 'q18', text: "Is there an opportunity to get exposure to deal sourcing and due diligence from early on, or is the role more focused on portfolio operations?", jobType: 'General', companyType: 'VC' },
        { id: 'q19', text: "How does the firm define its thesis in life sciences right now — are you leaning into specific modalities or stages?", jobType: 'Strategy', companyType: 'VC' },
        { id: 'q20', text: "What does the firm's LP base look like, and how does that shape your investment time horizon?", jobType: 'Strategy', companyType: 'VC' },
        { id: 'q21', text: "How do internal career paths typically evolve here — is promotion tied to deal performance, fund cycles, or something else?", jobType: 'Management', companyType: 'VC' },

        // Growth & Learning
        { id: 'q22', text: "What have been the most common career trajectories for people who started in this role?", jobType: 'General', companyType: 'All' },
        { id: 'q23', text: "What does professional development look like here — conferences, training budgets, mentorship?", jobType: 'General', companyType: 'All' },
        { id: 'q24', text: "Is there a formal review/feedback structure, or is it more informal?", jobType: 'Management', companyType: 'All' },
        
        // Red Flags
        { id: 'q25', text: "How long has the person I would be reporting to been in their role?", jobType: 'Red Flag', companyType: 'All' },
        { id: 'q26', text: "Why is this position open right now?", jobType: 'Red Flag', companyType: 'All' },
      ]
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('newleaf_interview_questions', JSON.stringify(interviewQuestions))
  }, [interviewQuestions])

  const [interviewerQuestions, setInterviewerQuestions] = useState<InterviewerQuestion[]>(() => {
    try {
      const saved = localStorage.getItem('newleaf_interviewer_questions')
      if (saved) return JSON.parse(saved)
      return INITIAL_INTERVIEWER_QUESTIONS;
    } catch { return INITIAL_INTERVIEWER_QUESTIONS; }
  })

  useEffect(() => {
    localStorage.setItem('newleaf_interviewer_questions', JSON.stringify(interviewerQuestions))
  }, [interviewerQuestions])
  
  const [cvBio, setCvBio] = useState(() => localStorage.getItem('newleaf_cv_bio') || '')
  
  useEffect(() => {
    localStorage.setItem('newleaf_cv_bio', cvBio)
  }, [cvBio])

  const [jobBriefs, setJobBriefs] = useState<Record<string, { important: string, keywords: string[] }>>(() => {
    try {
      const saved = localStorage.getItem('newleaf_job_briefs')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  useEffect(() => {
    localStorage.setItem('newleaf_job_briefs', JSON.stringify(jobBriefs))
  }, [jobBriefs])

  const [showExplainForToApply, setShowExplainForToApply] = useState<string | null>(null);

  const getFitColor = (score: number) => {
    if (score >= 75) return '#10b981';
    if (score >= 55) return '#fbbf24';
    if (score >= 35) return '#f97316';
    return '#ef4444';
  };

  const handleScanSingleCompany = async (comp: Company) => {
    if (scanning) return;
    setScanning(true);
    setScanProgress({ current: 0, total: 1, name: comp.name });
    
    try {
      const targetUrl = comp.careerPage || comp.website;
      if (!targetUrl) {
        alert("This company doesn't have a careers page or website configured.");
        setScanning(false);
        setScanProgress(null);
        return;
      }

      // @ts-ignore
      const rawNewJobs = await window.electron.scanJobs({ 
        url: targetUrl, 
        discarded: discardedJobs, 
        discardedTitles 
      });
      
      const newJobs = rawNewJobs || [];

      const jobsWithDescRaw = await Promise.all(newJobs.map(async (j: any) => {
        // API fast paths (Greenhouse/Lever/Ashby) already embed the description
        if (j.description) return j;
        if (j.link?.startsWith('http')) {
          try {
            // @ts-ignore
            const live = await window.electron.checkUrlAlive?.({ url: j.link });
            if (live && live.alive === false) return { ...j, __dead: true };
          } catch {}
          try {
            // @ts-ignore
            const desc = await window.electron.fetchJobDescription({ url: j.link });
            return { ...j, description: desc || '' };
          } catch {}
        }
        return j;
      }));
      const jobsWithDesc = jobsWithDescRaw.filter((j: any) => !j.__dead);

      // Per-company LinkedIn fallback for hard SPA sites that yield little
      let merged = jobsWithDesc;
      const atsApiRe = /greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|myworkdayjobs\.com|bamboohr\.com|sepalai\.com/;
      // @ts-ignore
      if (jobsWithDesc.length < 2 && !atsApiRe.test(comp.careerPage || '') && window.electron.fetchCompanyLinkedin) {
        try {
          // @ts-ignore
          const liJobs = await window.electron.fetchCompanyLinkedin({ name: comp.name });
          const filtered = (liJobs || []).filter((j: any) =>
            !discardedJobs.includes(j.link) && !discardedTitles.includes(j.title)
          );
          const byLink = new Map(jobsWithDesc.map((j: any) => [j.link, j]));
          filtered.forEach((j: any) => { if (!byLink.has(j.link)) byLink.set(j.link, j); });
          merged = Array.from(byLink.values());
        } catch {}
      }

      setCompanies(prev => prev.map(c =>
        c.id === comp.id ? { ...c, scrapedJobs: merged, lastScanResult: { count: merged.length, timestamp: new Date().toISOString() } } : c
      ));

      alert(`Scan complete! Found ${merged.length} matching jobs for ${comp.name}.`);

    } catch (err) {
      alert(`Scan failed for ${comp.name}: ${err}`);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  };

  const handleScan = async () => {
    if (scanning) {
      cancelScanRef.current = true
      return
    }

    setScanning(true)
    cancelScanRef.current = false
    skipSaveRef.current = true  // Don't save to localStorage on every company update during scan
    pushGeoAllowed()  // ensure the scraper uses the latest accepted-locations list
    pushProvincesAllowed()  // ensure the scraper uses the latest accepted-provinces list

    const toScan = companies
      .filter(c => c.id !== SWEEP_COMPANY_ID && (c.careerPage || c.website) && c.status !== 'rejected' && !c.noScan)
      .sort((a, b) => a.name.localeCompare(b.name));
    setScanProgress({ current: 0, total: toScan.length, name: '' })

    // Snapshot existing job links before scan to detect new ones
    const existingLinks = new Set(
      companies.flatMap(c => (c.scrapedJobs || []).map(j => j.link))
    );

    // @ts-ignore
    if (window.electron && window.electron.scanJobs) {
      // Scans run in parallel (3 at a time) — the main process uses a pool of hidden
      // scraper windows, so concurrent loadURL() calls no longer race each other.
      // API fast paths (Greenhouse/Lever/Ashby/Sepal) don't need a window at all.
      const CONCURRENCY = 3;
      const freshNewLinks = new Set<string>();

      // Preserve already-fetched descriptions across re-scans
      const prevDescByLink = new Map<string, string>();
      companies.forEach(c => (c.scrapedJobs || []).forEach(j => {
        if (j.description) prevDescByLink.set(j.link, j.description);
      }));

      let nextIdx = 0;
      let completed = 0;
      // Track per-company yield so the LinkedIn fallback can target the empties
      const scanCounts = new Map<string, number>();

      const scanOne = async (comp: Company) => {
        let targetUrl = comp.careerPage || comp.website;
        if (comp.id === 'anthropic') {
          targetUrl = 'https://job-boards.greenhouse.io/anthropic';
        }
        if (!targetUrl) return;

        try {
          // @ts-ignore
          const rawNewJobs = await window.electron.scanJobs({ url: targetUrl, discarded: discardedJobs, discardedTitles });

          // Pre-score heuristic filter: aggressively drop obvious fake listings (navigation links, department names)
          const newJobs = rawNewJobs || [];

          if (newJobs && newJobs.length > 0) {
            const jobsWithDesc = await Promise.all(newJobs.map(async (j: any) => {
              const isNewLink = !existingLinks.has(j.link);
              if (isNewLink && j.link?.startsWith('http')) freshNewLinks.add(j.link);
              // Fill only what's missing (fast re-scans):
              // 1. Description embedded by an API fast path (Greenhouse/Lever/Ashby/Workday/BambooHR) → use it.
              if (j.description) return j;
              // 2. Description already fetched on a previous scan → carry it over (don't re-fetch).
              const carried = prevDescByLink.get(j.link);
              if (carried) return { ...j, description: carried };
              // 3. Only a brand-new generic-scraped job needs a separate description fetch.
              if (isNewLink && j.link?.startsWith('http')) {
                try {
                  // @ts-ignore
                  const live = await window.electron.checkUrlAlive?.({ url: j.link });
                  if (live && live.alive === false) return { ...j, __dead: true };
                } catch {}
                try {
                  // @ts-ignore
                  const desc = await window.electron.fetchJobDescription({ url: j.link });
                  return { ...j, description: desc || '' };
                } catch {}
              }
              return j;
            }));
            const liveJobs = jobsWithDesc.filter((j: any) => !j.__dead);
            scanCounts.set(comp.id, liveJobs.length);
            setCompanies(prev => prev.map(c =>
              c.id === comp.id ? { ...c, scrapedJobs: liveJobs, lastScanResult: { count: liveJobs.length, timestamp: new Date().toISOString() } } : c
            ));
          } else {
            // Don't clear existing jobs when scraper returns 0 — could be a timeout,
            // JS-heavy page, or rate limit. Just record the scan result.
            scanCounts.set(comp.id, 0);
            setCompanies(prev => prev.map(c =>
              c.id === comp.id ? { ...c, lastScanResult: { count: 0, timestamp: new Date().toISOString() } } : c
            ));
          }
        } catch (err) {
          scanCounts.set(comp.id, 0);
          setCompanies(prev => prev.map(c =>
            c.id === comp.id ? { ...c, lastScanResult: { count: 0, error: String(err), timestamp: new Date().toISOString() } } : c
          ));
        }
      };

      const worker = async () => {
        while (!cancelScanRef.current) {
          const myIdx = nextIdx++;
          if (myIdx >= toScan.length) return;
          const comp = toScan[myIdx];
          setScanProgress({ current: completed, total: toScan.length, name: comp.name });
          await scanOne(comp);
          completed++;
          setScanProgress({ current: completed, total: toScan.length, name: comp.name });
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      if (cancelScanRef.current) {
        setNewJobLinks(freshNewLinks);
        setScanProgress(null);
        setScanning(false);
        skipSaveRef.current = false;
        return;
      }

      // --- Per-company LinkedIn fallback ---
      // Companies whose own site is a hard JS SPA (custom GraphQL, Gem, Workday-behind-marketing…)
      // often yield 0-1 jobs. For those NOT already on a reliable ATS API, pull their postings
      // from LinkedIn by company name. Sequential + capped so we don't hammer LinkedIn.
      // @ts-ignore
      if (window.electron.fetchCompanyLinkedin) {
        const atsApiRe = /greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|myworkdayjobs\.com|bamboohr\.com|sepalai\.com/;
        const needsFallback = toScan.filter(c =>
          (scanCounts.get(c.id) ?? 0) < 2 &&
          !atsApiRe.test(c.careerPage || '') &&
          c.name && c.name.length >= 3
        ).slice(0, 60); // cap to stay gentle on LinkedIn's guest endpoint

        for (let i = 0; i < needsFallback.length; i++) {
          if (cancelScanRef.current) break;
          const comp = needsFallback[i];
          setScanProgress({ current: i, total: needsFallback.length, name: `🔗 LinkedIn: ${comp.name}` });
          try {
            // @ts-ignore
            const liJobs = await window.electron.fetchCompanyLinkedin({ name: comp.name });
            const filtered = (liJobs || []).filter((j: any) =>
              !discardedJobs.includes(j.link) && !discardedTitles.includes(j.title)
            );
            if (filtered.length > 0) {
              filtered.forEach((j: any) => { if (!existingLinks.has(j.link)) freshNewLinks.add(j.link); });
              setCompanies(prev => prev.map(c => {
                if (c.id !== comp.id) return c;
                // Merge with anything the direct scrape found, dedup by link
                const byLink = new Map((c.scrapedJobs || []).map(j => [j.link, j]));
                filtered.forEach((j: any) => { if (!byLink.has(j.link)) byLink.set(j.link, j); });
                const merged = Array.from(byLink.values());
                return { ...c, scrapedJobs: merged, lastScanResult: { count: merged.length, timestamp: new Date().toISOString() } };
              }));
            }
          } catch { /* skip on error */ }
        }
      }

      // --- Aggregator sweep: LinkedIn guest search, beyond the company registry ---
      // @ts-ignore
      if (window.electron.sweepAggregators) {
        try {
          const rawQueries = localStorage.getItem('newleaf_sweep_queries');
          const queries = (rawQueries ?? DEFAULT_SWEEP_QUERIES)
            .split('\n').map(q => q.trim()).filter(Boolean);
          if (queries.length > 0) {
            setScanProgress({ current: toScan.length, total: toScan.length, name: '🌐 LinkedIn sweep…' });
            // @ts-ignore
            const sweepResults = await window.electron.sweepAggregators({ queries });
            const sweepJobs = (sweepResults || [])
              .filter((j: any) => !discardedJobs.includes(j.link) && !discardedTitles.includes(j.title))
              .map((j: any) => ({
                title: j.companyName ? `${j.title} — ${j.companyName}` : j.title,
                link: j.link,
                dateDiscovered: j.dateDiscovered,
                location: j.location,
                description: j.description
              }));
            sweepJobs.forEach((j: any) => { if (!existingLinks.has(j.link)) freshNewLinks.add(j.link); });
            const scanResult = { count: sweepJobs.length, timestamp: new Date().toISOString() };
            setCompanies(prev => {
              if (prev.some(c => c.id === SWEEP_COMPANY_ID)) {
                return prev.map(c => c.id === SWEEP_COMPANY_ID ? { ...c, scrapedJobs: sweepJobs, lastScanResult: scanResult } : c);
              }
              const sweepCompany: Company = {
                id: SWEEP_COMPANY_ID,
                name: 'LinkedIn Sweep',
                industry: 'Other',
                website: 'https://www.linkedin.com/jobs/',
                notes: 'Auto-generated by the aggregator sweep — recent postings from companies outside your registry. Edit the search queries in Settings.',
                scrapedJobs: sweepJobs,
                lastScanResult: scanResult
              };
              return [...prev, sweepCompany].sort((a, b) => a.name.localeCompare(b.name));
            });
          }
        } catch (e) {
          console.error('Aggregator sweep failed', e);
        }
      }

      setNewJobLinks(freshNewLinks);
    } else {
      await new Promise(r => setTimeout(r, 3200))
    }

    setScanProgress(null)
    setScanning(false)
    skipSaveRef.current = false  // Re-enable localStorage saving — next setCompanies will persist everything
    setLastScanned(new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }))

    // Trigger fit scoring after scan completes (not during — scoring cancels when jobs change mid-scan)
    // Removed: User prefers manual scoring.
    // setShouldScoreFits(true);
  }

  // Jobs already in "To Apply" or "I applied" — used to hide them from the discovery feed
  const normJobTitle = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const takenLinks = new Set<string>();
  const takenTitleKeys = new Set<string>();
  interestedJobs.forEach(j => {
    if (j.link) takenLinks.add(j.link);
    takenTitleKeys.add(`${j.companyId}::${normJobTitle(j.title)}`);
  });
  applications.forEach(a => {
    if (a.jobUrl) takenLinks.add(a.jobUrl);
    takenTitleKeys.add(`${a.companyId}::${normJobTitle(a.jobTitle)}`);
  });

  const appliedCount = companies.filter(c => c.applied).length
  const interviewingCount = companies.filter(c => c.status === 'interviewing').length
  const talentCount = companies.filter(c => c.talentCommunity).length
  const discoveredJobsCount = companies.reduce((acc, c) => acc + (c.scrapedJobs?.length || 0), 0)

  const handleStatusChange = (id: string, status: JobStatus | undefined) =>
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, status } : c))

  const handleAppliedChange = (id: string, applied: boolean) =>
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, applied } : c))

  const handleTalentCommunityChange = (id: string, talentCommunity: boolean) =>
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, talentCommunity } : c))

  const handleNotesChange = (id: string, notes: string) =>
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, notes } : c))

  const handleAddCompany = (c: Company) => {
    // Keep the registry alphabetical so new companies land in the right place in every list
    setCompanies(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const handleApplyRegistryFixes = () => {
    setCompanies(prev => prev.map(c => {
      // Fix Regeneron
      if (c.name.toLowerCase().includes('regeneron') && !c.careerPage?.includes('search-results')) {
        return {
          ...c,
          id: 'regeneron', // Re-link to official ID if possible
          website: 'https://careers.regeneron.com/',
          careerPage: 'https://careers.regeneron.com/en/search-results',
          linkedinUrl: 'https://www.linkedin.com/company/regeneron-pharmaceuticals/posts/?feedView=all'
        }
      }
      // Fix Telix
      if (c.name.toLowerCase().includes('telix') && !c.careerPage?.includes('careers/find-a-job')) {
        return {
          ...c,
          id: 'telix',
          website: 'https://telixpharma.com/',
          careerPage: 'https://telixpharma.com/careers/find-a-job/',
          linkedinUrl: 'https://www.linkedin.com/company/telix-pharmaceuticals-limited/posts/?feedView=all'
        }
      }
      return c;
    }))
    alert('Registry repaired! Re-linked Regeneron and Telix to high-precision search URLs.')
  }

  const handleAddApplication = (appData: Omit<SubmittedApplication, 'id'>) => {
    const newApp: SubmittedApplication = {
      ...appData,
      id: crypto.randomUUID(),
      status: appData.status || 'applied'
    }
    setApplications(prev => [newApp, ...prev])
    
    // Sync to company
    setCompanies(prev => prev.map(c => 
      c.id === appData.companyId ? { ...c, applied: true, status: 'applied' } : c
    ))
  }

  const handleUpdateApplication = (id: string, updates: Partial<SubmittedApplication>) => {
    setApplications(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    
    // Sync status to company if it changed
    if (updates.status) {
      const app = applications.find(a => a.id === id);
      if (app) {
        setCompanies(prev => prev.map(c => 
          c.id === app.companyId ? { ...c, status: (updates.status as JobStatus) } : c
        ));
      }
    }
  }

  const handleDiscardJob = (link: string, title?: string) => {
    // Capture exactly what gets removed so a misclick can be undone
    const removed: { companyId: string, job: any }[] = [];
    companies.forEach(c => (c.scrapedJobs || []).forEach(j => {
      if (j.link === link || (title && j.title === title)) removed.push({ companyId: c.id, job: j });
    }));
    if (removed.length > 0) {
      setUndoStack(prev => [...prev.slice(-14), { kind: 'discard' as const, removed, link, title }]);
    }

    setDiscardedJobs(prev => Array.from(new Set([...prev, link])));
    if (title) setDiscardedTitles(prev => Array.from(new Set([...prev, title])));

    setCompanies(prev => prev.map(c => ({
      ...c,
      scrapedJobs: (c.scrapedJobs || []).filter(j => j.link !== link && (title ? j.title !== title : true))
    })));
  }

  const handleUndoDiscard = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    // Un-blacklist and re-add the removed jobs to their companies
    setDiscardedJobs(dj => dj.filter(l => l !== last.link));
    if (last.title) setDiscardedTitles(dt => dt.filter(t => t !== last.title));
    setCompanies(cs => cs.map(c => {
      const toAdd = last.removed.filter(r => r.companyId === c.id).map(r => r.job);
      if (toAdd.length === 0) return c;
      const existing = new Set((c.scrapedJobs || []).map(j => j.link));
      return { ...c, scrapedJobs: [...(c.scrapedJobs || []), ...toAdd.filter(j => !existing.has(j.link))] };
    }));
    setUndoStack(prev => prev.slice(0, -1));
  };

  // Manually attach a job description to a scraped job (used to promote an
  // "unscorable / no description" job so it can be relevance-checked and scored).
  const handleSetJobDescription = (companyId: string, link: string, description: string) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId
        ? { ...c, scrapedJobs: (c.scrapedJobs || []).map(j => j.link === link ? { ...j, description } : j) }
        : c
    ));
  };

  // "This is a job" override — rescues a single card the notjob heuristic got wrong,
  // without waiting on a broader fix. Persists on the job itself (survives rescans).
  const handleMarkAsJob = (companyId: string, link: string) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId
        ? { ...c, scrapedJobs: (c.scrapedJobs || []).map(j => j.link === link ? { ...j, forcedOk: true } : j) }
        : c
    ));
  };

  const handleClearAllScrapedJobs = () => {
    if (confirm("Are you sure you want to clear all discovered job openings? You can re-scan immediately.")) {
      setCompanies(prev => prev.map(c => ({ ...c, scrapedJobs: [] })));
      // Demo build only: also wipe fit scores so the next scan looks fully fresh/unscored
      // (useful for repeat demo runs). Left alone on the real app — scores cost real API
      // calls to regenerate, so clearing them on every "Clear All" would be wasteful there.
      if (import.meta.env.VITE_DEMO_MODE === 'true') {
        localStorage.removeItem('newleaf_fit_scores');
        setFitScores({});
      }
    }
  }

  // Discarded jobs/titles are permanent blocklists (a link or title on either list is
  // silently excluded from every future scan, forever). Removing an entry here doesn't
  // restore the job itself — it just lets the next scan find it again.
  const handleRemoveDiscardedJob = (link: string) => setDiscardedJobs(dj => dj.filter(l => l !== link));
  const handleRemoveDiscardedTitle = (title: string) => setDiscardedTitles(dt => dt.filter(t => t !== title));
  const handleClearDiscardedJobs = () => setDiscardedJobs([]);
  const handleClearDiscardedTitles = () => setDiscardedTitles([]);

  const handleFastApply = (companyId: string, jobTitle: string, jobUrl?: string) => {
    setDraftApplication({ companyId, jobTitle, jobUrl });
    setActiveTab('submitted_applications');
  }

  const handleInterestedJob = (companyId: string, companyName: string, title: string, link: string, dateDiscovered: string, description?: string, location?: string) => {
    setInterestedJobs(prev => {
      // Deduplicate by link — don't add the same posting twice
      if (prev.some(j => j.link === link)) return prev
      const job: InterestedJob = {
        id: crypto.randomUUID(),
        companyId,
        companyName,
        title,
        link,
        dateDiscovered,
        description,
        location
      }
      return [...prev, job]
    })
  }

  const handleRemoveInterestedJob = (id: string) => {
    setInterestedJobs(prev => prev.filter(j => j.id !== id))
  }

  const handleApplyFromInterested = (job: InterestedJob) => {
    handleFastApply(job.companyId, job.title, job.link);
    handleRemoveInterestedJob(job.id);
  }

  const handleAddInterviewQuestion = (qData: Omit<InterviewQuestion, 'id'>) => {
    const newQ: InterviewQuestion = { ...qData, id: crypto.randomUUID() };
    setInterviewQuestions(prev => [newQ, ...prev]);
  };

  const handleDeleteInterviewQuestion = (id: string) => {
    setInterviewQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleUpdateInterviewQuestion = (id: string, updates: Partial<InterviewQuestion>) => {
    setInterviewQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const handleGenerateBrief = async (job: {link: string, title: string, companyId: string, description?: string}) => {
    const comp = companies.find(c => c.id === job.companyId);
    if (!comp) return;
    setGeneratingBriefId(job.link);

    // Use cached context if available (from QuestionBank logic or previous scrape)
    const cachedContext = localStorage.getItem('newleaf_cached_contexts');
    let rawContext = '';
    if (cachedContext) {
        const parsed = JSON.parse(cachedContext);
        rawContext = parsed[comp.id] || '';
    }

    // Adversarial grounded prompt to prevent hallucinations (e.g. Tank Worldwide being biotech)
    const prompt = `
        You are a skeptical, fact-based Strategic Intelligence agent. 
        Analyze the following company: "${comp.name}"
        Current App Industry Label: "${comp.industry}" (Warning: This label may be a default/placeholder and could be WRONG).
        Role: "${job.title}"
        
        Website Snippets:
        "${rawContext.substring(0, 3000)}"

        Job Description:
        "${(job.description || '').substring(0, 3000)}"

        TASK:
        1. VALIDATE the industry. If the snippets show the company is NOT in "${comp.industry}", start your brief by identifying the TRUE industry.
        2. Provide a "Brief" for an interviewer that is 100% grounded in the snippets above, but TAILORED to the context of the "${job.title}" role.
        3. Format as JSON: { "important": "...", "keywords": ["...", "..."] }
    `;

    try {
        // @ts-ignore
        const res = await window.electron.askLocalLLM({ prompt });
        if (res) {
            // Simple JSON extractor
            const match = res.match(/\{[\s\S]*\}/);
            if (match) {
                const data = JSON.parse(match[0]);
                setJobBriefs(prev => ({ ...prev, [job.link]: data }));
            }
        }
    } catch (e) {
        console.error("Brief generation failed", e);
    } finally {
        setGeneratingBriefId(null);
    }
  };

  const handleSaveContext = (id: string, context: string) => {
    const cached = localStorage.getItem('newleaf_cached_contexts') || '{}';
    try {
        const parsed = JSON.parse(cached);
        parsed[id] = context;
        localStorage.setItem('newleaf_cached_contexts', JSON.stringify(parsed));
    } catch (e) {
        console.error("Failed to save context", e);
    }
  };

  const handleUpdateCompany = (id: string, updates: Partial<Company>) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  const handleRescoreFits = (clearExisting: boolean = false) => {
    if (clearExisting) {
      if (!confirm("Are you sure you want to clear all existing scores and start over?")) return;
      localStorage.removeItem('newleaf_fit_scores');
      setFitScores({});
    }
    // Launch async worker directly, bypassing React state
    handleStartBackgroundScoring();
  };

  const handleScoreJob = async (link: string) => {
    const profile = scoringProfile.trim();
    if (profile.length < 20) {
      alert("Please enter a detailed Scoring Profile first (Settings tab) so the AI knows what you're looking for.");
      return;
    }
    const el = (window as any).electron;
    if (!el?.scoreJobFit) return;

    const allJobs = companies.flatMap(c => c.scrapedJobs || []);
    let job = allJobs.find(j => j.link === link);
    if (!job) {
      const interestedJob = interestedJobs.find(j => j.link === link);
      if (interestedJob) {
        job = {
          title: interestedJob.title,
          link: interestedJob.link,
          description: interestedJob.description,
          location: interestedJob.location,
          dateDiscovered: interestedJob.dateDiscovered
        };
      }
    }
    if (!job) return;

    try {
      let jobDescription = job.description || '';
      if (!jobDescription && el.fetchJobDescription && job.link?.startsWith('http')) {
        try { jobDescription = await el.fetchJobDescription({ url: job.link }); } catch {}
      }
      
      // Show loading state by setting it to a dummy object temporarily
      setFitScores(prev => ({ ...prev, [link]: { score: 0, reason: 'Evaluating...' } }));
      
      const engine = localStorage.getItem('newleaf_scoring_engine') || 'ollama';
      const anthropicApiKey = localStorage.getItem('newleaf_anthropic_api_key') || '';

      if (engine === 'haiku' && !anthropicApiKey) {
        alert("Missing Anthropic API Key! Please add it in the Settings tab.");
        setFitScores(prev => { const next = { ...prev }; delete next[link]; return next; });
        return;
      }

      const result = await el.scoreJobFit({
        jobTitle: job.title,
        jobDescription,
        profile,
        engine,
        anthropicApiKey
      });
      
      if (result?.usage) {
         const usage = JSON.parse(localStorage.getItem('newleaf_haiku_usage') || '{"input":0,"output":0}');
         usage.input += result.usage.input;
         usage.output += result.usage.output;
         localStorage.setItem('newleaf_haiku_usage', JSON.stringify(usage));
      }
      if (result) {
        setFitScores(prev => {
          const next = { ...prev, [link]: result };
          localStorage.setItem('newleaf_fit_scores', JSON.stringify(next));
          return next;
        });
      } else {
        // Clear dummy loading state if failed
        setFitScores(prev => {
          const next = { ...prev };
          delete next[link];
          return next;
        });
        const engine = localStorage.getItem('newleaf_scoring_engine') || 'ollama';
        if (engine === 'ollama') {
          alert('Failed to score job. Ensure Ollama is running and the model is downloaded.');
        } else {
          alert('Failed to score job. Please check your Anthropic API Key and network connection.');
        }
      }
    } catch {
        setFitScores(prev => {
          const next = { ...prev };
          delete next[link];
          return next;
        });
        alert('Exception occurred while scoring job. Is the Ollama background service running?');
    }
  };
  const handleDeleteCompany = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this company and all associated jobs/applications?")) return;
    setCompanies(prev => prev.filter(c => c.id !== id));
    setInterestedJobs(prev => prev.filter(j => j.companyId !== id));
    setApplications(prev => prev.filter(a => a.companyId !== id));
  };

  // Push the user's accepted-locations list to the scraper backend on startup
  useEffect(() => { pushGeoAllowed(); pushProvincesAllowed(); }, []);

  // Keyboard shortcuts
  const tabOrder: Tab[] = ['job_openings', 'to_apply', 'interview_prep', 'interviewer_coach', 'submitted_applications', 'tracker', 'discovery', 'cv_bank', 'settings'];
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 's' && !e.shiftKey) { e.preventDefault(); handleScan(); }
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndoDiscard(); }
        if (e.key === 'Escape') { setApplyAITarget(null); }
        const num = parseInt(e.key);
        if (num >= 1 && num <= tabOrder.length) { e.preventDefault(); setActiveTab(tabOrder[num - 1]); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scanning, undoStack.length]); // eslint-disable-line

  const navItems = [
    { id: 'job_openings', icon: '✨', label: 'Job Feed', badge: discoveredJobsCount || undefined },
    { id: 'to_apply',    icon: '⏳', label: 'To Apply',    badge: interestedJobs.length || undefined },
    { id: 'interview_prep', icon: '🎤', label: 'Reverse Interview', badge: undefined },
    { id: 'interviewer_coach', icon: '🤖', label: 'My Responses', badge: undefined },
    { id: 'submitted_applications', icon: '📬', label: 'Submitted applications', badge: (overdueFollowUps > 0 ? `${applications.length} · ⚠️${overdueFollowUps}` : applications.length) || undefined },
    { id: 'tracker',      icon: '📋', label: 'My Pipeline',   badge: interviewingCount || undefined },
    { id: 'discovery',    icon: '🧭', label: 'Companies',    badge: companies.filter(c => !c.status).length || undefined },
    { id: 'cv_bank',      icon: '📋', label: 'CV Bank',      badge: savedCVs.length || undefined },
    { id: 'settings',     icon: '⚙️', label: 'Settings',     badge: undefined },
  ]

  return (
    <div className="app">
      <div className="app-drag-bar" />
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="logo-led" />
          <img src="./icon_converted.png" alt="NewLeaf Logo" className="topbar-logo-img" />
          NewLeaf
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-pill">
          <div className="topbar-dot" />
          {companies.length} companies · {appliedCount} applied · {talentCount} talent pools · {interviewingCount} interviewing
        </div>
        <button
          id="scan-btn"
          className={`btn ${scanning ? 'btn-danger' : 'btn-primary'} btn-sm`}
          onClick={handleScan}
          style={{ marginLeft: 10, minWidth: 140, backgroundColor: scanning ? '#ef4444' : undefined, color: scanning ? '#fff' : undefined }}
        >
          {scanning 
            ? '⏹ Stop Scan' 
            : '🔍 Scan for Jobs'}
        </button>
        {lastScanned && !scanning && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>Last: {lastScanned}</span>
        )}
        {scanning && scanProgress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 10, flex: 1, maxWidth: 300 }}>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%`,
                background: 'linear-gradient(90deg, #d4af37, #f1d592)',
                borderRadius: 3,
                transition: 'width 0.4s ease'
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap', minWidth: 60 }}>
              {scanProgress.current}/{scanProgress.total}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {scanProgress.name}
            </span>
          </div>
        )}
      </header>

      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-section-label">Navigation</div>
        {navItems.map(item => (
          <button key={item.id} className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id as Tab)} id={`nav-${item.id}`}>
            <span className="nav-item-icon">{item.icon}</span>
            {item.label}
            {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
          </button>
        ))}

        <hr className="divider" style={{ marginTop: 'auto' }} />

        <div className="sidebar-section-label">Summary</div>
        <div style={{ padding: '4px 10px 8px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.9 }}>
          <div>🏢 {companies.length} companies</div>
          <div>✨ {discoveredJobsCount} jobs found</div>
          <div>⏳ {interestedJobs.length} to apply</div>
          <div>📤 {applications.length} sent</div>
          <div>📬 {talentCount} talent pools</div>
          <div>💬 {interviewingCount} interviewing</div>
          <div>🎉 {companies.filter(c => c.status === 'offer').length} offers</div>
          <div>❌ {companies.filter(c => c.status === 'rejected').length} rejected</div>
        </div>
      </nav>

      {/* Main content */}
      <main className="main">
        {activeTab === 'job_openings' && (
          <JobOpenings 
            companies={companies} 
            onClearAll={handleClearAllScrapedJobs}
            onDiscardJob={handleDiscardJob}
            onFastApply={handleFastApply}
            onInterestedJob={handleInterestedJob}
            jobBriefs={jobBriefs}
            onGenerateBrief={handleGenerateBrief}
            generatingBriefId={generatingBriefId}
            newJobLinks={newJobLinks}
            cvBio={cvBio}
            fitScores={fitScores}
            onRescoreFits={handleRescoreFits}
            onScoreJob={handleScoreJob}
            takenLinks={takenLinks}
            takenTitleKeys={takenTitleKeys}
            onAddJobDescription={handleSetJobDescription}
            onMarkAsJob={handleMarkAsJob}
            onUndoDiscard={handleUndoDiscard}
            undoCount={undoStack.length}
          />
        )}
        {activeTab === 'to_apply' && (
          <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
            <div className="page-header" style={{ marginBottom: 20 }}>
              <div>
                <div className="page-title">To Apply</div>
                <div className="page-subtitle">Jobs you're interested in but haven't sent yet</div>
              </div>
              <button className="btn btn-primary" onClick={() => setShowManualModal(true)}>
                ＋ Add Job Manually
              </button>
            </div>
            
            {interestedJobs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⏳</div>
                <div className="empty-title">Queue is empty</div>
                <div className="empty-text">Click "I want to apply" on any job in the feed to save it here.</div>
              </div>
            ) : (
              <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                {interestedJobs.map(job => {
                  const fit = fitScores[job.link];
                  return (
                  <div key={job.id} className="elite-job-card fade-in">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{job.companyName}</div>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', height: 20, fontSize: 10, opacity: 0.4, border: 'none' }} onClick={() => handleRemoveInterestedJob(job.id)}>✕</button>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)', lineHeight: 1.25 }}>{job.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Discovered: {job.dateDiscovered}</div>
                      {fit && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 36, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${fit.score}%`, background: getFitColor(fit.score), borderRadius: 3, transition: 'width 0.5s' }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: getFitColor(fit.score) }}>{fit.score}%</span>
                            <button className="btn btn-ghost btn-xs" onClick={(e) => { e.preventDefault(); handleScoreJob(job.link); }} style={{ fontSize: 9, padding: '0 4px', height: 16, minHeight: 16, color: 'var(--text-muted)' }}>
                              ↻ Re-score
                            </button>
                          </div>
                          <button className="btn btn-ghost btn-xs" onClick={(e) => { e.preventDefault(); setShowExplainForToApply(showExplainForToApply === job.link ? null : job.link); }} style={{ fontSize: 9, padding: '0', height: 14, minHeight: 14, color: 'var(--sky)' }}>
                            Explain my score
                          </button>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      {job.location && (
                        <span className="tag" style={{ fontSize: 11, background: job.location.toLowerCase().includes('remote') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)', color: job.location.toLowerCase().includes('remote') ? '#10b981' : '#3b82f6', border: '1px solid rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>
                          📍 {job.location}
                        </span>
                      )}
                      {!fit && (
                        <button className="btn btn-ghost btn-xs" onClick={(e) => { e.preventDefault(); handleScoreJob(job.link); }} style={{ fontSize: 10, padding: '0 6px', height: 20, minHeight: 20 }}>
                          ✨ Score
                        </button>
                      )}
                    </div>
                    
                    <div className="job-button-grid" style={{ marginTop: 'auto' }}>
                      <button className="btn btn-glow btn-sm" style={{ justifyContent: 'center' }} onClick={() => setApplyAITarget(job)}>✨ Help me apply</button>
                      <a href={job.link} target="_blank" className="btn btn-outline-gold btn-sm" style={{ justifyContent: 'center' }}>View Posting</a>
                      <button className="btn btn-primary btn-sm" style={{ gridColumn: 'span 2', justifyContent: 'center' }} onClick={() => handleApplyFromInterested(job)}>I applied!</button>
                    </div>

                    {fit && showExplainForToApply === job.link && (
                      <div className="fade-in" style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(56, 189, 248, 0.05)', borderRadius: 10, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sky)', letterSpacing: 1, marginBottom: 6 }}>AI SCORING ANALYSIS</div>
                        <div style={{ fontSize: 13, lineHeight: 1.5, color: '#f0f0f0', marginBottom: 8 }}>{fit.reason}</div>
                        {fit.topSkillMatch && (
                          <div style={{ fontSize: 11, color: 'var(--emerald)' }}>✓ Top Match: {fit.topSkillMatch}</div>
                        )}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </div>
        )}
        {activeTab === 'submitted_applications' && (
          <SubmittedApplications
            companies={companies}
            applications={applications}
            onAddApplication={handleAddApplication}
            onUpdateApplication={handleUpdateApplication}
            draftApplication={draftApplication}
            onClearDraft={() => setDraftApplication(null)}
            cvBio={cvBio}
            onCvBioChange={setCvBio}
            onAddCV={handleAddSavedCV}
          />
        )}
        {activeTab === 'discovery' && (
          <Discovery
            companies={companies}
            onStatusChange={handleStatusChange}
            onAppliedChange={handleAppliedChange}
            onTalentCommunityChange={handleTalentCommunityChange}
            onNotesChange={handleNotesChange}
            onAddCompany={handleAddCompany}
            onUpdateCompany={handleUpdateCompany}
            onDeleteCompany={handleDeleteCompany}
            onInterestedJob={handleInterestedJob}
            onGenerateBrief={handleGenerateBrief}
            onApplyRegistryFixes={handleApplyRegistryFixes}
            jobBriefs={jobBriefs}
            onSaveContext={handleSaveContext}
            onScanCompanyJobs={handleScanSingleCompany}
          />
        )}
        {activeTab === 'interview_prep' && (
          <QuestionBank 
            questions={interviewQuestions}
            companies={companies}
            onAdd={handleAddInterviewQuestion}
            onDelete={handleDeleteInterviewQuestion}
            onUpdate={handleUpdateInterviewQuestion}
          />
        )}
        {activeTab === 'interviewer_coach' && (
          <InterviewerCoach
            questions={interviewerQuestions}
            companies={companies}
            applications={applications}
            cvBio={cvBio}
            onUpdate={(id: string, updates: Partial<InterviewerQuestion>) => setInterviewerQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q))}
          />
        )}

        {activeTab === 'tracker' && (
          <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
            <div className="page-header" style={{ marginBottom: 20 }}>
              <div>
                <div className="page-title">My Tracker</div>
                <div className="page-subtitle">Track applications, talent communities, and your pipeline</div>
              </div>
            </div>
            <Tracker
              companies={companies}
              applications={applications}
              onStatusChange={handleStatusChange}
              onAppliedChange={handleAppliedChange}
              onTalentCommunityChange={handleTalentCommunityChange}
            />
          </div>
        )}
        {activeTab === 'cv_bank' && (
          <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
            <div className="page-header" style={{ marginBottom: 20 }}>
              <div>
                <div className="page-title">CV Bank</div>
                <div className="page-subtitle">Your master bio and tailored CVs, used by the Interview Coach and when applying</div>
              </div>
            </div>
            <CVBank
              cvBio={cvBio}
              onCvBioChange={setCvBio}
              savedCVs={savedCVs}
              onAddCV={handleAddSavedCV}
              onDeleteCV={handleDeleteSavedCV}
              onUpdateCV={handleUpdateSavedCV}
            />
          </div>
        )}
        {activeTab === 'settings' && (
          <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
            <div className="page-header" style={{ marginBottom: 20 }}>
              <div>
                <div className="page-title">Settings</div>
                <div className="page-subtitle">Scoring, appearance, geo filters, and data</div>
              </div>
            </div>
            <Settings
              applications={applications}
              companies={companies}
              scoringProfile={scoringProfile}
              onScoringProfileChange={setScoringProfile}
              theme={theme}
              onThemeChange={setTheme}
              discardedJobs={discardedJobs}
              discardedTitles={discardedTitles}
              onRemoveDiscardedJob={handleRemoveDiscardedJob}
              onRemoveDiscardedTitle={handleRemoveDiscardedTitle}
              onClearDiscardedJobs={handleClearDiscardedJobs}
              onClearDiscardedTitles={handleClearDiscardedTitles}
            />
          </div>
        )}
      </main>

      {showManualModal && (
        <ManualJobModal 
          companies={companies}
          onClose={() => setShowManualModal(false)}
          onAdd={handleInterestedJob}
        />
      )}

      {applyAITarget && (
        <JobApplyModal 
          job={{ 
            title: applyAITarget.title, 
            companyName: applyAITarget.companyName, 
            description: applyAITarget.description,
            aiStrategy: applyAITarget.aiStrategy
          }} 
          cvBio={cvBio}
          savedCVs={savedCVs}
          onClose={() => setApplyAITarget(null)} 
          onSaveStrategy={(strategy) => {
            setInterestedJobs(prev => {
              const next = prev.map(j => j.id === applyAITarget.id ? { ...j, aiStrategy: strategy } : j);
              const updated = next.find(j => j.id === applyAITarget.id);
              if (updated) setApplyAITarget(updated);
              return next;
            });
          }}
        />
      )}
    </div>
  );
}

export default App
