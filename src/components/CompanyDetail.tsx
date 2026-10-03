import { useState } from 'react';
import type { Company, JobStatus } from '../data/jobs';
import { STATUS_LABELS, INDUSTRY_TAG, INDUSTRY_EMOJI } from '../data/jobs';
import glassdoorIcon from '../assets/icons/glassdoor.svg';
import indeedIcon from '../assets/icons/indeed.svg';
import linkedinIcon from '../assets/icons/linkedin.svg';

interface CompanyDetailProps {
  company: Company;
  onStatusChange: (id: string, status: JobStatus | undefined) => void;
  onAppliedChange: (id: string, applied: boolean) => void;
  onTalentCommunityChange: (id: string, joined: boolean) => void;
  onNotesChange: (id: string, notes: string) => void;
  onUpdateCompany: (id: string, updates: Partial<Company>) => void;
  onDeleteCompany: (id: string) => void;
  onInterestedJob: (companyId: string, companyName: string, title: string, link: string, dateDiscovered: string, description?: string, location?: string) => void;
  jobBriefs?: Record<string, { important: string, keywords: string[] }>;
  onGenerateBrief?: (job: {link: string, title: string, companyId: string, description?: string}) => void;
  onSaveContext?: (id: string, context: string) => void;
  onScanJobs?: (company: Company) => Promise<void>;
}

const STATUSES: (JobStatus | 'none')[] = ['none', 'interested', 'applied', 'interviewing', 'offer', 'rejected'];

export function CompanyDetail({
  company,
  onStatusChange,
  onAppliedChange,
  onTalentCommunityChange,
  onNotesChange,
  onUpdateCompany,
  onDeleteCompany,
  onInterestedJob,
  onSaveContext,
  onScanJobs,
}: CompanyDetailProps) {
  const [manualTitle, setManualTitle] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Edit states
  const [editName, setEditName] = useState(company.name);
  const [editIndustry, setEditIndustry] = useState(company.industry);
  const [editWebsite, setEditWebsite] = useState(company.website || '');
  const [editCareerPage, setEditCareerPage] = useState(company.careerPage || '');
  const [editOpenApp, setEditOpenApp] = useState(company.openApplicationUrl || '');
  const [editLinkedin, setEditLinkedin] = useState(company.linkedinUrl || '');
  const [editIndeed, setEditIndeed] = useState(company.indeedUrl || '');
  const [editGlassdoor, setEditGlassdoor] = useState(company.glassdoorUrl || '');
  const [editPortalUrl, setEditPortalUrl] = useState(company.applicationPortalUrl || '');
  const [editPortalUser, setEditPortalUser] = useState(company.portalUsername || '');
  const [editPortalNote, setEditPortalNote] = useState(company.portalNote || '');

  const [proposedUpdates, setProposedUpdates] = useState<Partial<Company> | null>(null);

  const industries = Object.keys(INDUSTRY_EMOJI);

  const handleManualSave = () => {
    if (!manualTitle.trim()) return;
    onInterestedJob(company.id, company.name, manualTitle.trim(), manualLink.trim() || company.careerPage || company.website || '', new Date().toLocaleDateString('en-CA'), manualDescription);
    setManualTitle('');
    setManualLink('');
    setManualDescription('');
    setShowManualForm(false);
  };

  const [isSearchingInfo, setIsSearchingInfo] = useState(false);
  const handleSearchMissingInfo = async () => {
    setIsSearchingInfo(true);

    const getValidUrl = (url?: string) => {
      if (!url || typeof url !== 'string' || url.toLowerCase() === 'n/a' || url.toLowerCase() === 'none') return '';
      if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`;
      return url;
    };

    try {
      const updates: Partial<Company> = {};
      let notesAppend = '';
      let fullContext = '';

      // @ts-ignore
      const runSearch = async (query: string) => await window.electron.searchWeb(query + " Canada");

      // Always scan even if links exist (Force Refresh)
      const websiteRes = await runSearch(`${company.name} official website`);
      if (websiteRes?.url) updates.website = getValidUrl(websiteRes.url);
      if (websiteRes?.snippet) fullContext += " " + websiteRes.snippet;

      const careersRes = await runSearch(`${company.name} careers`);
      if (careersRes?.url) updates.careerPage = getValidUrl(careersRes.url);
      if (careersRes?.snippet) fullContext += " " + careersRes.snippet;

      const linkedinRes = await runSearch(`${company.name} LinkedIn company`);
      if (linkedinRes?.url && linkedinRes.url.includes('linkedin.com')) updates.linkedinUrl = getValidUrl(linkedinRes.url);
      if (linkedinRes?.snippet) fullContext += " " + linkedinRes.snippet;

      const indeedRes = await runSearch(`${company.name} Indeed`);
      if (indeedRes?.url && indeedRes.url.includes('indeed.')) {
         updates.indeedUrl = getValidUrl(indeedRes.url);
         if (indeedRes.snippet) {
            notesAppend += `\n[Indeed] ${indeedRes.snippet}`;
            fullContext += " " + indeedRes.snippet;
         }
      }

      const glassdoorRes = await runSearch(`${company.name} Glassdoor`);
      if (glassdoorRes?.url && glassdoorRes.url.includes('glassdoor.')) {
         updates.glassdoorUrl = getValidUrl(glassdoorRes.url);
         if (glassdoorRes.snippet) {
            notesAppend += `\n[Glassdoor] ${glassdoorRes.snippet}`;
            fullContext += " " + glassdoorRes.snippet;
         }
      }

      if (onSaveContext && fullContext.trim()) {
         onSaveContext(company.id, fullContext.trim());
      }

      if (notesAppend) {
         // Strip any previously appended [Indeed]/[Glassdoor] lines so we don't duplicate on refresh
         const existingNotes = (company.notes || '')
           .split('\n')
           .filter(line => !line.startsWith('[Indeed]') && !line.startsWith('[Glassdoor]'))
           .join('\n')
           .trim();
         updates.notes = (existingNotes ? existingNotes + '\n' : '') + notesAppend.trim();
         
         // Sense check: If industry is Biotech but snippets look like advertising/marketing
         if (company.industry === 'Biotech') {
            const lowNotes = (notesAppend + (company.notes || '') + fullContext).toLowerCase();
            if (lowNotes.includes('advertising') || lowNotes.includes('creative agency') || lowNotes.includes('marketing') || lowNotes.includes('branding')) {
               updates.industry = 'Marketing'; 
            } else if (lowNotes.includes('bank') || lowNotes.includes('investment') || lowNotes.includes('finance')) {
               updates.industry = 'Finance';
            }
         }
      }

      if (Object.keys(updates).length > 0) {
        setProposedUpdates(updates);
      } else {
        alert("No new information found for this company.");
      }
    } catch (e) {
      console.error("Missing info search failed", e);
    }
    setIsSearchingInfo(false);
  };

  const handleApplyProposed = (field: keyof Company) => {
    if (!proposedUpdates) return;
    const value = proposedUpdates[field];
    onUpdateCompany(company.id, { [field]: value });
    
    // Remove from proposed
    const next = { ...proposedUpdates };
    delete next[field];
    setProposedUpdates(Object.keys(next).length > 0 ? next : null);
  };
  const safeUrl = (url?: string) => {
    if (!url) return '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`;
    return url;
  };

  return (
    <div className="detail-panel fade-in">
      <div className="detail-header">
        {isEditing ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input" style={{ flex: 2, fontSize: 18, fontWeight: 700 }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Company Name" />
              <select className="input select" style={{ flex: 1 }} value={editIndustry} onChange={e => setEditIndustry(e.target.value as any)}>
                {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input" style={{ flex: 1 }} value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="🌐 Website URL" />
              <input className="input" style={{ flex: 1 }} value={editCareerPage} onChange={e => setEditCareerPage(e.target.value)} placeholder="📋 Careers URL" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input" style={{ flex: 1 }} value={editOpenApp} onChange={e => setEditOpenApp(e.target.value)} placeholder="✨ Talent Community URL" />
              <input className="input" style={{ flex: 1 }} value={editLinkedin} onChange={e => setEditLinkedin(e.target.value)} placeholder="🔗 LinkedIn URL" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input" style={{ flex: 1 }} value={editIndeed} onChange={e => setEditIndeed(e.target.value)} placeholder="💼 Indeed URL" />
              <input className="input" style={{ flex: 1 }} value={editGlassdoor} onChange={e => setEditGlassdoor(e.target.value)} placeholder="⭐ Glassdoor URL" />
            </div>
            <div style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>🔑 Application status portal</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <input className="input" style={{ flex: 2 }} value={editPortalUrl} onChange={e => setEditPortalUrl(e.target.value)} placeholder="🔗 'My account' / portal login URL" />
                <input className="input" style={{ flex: 1 }} value={editPortalUser} onChange={e => setEditPortalUser(e.target.value)} placeholder="✉️ email / username used" />
              </div>
              <input className="input" style={{ width: '100%' }} value={editPortalNote} onChange={e => setEditPortalNote(e.target.value)} placeholder="Note (e.g. signed in with Google) — do NOT store your password here" />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, opacity: 0.75 }}>
                🔒 Let your browser/OS password manager fill the password when you open the portal — passwords aren't stored in NewLeaf (they'd end up in plain text in your backups).
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="detail-company">
              <span className={`tag ${INDUSTRY_TAG[company.industry]}`} style={{ marginRight: 8 }}>
                {company.industry}
              </span>
              {company.name}
            </div>
            <div className="detail-title">
              {INDUSTRY_EMOJI[company.industry]} {company.name}
            </div>
          </>
        )}
        <div className="detail-actions">
          {company.careerPage && (
            <a className="btn btn-primary btn-sm" href={safeUrl(company.careerPage)} target="_blank" rel="noreferrer" id={`career-${company.id}`} style={{ background: '#d4af37', color: '#000' }}>
              📋 Careers Page
            </a>
          )}
          {company.applicationPortalUrl && (
            <a className="btn btn-ghost btn-sm" href={safeUrl(company.applicationPortalUrl)} target="_blank" rel="noreferrer"
               title={[company.portalUsername && `Account: ${company.portalUsername}`, company.portalNote].filter(Boolean).join(' — ') || 'Check your application status'}
               style={{ borderColor: 'var(--sky)', color: 'var(--sky)' }}>
              🔑 My Application{company.portalUsername ? ` (${company.portalUsername})` : ''}
            </a>
          )}
          {company.website && (
            <a className="btn btn-ghost btn-sm" href={safeUrl(company.website)} target="_blank" rel="noreferrer" id={`website-${company.id}`}>
              🌐 Website
            </a>
          )}
          {company.linkedinUrl && (
            <a className="btn btn-ghost btn-sm" href={safeUrl(company.linkedinUrl)} target="_blank" rel="noreferrer" id={`linkedin-${company.id}`}>
              <img src={linkedinIcon} alt="LinkedIn" style={{ height: 14, marginRight: 6 }} /> LinkedIn
            </a>
          )}
          {company.indeedUrl && (
            <a href={safeUrl(company.indeedUrl)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ color: '#d4af37', borderColor: '#d4af37' }}>
              <img src={indeedIcon} alt="Indeed" style={{ height: 14, marginRight: 6 }} /> Indeed {company.indeedRating ? `(${company.indeedRating} ★)` : ''}
            </a>
          )}
          {company.glassdoorUrl && (
            <a href={safeUrl(company.glassdoorUrl)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ color: '#d4af37', borderColor: '#d4af37' }}>
              <img src={glassdoorIcon} alt="Glassdoor" style={{ height: 14, marginRight: 6 }} /> Glassdoor {company.glassdoorRating ? `(${company.glassdoorRating} ★)` : ''}
            </a>
          )}
          {company.openApplicationUrl && (
            <a href={safeUrl(company.openApplicationUrl)} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ background: 'var(--accent)', color: '#000', boxShadow: '0 2px 10px rgba(212,175,55,0.3)' }}>
              ✨ Talent Community
            </a>
          )}
          <button 
            className="btn btn-ghost btn-sm" 
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            onClick={handleSearchMissingInfo}
            disabled={isSearchingInfo}
            title="Scan the web to fill missing links or update existing ones"
          >
            {isSearchingInfo ? '🔍 Refreshing Web Info...' : '🔍 Refresh Web Info'}
          </button>
          
          {onScanJobs && (
            <button 
              className="btn btn-primary btn-sm" 
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', fontWeight: 700 }}
              onClick={() => onScanJobs(company)}
              title="Scan this company's career page for job openings"
            >
              ⚡ Scan jobs
            </button>
          )}
          

          <button 
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (isEditing) {
                onUpdateCompany(company.id, {
                  name: editName,
                  industry: editIndustry as any,
                  website: editWebsite,
                  careerPage: editCareerPage,
                  openApplicationUrl: editOpenApp,
                  linkedinUrl: editLinkedin,
                  indeedUrl: editIndeed,
                  glassdoorUrl: editGlassdoor,
                  applicationPortalUrl: editPortalUrl.trim(),
                  portalUsername: editPortalUser.trim(),
                  portalNote: editPortalNote.trim()
                });
              } else {
                setEditName(company.name);
                setEditIndustry(company.industry);
                setEditWebsite(company.website || '');
                setEditCareerPage(company.careerPage || '');
                setEditOpenApp(company.openApplicationUrl || '');
                setEditLinkedin(company.linkedinUrl || '');
                setEditIndeed(company.indeedUrl || '');
                setEditGlassdoor(company.glassdoorUrl || '');
                setEditPortalUrl(company.applicationPortalUrl || '');
                setEditPortalUser(company.portalUsername || '');
                setEditPortalNote(company.portalNote || '');
              }
              setIsEditing(!isEditing);
            }}
            style={{ borderColor: isEditing ? 'var(--emerald)' : 'var(--border)', color: isEditing ? 'var(--emerald)' : 'var(--text)' }}
          >
            {isEditing ? '💾 Save Changes' : '✏️ Edit Company'}
          </button>
          
          {!isEditing && (
            <button 
              className="btn btn-ghost btn-sm" 
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }} 
              onClick={() => onDeleteCompany(company.id)}
              title="Permanently remove this company and all its data"
            >
              🗑️ Delete
            </button>
          )}

          {isEditing && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setIsEditing(false)}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="detail-body">
        {proposedUpdates && (
          <div className="fade-in elite-card-gold" style={{ marginBottom: 20, padding: 16, border: '1px solid var(--accent)', background: 'rgba(212, 175, 55, 0.08)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
               <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>✨ SUGGESTED UPDATES</div>
               <button className="btn btn-ghost btn-sm" style={{ height: 20, fontSize: 10 }} onClick={() => setProposedUpdates(null)}>Dismiss All</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(proposedUpdates).map(([key, val]) => {
                if (key === 'notes') return null; // We append notes anyway usually
                const isIndustry = key === 'industry';
                const currentVal = (company as any)[key];
                
                // Portal check: Warning if overwriting a portal
                const isCurrentPortal = typeof currentVal === 'string' && (currentVal.includes('greenhouse.io') || currentVal.includes('lever.co') || currentVal.includes('workday.com'));
                
                return (
                  <div key={key} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, marginRight: 15 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{key}</div>
                      <div style={{ fontSize: 13, color: '#fff', wordBreak: 'break-all' }}>
                        {isIndustry ? `${(INDUSTRY_EMOJI as any)[val as any] || '🏢'} ${val}` : String(val)}
                      </div>
                      {isCurrentPortal && (
                         <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 4, fontWeight: 700 }}>⚠️ Warning: This will replace your current job portal link.</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button 
                        className="btn btn-primary btn-sm" 
                        style={{ background: 'var(--accent)', color: '#000', padding: '4px 12px' }}
                        onClick={() => handleApplyProposed(key as keyof Company)}
                      >
                        Accept
                      </button>
                      <button 
                        className="btn btn-ghost btn-sm" 
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => {
                          const next = { ...proposedUpdates };
                          delete next[key as keyof Company];
                          setProposedUpdates(Object.keys(next).length > 0 ? next : null);
                        }}
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Key info */}
        <section>
          <div className="detail-section-title">Overview</div>
          <div className="detail-grid">
            <div className="detail-kv">
              <div className="detail-kv-key">🏭 Industry</div>
              <div className="detail-kv-val">{company.industry}</div>
            </div>
            <div className="detail-kv">
              <div className="detail-kv-key">⭐ Indeed Rating</div>
              <div className="detail-kv-val">{company.indeedRating ? `${company.indeedRating.toFixed(1)} / 5.0` : 'N/A'}</div>
            </div>
            {company.possibleContact && (
              <div className="detail-kv">
                <div className="detail-kv-key">👤 Contact</div>
                <div className="detail-kv-val">{company.possibleContact}</div>
              </div>
            )}
            {company.coldCallEmail && (
              <div className="detail-kv">
                <div className="detail-kv-key">📧 Cold Email</div>
                <div className="detail-kv-val">
                  <a href={`mailto:${company.coldCallEmail}`} style={{ color: 'var(--accent-2)', textDecoration: 'none' }}>
                    {company.coldCallEmail}
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Status & tracking checkboxes */}
        <section>
          <div className="detail-section-title">Engagement</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Pipeline status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Pipeline status:</label>
              <select
                className="input select"
                style={{ width: 'auto', fontSize: 13 }}
                value={company.status ?? 'none'}
                onChange={e => {
                  const val = e.target.value;
                  onStatusChange(company.id, val === 'none' ? undefined : val as JobStatus);
                }}
                id={`status-select-${company.id}`}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>
                    {s === 'none' ? '— No status —' : STATUS_LABELS[s as JobStatus]}
                  </option>
                ))}
              </select>
            </div>

            {/* Applied checkbox */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={company.applied}
                onChange={e => onAppliedChange(company.id, e.target.checked)}
                id={`applied-check-${company.id}`}
                style={{ width: 17, height: 17, marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: company.applied ? 'var(--emerald)' : 'var(--text)' }}>
                  {company.applied ? '✅ Application submitted' : 'I submitted a job application here'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Check this when you've applied to a specific job posting at this company
                </div>
              </div>
            </label>

            {/* Talent community checkbox */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={company.talentCommunity}
                onChange={e => onTalentCommunityChange(company.id, e.target.checked)}
                id={`talent-community-check-${company.id}`}
                style={{ width: 17, height: 17, marginTop: 2, accentColor: 'var(--sky)', cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: company.talentCommunity ? 'var(--sky)' : 'var(--text)' }}>
                  {company.talentCommunity ? '📬 Talent community / CV submitted' : 'I joined their talent community'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Check this when you've sent your CV to a talent pool or open-application pipeline
                </div>
              </div>
            </label>
          </div>
        </section>

        {/* Latest Discovered Jobs */}
        {company.scrapedJobs && company.scrapedJobs.length > 0 && (
          <section>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {company.scrapedJobs.map((job, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <a href={job.link} target="_blank" rel="noreferrer" 
                     className="btn btn-ghost btn-sm" 
                     style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left', padding: '8px 12px', height: 'auto', lineHeight: 1.4 }}>
                    <span style={{color: 'var(--accent)'}}>🔹</span> {job.title} {job.location ? `(${job.location})` : ''}
                  </a>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '0 8px', borderColor: 'var(--accent)', color: 'var(--accent-2)' }} 
                          onClick={() => onInterestedJob(company.id, company.name, job.title, job.link, job.dateDiscovered || new Date().toLocaleDateString('en-CA'), undefined, job.location)}
                          title="Add to 'To Apply' list">
                    ＋
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Manual Job addition */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
             <div className="detail-section-title" style={{ marginBottom: 0 }}>Save a Job to Apply</div>
             <button className="btn btn-ghost btn-sm" onClick={() => setShowManualForm(!showManualForm)}>
                {showManualForm ? 'Cancel' : '＋ Add Manual'}
             </button>
          </div>
          {showManualForm && (
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
               <input className="input" style={{ fontSize: 14 }} placeholder="Job Title (e.g. Sales Associate)" value={manualTitle} onChange={e => setManualTitle(e.target.value)} />
               <input className="input" style={{ fontSize: 14 }} placeholder="Link to posting (optional)" value={manualLink} onChange={e => setManualLink(e.target.value)} />
               <textarea 
                 className="input" 
                 style={{ fontSize: 13, height: 80, resize: 'vertical' }} 
                 placeholder="Paste job description here for AI strategy..." 
                 value={manualDescription} 
                 onChange={e => setManualDescription(e.target.value)} 
               />
               <button className="btn btn-primary btn-sm" disabled={!manualTitle.trim()} onClick={handleManualSave}>Save to 'To Apply' queue</button>
            </div>
          )}
        </section>

        {/* Notes */}
        <section>
          <div className="detail-section-title">My Notes</div>
          <textarea
            className="input"
            rows={5}
            placeholder="Interview dates, contacts, impressions, next steps…"
            style={{ resize: 'vertical', lineHeight: 1.65 }}
            value={company.notes ?? ''}
            onChange={e => onNotesChange(company.id, e.target.value)}
            id={`notes-${company.id}`}
          />
        </section>
      </div>
    </div>
  );
}
