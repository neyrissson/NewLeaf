import { useState, useMemo } from 'react';
import type { Company, Industry } from '../data/jobs';
import { INDUSTRY_TAG, INDUSTRY_EMOJI } from '../data/jobs';
import { buildMatcher, loadNegative, loadPositive, getFilterReason, getMatchedPositiveKeywords, FILTER_REASON_LABEL } from '../utils/jobFilter';
import { enrichLocation } from '../utils/geoFilter';
import { loadGeoAllowed, loadProvincesAllowed } from '../utils/geoConfig';

interface FitScore { score: number; reason: string; topSkillMatch?: string; }

interface Props {
  companies: Company[];
  onClearAll: () => void;
  onDiscardJob: (link: string, title?: string) => void;
  onFastApply: (companyId: string, jobTitle: string, jobUrl?: string) => void;
  onInterestedJob: (companyId: string, companyName: string, title: string, link: string, dateDiscovered: string, description?: string, location?: string) => void;
  jobBriefs?: Record<string, { important: string, keywords: string[] }>;
  onGenerateBrief?: (job: {link: string, title: string, companyId: string, description?: string}) => void;
  generatingBriefId?: string | null;
  newJobLinks?: Set<string>;
  cvBio?: string;
  fitScores?: Record<string, FitScore>;
  onRescoreFits?: (clearExisting: boolean) => void;
  onScoreJob?: (link: string) => void;
  takenLinks?: Set<string>;
  takenTitleKeys?: Set<string>;
  onAddJobDescription?: (companyId: string, link: string, description: string) => void;
  onMarkAsJob?: (companyId: string, link: string) => void;
  onUndoDiscard?: () => void;
  undoCount?: number;
}

export function JobOpenings({ companies, onClearAll, onDiscardJob, onFastApply, onInterestedJob, jobBriefs = {}, onGenerateBrief, generatingBriefId, newJobLinks = new Set(), fitScores = {}, onRescoreFits, onScoreJob, takenLinks = new Set(), takenTitleKeys = new Set(), onAddJobDescription, onMarkAsJob, onUndoDiscard, undoCount = 0 }: Props) {
  const [filterIndustry, setFilterIndustry] = useState<string>('All');
  const [filterCompany, setFilterCompany] = useState<string>('All');
  const [filterNew, setFilterNew] = useState(false);
  const [minScore, setMinScore] = useState<number>(0); // -1 = unscored only
  const [sortBy, setSortBy] = useState<'date' | 'fit' | 'company' | 'title'>('company');
  const [search, setSearch] = useState('');
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [showExplainFor, setShowExplainFor] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<'scorable' | 'nodesc' | 'dismissed' | null>(null);
  const [addDescFor, setAddDescFor] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState('');
  const [showIssuesModal, setShowIssuesModal] = useState(false);

  // Pre-scoring filters (loaded once per mount; edited in Settings)
  const negRe = useMemo(() => buildMatcher(loadNegative()), []);
  const posRe = useMemo(() => buildMatcher(loadPositive()), []);
  // Accepted work locations — read fresh each time the Job Feed opens, so a change in Settings
  // re-sorts jobs between Scorable and Dismissed.
  const geo = useMemo(() => ({ extra: loadGeoAllowed(), provinces: loadProvincesAllowed() }), []);

  const handleInterest = (j: any) => {
    onInterestedJob(j.company.id, j.company.name, j.title, j.link, j.dateDiscovered, undefined, j.location);
    setJustAdded(prev => [...prev, j.link]);
  };

  const normTitle = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Hide jobs already saved to "To Apply" or already applied to
  const isTaken = (j: { link: string; title: string; company: { id: string } }) =>
    takenLinks.has(j.link) || takenTitleKeys.has(`${j.company.id}::${normTitle(j.title)}`);

  const allJobs = useMemo(() => companies.flatMap(c =>
    (c.scrapedJobs || []).map(j => ({ ...j, company: c }))
  ).filter(j => !isTaken(j)), [companies, takenLinks, takenTitleKeys]);

  const q = search.trim().toLowerCase();
  const jobs = useMemo(() => allJobs
    .filter(j =>
      (filterIndustry === 'All' || j.company.industry === filterIndustry) &&
      (filterCompany === 'All' || j.company.id === filterCompany) &&
      (!filterNew || newJobLinks.has(j.link)) &&
      (minScore === -1 ? !fitScores[j.link] : (minScore === 0 || (fitScores[j.link]?.score ?? -1) >= minScore)) &&
      (!q || (j.title || '').toLowerCase().includes(q) || (j.company.name || '').toLowerCase().includes(q) || (j.location || '').toLowerCase().includes(q))
    )
    .sort((a, b) => {
      if (sortBy === 'fit') {
        const sa = fitScores[a.link]?.score ?? -1;
        const sb = fitScores[b.link]?.score ?? -1;
        return sb - sa;
      }
      if (sortBy === 'company') return a.company.name.localeCompare(b.company.name);
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      return 0;
    }), [allJobs, filterIndustry, filterCompany, filterNew, newJobLinks, minScore, fitScores, q, sortBy]);

  // Three buckets, decided purely by the filters (a job's score just displays in
  // whichever bucket it lands — a dismissed role stays dismissed even if it was scored):
  //  • scorable  → main feed; "Score Unscored" scores these
  //  • nodesc    → "Needs a description" (passed role filter, no JD to judge — paste one to promote)
  //  • role/offtopic/location → "Dismissed" (wrong-function title, JD with no relevant keyword,
  //    or outside your accepted work locations)
  const filterReasonFor = (j: any) => getFilterReason(j, negRe, posRe, geo);
  // Bucketed in one pass (each job's reason is computed once, not once per bucket).
  const { mainJobs, unscorableJobs, dismissedJobs } = useMemo(() => {
    const main: any[] = [], nodesc: any[] = [], dismissed: any[] = [];
    for (const j of jobs) {
      const r = getFilterReason(j, negRe, posRe, geo);
      if (r === null) main.push(j);
      else if (r === 'nodesc') nodesc.push(j);
      else if (r === 'role' || r === 'offtopic' || r === 'language' || r === 'notjob' || r === 'location') dismissed.push(j);
    }
    return { mainJobs: main, unscorableJobs: nodesc, dismissedJobs: dismissed };
  }, [jobs, negRe, posRe, geo]);

  const getFitColor = (score: number) => {
    if (score >= 75) return '#10b981';
    if (score >= 55) return '#fbbf24';
    if (score >= 35) return '#f97316';
    return '#ef4444';
  };

  const renderCard = (job: any, idx: number, reason?: string | null) => {
    const fit = fitScores[job.link];
    const isNew = newJobLinks.has(job.link);
    return (
      <div key={`${job.company.id}-${idx}`} className="elite-job-card fade-in" style={{ position: 'relative', opacity: reason ? 0.82 : 1 }}>
        <button
          onClick={() => onDiscardJob(job.link, job.title)}
          title="Delete this listing (undoable)"
          style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
          onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(239,68,68,0.9)'; (e.target as HTMLElement).style.color = '#fff'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; (e.target as HTMLElement).style.color = '#ef4444'; }}
        >✕</button>
        {isNew && (
          <div style={{ position: 'absolute', top: 8, right: 34, background: '#10b981', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6, letterSpacing: '0.05em' }}>NEW</div>
        )}
        {reason && reason !== 'nodesc' && (
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginBottom: 6 }}>
            {FILTER_REASON_LABEL[reason as keyof typeof FILTER_REASON_LABEL] || 'Filtered'}
          </div>
        )}
        {reason === 'nodesc' && (
          <div style={{ marginBottom: 6 }}>
            {addDescFor === job.link ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  className="input"
                  rows={4}
                  autoFocus
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  placeholder="Paste the job description here…"
                  style={{ fontFamily: 'inherit', fontSize: 12, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-xs" style={{ fontSize: 10, padding: '2px 8px' }}
                    onClick={() => { if (descDraft.trim().length > 20) { onAddJobDescription?.(job.company.id, job.link, descDraft.trim()); } setAddDescFor(null); setDescDraft(''); }}>
                    Save description
                  </button>
                  <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, padding: '2px 8px', color: 'var(--text-muted)' }}
                    onClick={() => { setAddDescFor(null); setDescDraft(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, padding: '2px 8px', color: 'var(--sky)', border: '1px solid rgba(56,189,248,0.3)' }}
                onClick={() => { setAddDescFor(job.link); setDescDraft(''); }}>
                ＋ Paste description to make it scorable
              </button>
            )}
          </div>
        )}
        {reason === 'notjob' && (
          <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, padding: '2px 8px', marginBottom: 6, color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.35)' }}
            title="Move this into Scorable and remember it for next time"
            onClick={() => onMarkAsJob?.(job.company.id, job.link)}>
            ✓ This is a job
          </button>
        )}
        {reason === undefined && import.meta.env.VITE_DEMO_MODE === 'true' && (() => {
          const matched = getMatchedPositiveKeywords(job.description || '', posRe);
          if (matched.length === 0) return null;
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>WHY IT'S HERE:</span>
              {matched.slice(0, 6).map(kw => (
                <span key={kw} style={{ fontSize: 10, fontWeight: 700, background: 'rgba(16,185,129,0.1)', color: 'var(--emerald)', border: '1px solid rgba(16,185,129,0.25)', padding: '1px 6px', borderRadius: 5 }}>{kw}</span>
              ))}
            </div>
          );
        })()}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0, paddingRight: 30 }}>
          <span className={`tag ${INDUSTRY_TAG[job.company.industry as Industry]}`}>{job.company.industry}</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{INDUSTRY_EMOJI[job.company.industry as Industry]} {job.company.name}</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 2, lineHeight: 1.25 }}>
          {job.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            🕒 {job.dateDiscovered || 'Just now'}
          </div>
          {fit && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 36, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${fit.score}%`, background: getFitColor(fit.score), borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: getFitColor(fit.score) }}>{fit.score}%</span>
                <button className="btn btn-ghost btn-xs" onClick={(e) => { e.preventDefault(); onScoreJob?.(job.link); }} style={{ fontSize: 9, padding: '0 4px', height: 16, minHeight: 16, color: 'var(--text-muted)' }}>
                  ↻ Re-score
                </button>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.preventDefault(); setShowExplainFor(showExplainFor === job.link ? null : job.link); }} style={{ fontSize: 9, padding: '0', height: 14, minHeight: 14, color: 'var(--sky)' }}>
                Explain my score
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, marginTop: 4 }}>
          {job.location && (
            <span
              className="tag"
              style={
                job.location.toLowerCase().includes('remote')
                  ? { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 6 }
                  : { background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 6 }
              }
            >
              📍 {enrichLocation(job.location)}
            </span>
          )}
          {!fit && onScoreJob && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={(e) => { e.preventDefault(); onScoreJob(job.link); }}
              style={{ fontSize: 10, padding: '0 6px', height: 20, minHeight: 20 }}
            >
              {reason ? '✨ Score anyway' : '✨ Score'}
            </button>
          )}
        </div>

        <div className="job-button-grid">
          <a href={job.link} target="_blank" rel="noreferrer" className="btn btn-outline-gold btn-sm" style={{ justifyContent: 'center' }}>
            View opening
          </a>
          {justAdded.includes(job.link) ? (
            <div className="btn btn-sm" style={{ background: 'var(--accent-glow)', color: 'var(--accent-2)', border: '1px solid var(--accent)', cursor: 'default', justifyContent: 'center' }}>
              Queued ✓
            </div>
          ) : (
            <button className="btn btn-outline-gold btn-sm" style={{ justifyContent: 'center' }} onClick={() => handleInterest(job)}>
              I want to apply
            </button>
          )}
          <button
            className="btn btn-glow btn-sm"
            style={{ justifyContent: 'center', opacity: generatingBriefId === job.link ? 0.6 : 1 }}
            onClick={() => onGenerateBrief?.({link: job.link, title: job.title, companyId: job.company.id, description: job.description})}
            disabled={!!generatingBriefId}
          >
            {generatingBriefId === job.link ? '🧠 Analyzing...' : '💡 Strategic Brief'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }} onClick={() => onFastApply(job.company.id, job.title, job.link)}>
            I applied!
          </button>
        </div>

        {fit && showExplainFor === job.link && (
          <div className="fade-in" style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(56, 189, 248, 0.05)', borderRadius: 10, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sky)', letterSpacing: 1, marginBottom: 6 }}>AI SCORING ANALYSIS</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#f0f0f0', marginBottom: 8 }}>{fit.reason}</div>
            {fit.topSkillMatch && (
              <div style={{ fontSize: 11, color: 'var(--emerald)' }}>✓ Top Match: {fit.topSkillMatch}</div>
            )}
          </div>
        )}

        {jobBriefs[job.link] && (
          <div className="fade-in" style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(251, 191, 36, 0.05)', borderRadius: 10, border: '1px solid rgba(251, 191, 36, 0.2)' }}>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#e0e0e0', marginBottom: 8 }}>
              {jobBriefs[job.link].important}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {jobBriefs[job.link].keywords.map((kw: string) => (
                <span key={kw} style={{ fontSize: 10, background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>#{kw.toUpperCase()}</span>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  };

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="page-title">Job Feed</div>
          <div className="page-subtitle">matching roles discovered by the scraper</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search title / company / location…"
              style={{ width: 240, paddingRight: search ? 26 : 10 }}
            />
            {search && (
              <button onClick={() => setSearch('')} title="Clear search"
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            )}
          </div>
          <select
            className="input select"
            value={filterIndustry}
            onChange={e => setFilterIndustry(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="All">All Industries</option>
            {[...new Set(allJobs.map(j => j.company.industry))].sort().map(i => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <select
            className="input select"
            value={filterCompany}
            onChange={e => setFilterCompany(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="All">All Companies</option>
            {[...new Set(allJobs.map(j => j.company.name))].sort().map(n => (
              <option key={n} value={companies.find(c => c.name === n)?.id || n}>{n}</option>
            ))}
          </select>
          <select
            className="input select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'date' | 'fit' | 'company' | 'title')}
            style={{ width: 'auto' }}
          >
            <option value="company">Sort: A → Z (Company)</option>
            <option value="title">Sort: A → Z (Job title)</option>
            <option value="fit">Sort: Best Fit %</option>
            <option value="date">Sort: Latest first</option>
          </select>
          <select
            className="input select"
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            style={{ width: 'auto' }}
          >
            <option value={0}>All Scores</option>
            <option value={-1}>Unscored only</option>
            <option value={80}>Fit Score ≥ 80%</option>
            <option value={70}>Fit Score ≥ 70%</option>
            <option value={60}>Fit Score ≥ 60%</option>
            <option value={50}>Fit Score ≥ 50%</option>
          </select>
          {newJobLinks.size > 0 && (
            <button
              className={`btn btn-sm ${filterNew ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterNew(v => !v)}
              style={filterNew ? { background: '#10b981', color: '#fff', borderColor: '#10b981' } : { borderColor: '#10b981', color: '#10b981' }}
            >
              🆕 New ({newJobLinks.size})
            </button>
          )}
          {onRescoreFits && allJobs.length > 0 && (() => {
            // Progress + "Score Unscored" only concern the SCORABLE jobs (main feed)
            const scorableAll = allJobs.filter(j => getFilterReason(j, negRe, posRe, geo) === null);
            const scoredCount = scorableAll.filter(j => fitScores[j.link]).length;
            const total = scorableAll.length;
            const allScored = scoredCount >= total;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {!allScored && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 48, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(scoredCount / total) * 100}%`, background: '#d4af37', borderRadius: 2, transition: 'width 0.5s' }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{scoredCount}/{total} scored</span>
                  </div>
                )}
                {!allScored && (
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Score all unscored jobs right now"
                    onClick={() => onRescoreFits(false)}
                    style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px' }}
                  >
                    ✨ Score Unscored
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  title="Wipe existing scores and re-score all jobs"
                  onClick={() => onRescoreFits(true)}
                  style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px' }}
                >
                  🔄 Re-score All
                </button>
              </div>
            );
          })()}
          {undoCount > 0 && onUndoDiscard && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--emerald)', borderColor: 'rgba(16,185,129,0.4)' }} onClick={onUndoDiscard} title="Restore the last deleted listing (⌘Z)">
              ↩ Undo delete ({undoCount})
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)' }} onClick={onClearAll}>
            Clear All
          </button>
        </div>
      </div>

      {/* Scan issues summary — always one line; click to see the full list */}
      {(() => {
        const issues = companies.filter(c =>
          c.lastScanResult && c.lastScanResult.count === 0 && (c.careerPage || c.website)
        );
        if (issues.length === 0) return null;
        return (
          <button
            onClick={() => setShowIssuesModal(true)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', marginBottom: 16, padding: '10px 14px',
              background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: 10,
              fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}
          >
            <span style={{ color: '#fbbf24', fontWeight: 700, marginRight: 8 }}>⚠️ {issues.length} companies returned 0 results last scan</span>
            <span style={{ marginLeft: 8, color: 'var(--accent)', textDecoration: 'underline' }}>View full list →</span>
          </button>
        );
      })()}

      {showIssuesModal && (() => {
        const issues = companies.filter(c =>
          c.lastScanResult && c.lastScanResult.count === 0 && (c.careerPage || c.website)
        );
        return (
          <div className="modal-overlay" onClick={() => setShowIssuesModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
              <div className="modal-header">
                <div className="page-title" style={{ fontSize: 18 }}>⚠️ {issues.length} companies returned 0 results</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowIssuesModal(false)}>✕</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
                {issues.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                      {c.lastScanResult?.error ? <span>⚡ {c.lastScanResult.error}</span> : 'Timed out or no matching jobs found'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {mainJobs.length === 0 && unscorableJobs.length === 0 && dismissedJobs.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 80 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🕸️</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>No jobs discovered yet.</div>
          <div style={{ fontSize: 15, marginTop: 4 }}>Click "Scan for Jobs" in the top bar to run the background scraper.</div>
        </div>
      ) : (
        <>
          {/* Category tiles — pick one to reveal its jobs. Border color is the primary
              identifier (gold/white/rose) rather than an icon. */}
          {(() => {
            const tabs: { id: 'scorable' | 'nodesc' | 'dismissed'; label: string; desc: string; count: number; color: string }[] = [
              { id: 'scorable', label: 'Scorable', desc: 'Ready to be scored', count: mainJobs.length, color: 'var(--accent)' },
              { id: 'nodesc', label: 'Needs description', desc: 'No JD to judge relevance yet', count: unscorableJobs.length, color: '#f1f5f9' },
              { id: 'dismissed', label: 'Dismissed', desc: 'Off-target role or keywords', count: dismissedJobs.length, color: 'var(--rose)' },
            ];
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
                {tabs.map(t => {
                  const active = feedTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setFeedTab(active ? null : t.id)}
                      style={{
                        cursor: 'pointer', textAlign: 'left', borderRadius: 14, padding: '18px 20px',
                        background: active ? `${t.color}1a` : 'var(--surface-2)',
                        border: `1.5px solid ${t.color}`,
                        opacity: active ? 1 : 0.72,
                        boxShadow: active ? `0 0 0 1px ${t.color}33, 0 8px 24px rgba(0,0,0,0.25)` : 'none',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: 24, fontWeight: 800, color: t.color }}>{t.count}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6, color: t.color }}>{t.label}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{t.desc}</div>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {feedTab === null ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>
              Pick a category above to view its jobs.
            </div>
          ) : (
            <>
              {feedTab === 'nodesc' && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Passed the role filter, but have no job description to judge relevance. Paste a description on a card to make it scorable.
                </div>
              )}
              {feedTab === 'dismissed' && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Off-target role, or a description with none of your relevance keywords. Not scored automatically — use "Score anyway" to override. Nothing is deleted.
                </div>
              )}

              {(() => {
                const active = feedTab === 'scorable' ? mainJobs : feedTab === 'nodesc' ? unscorableJobs : dismissedJobs;
                if (active.length === 0) {
                  return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '30px 0', textAlign: 'center' }}>Nothing in this tab.</div>;
                }
                return (
                  <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                    {active.map((job, idx) => renderCard(job, idx, feedTab === 'scorable' ? undefined : (feedTab === 'nodesc' ? 'nodesc' : filterReasonFor(job))))}
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}

