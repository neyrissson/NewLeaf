import { useState, useEffect } from 'react';
import type { Company, SubmittedApplication, SavedCV } from '../data/jobs';
import { INDUSTRY_EMOJI } from '../data/jobs';
const CV_TYPES: SavedCV['type'][] = ['Consulting', 'VC/Finance', 'Biotech/Research', 'Tech', 'Marketing', 'General', 'Other'];
import { extractTextFromPdfFile } from '../utils/pdfParser';

interface Props {
  companies: Company[];
  applications: SubmittedApplication[];
  onAddApplication: (app: Omit<SubmittedApplication, 'id'>) => void;
  onUpdateApplication: (id: string, updates: Partial<SubmittedApplication>) => void;
  draftApplication?: { companyId: string, jobTitle: string, jobUrl?: string } | null;
  onClearDraft?: () => void;
  cvBio?: string;
  onCvBioChange?: (val: string) => void;
  onAddCV?: (cv: Omit<SavedCV, 'id'>) => void;
}

// Format a "YYYY-MM-DD" (or ISO) string as a local date — avoids the UTC off-by-one
// where new Date("2026-08-26") is midnight UTC and renders as the previous day locally.
const fmtDate = (s?: string) => {
  if (!s) return '';
  const d = new Date(s.split('T')[0] + 'T00:00:00');
  return isNaN(d.getTime()) ? s : d.toLocaleDateString();
};

export function SubmittedApplications({ companies, applications, onAddApplication, onUpdateApplication, draftApplication, onClearDraft, cvBio, onCvBioChange, onAddCV }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>('all');

  const [formCompanyId, setFormCompanyId] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formJobUrl, setFormJobUrl] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formJobDescription, setFormJobDescription] = useState('');
  const [formCoverLetter, setFormCoverLetter] = useState('');
  const [formCvFile, setFormCvFile] = useState<{name: string, path: string} | null>(null);
  const [formClFile, setFormClFile] = useState<{name: string, path: string} | null>(null);
  const [selectedApp, setSelectedApp] = useState<SubmittedApplication | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (draftApplication && onClearDraft) {
      setFormCompanyId(draftApplication.companyId);
      setFormJobTitle(draftApplication.jobTitle);
      setFormJobUrl(draftApplication.jobUrl || '');
      onClearDraft();
    }
  }, [draftApplication, onClearDraft]);

  const filteredApps = applications.filter(a => {
    const matchSearch = a.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCompany = filterCompany === 'all' || a.companyId === filterCompany;
    return matchSearch && matchCompany;
  }).sort((a, b) => new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCompanyId || !formJobTitle) return;
    
    onAddApplication({
      companyId: formCompanyId,
      jobTitle: formJobTitle,
      jobUrl: formJobUrl.trim() || undefined,
      desiredSalary: formSalary.trim() || undefined,
      dateSubmitted: formDate,
      jobDescription: formJobDescription,
      coverLetter: formCoverLetter,
      coverLetterFile: formClFile || undefined,
      responseFromCompany: undefined,
      cvFile: formCvFile || undefined,
      status: 'applied'
    });

    setFormCompanyId('');
    setFormJobTitle('');
    setFormJobUrl('');
    setFormSalary('');
    setFormJobDescription('');
    setFormCoverLetter('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormCvFile(null);
    setFormClFile(null);
  }

  const [isExtracting, setIsExtracting] = useState(false);
  const [showCvSavePrompt, setShowCvSavePrompt] = useState<{name: string, text: string, type: SavedCV['type']} | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // @ts-ignore - Electron polyfills 'path' on File objects natively
      setFormCvFile({ name: file.name, path: file.path });
      if (file.type === 'application/pdf') {
        try {
          setIsExtracting(true);
          const pdfText = await extractTextFromPdfFile(file);
          
          if (onAddCV) {
            const defaultName = formJobTitle && formCompanyId ? `${formJobTitle} - ${companies.find(c => c.id === formCompanyId)?.name || 'Company'}` : file.name.replace(/\.[^/.]+$/, '');
            setShowCvSavePrompt({ name: defaultName, text: pdfText, type: 'Other' });
          }
          
          if (!cvBio) {
             if (onCvBioChange) onCvBioChange(pdfText.trim());
             return;
          }

          const prompt = `Here is my newly uploaded CV text: 
${pdfText.substring(0, 3000)}

Please extract ONLY the newly added job experiences or distinct bullet points that are NOT already fundamentally covered by this Master CV text, and return them as a concise bulleted list constrainting purely to the new info. If there is nothing drastically new, return nothing.
MASTER CV:
${cvBio.substring(0, 3000)}`;
          
          // @ts-ignore
          const res = await window.electron.askLocalLLM({ prompt });
          if (res && res.trim().length > 10 && !res.toLowerCase().includes('nothing')) {
             if (onCvBioChange) onCvBioChange(cvBio + '\n\n---\n*Newly Synced Experience:*\n' + res.trim());
          }
        } catch (err) {
            console.error("Auto CV Sync failed", err);
        } finally {
            setIsExtracting(false);
        }
      }
    }
  }

  const handleClFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // @ts-ignore
      setFormClFile({ name: file.name, path: file.path });
    }
  }

  const openFile = async (path: string) => {
    // @ts-ignore
    if (window.electron && window.electron.openPath) await window.electron.openPath(path);
  }
  
  const showFile = async (path: string) => {
    // @ts-ignore
    if (window.electron && window.electron.showItemInFolder) await window.electron.showItemInFolder(path);
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* LEFT COLUMN: List */}
      <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px 10px' }}>
          <div className="page-title" style={{ marginBottom: 16 }}>Sent Applications ({applications.length})</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button 
              className="btn btn-ghost btn-sm" 
              style={{ flex: 1, border: '1px solid var(--accent)', color: 'var(--accent)', justifyContent: 'center' }}
              onClick={async () => {
                const el = (window as any).electron;
                if (el && el.openGreenhouseSync) {
                  const res = await el.openGreenhouseSync();
                  if (res.success && res.applications) {
                    res.applications.forEach((app: any) => {
                      // Check if already exists (approx match)
                      const exists = applications.some(a => a.jobTitle.toLowerCase() === app.jobTitle.toLowerCase());
                      if (!exists) {
                        onAddApplication({
                          companyId: 'manual', // Fallback or search for ID
                          jobTitle: app.jobTitle,
                          dateSubmitted: app.dateSubmitted,
                          status: app.status.toLowerCase().includes('interview') ? 'interviewing' : 'applied'
                        });
                      }
                    });
                  }
                }
              }}
            >
              🔄 Sync with Greenhouse Dashboard
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input 
              type="text" 
              className="input list-search" 
              placeholder="🔍 Search applied job titles..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
            <select className="input select" value={filterCompany} onChange={e => setFilterCompany(e.target.value)} style={{ width: 140 }}>
              <option value="all">All Companies</option>
              {companies.filter(c => applications.some(a => a.companyId === c.id)).map(c => (
                <option key={`filter-${c.id}`} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px 20px' }}>
          {filteredApps.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
              No applications match your search.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredApps.map(app => {
                const comp = companies.find(c => c.id === app.companyId);
                const isSel = selectedApp?.id === app.id;
                return (
                  <div 
                    key={app.id}
                    onClick={() => setSelectedApp(isSel ? null : app)}
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      backgroundColor: isSel ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSel ? 'var(--accent)' : 'rgba(255,255,255,0.05)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.1s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{app.jobTitle}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {fmtDate(app.dateSubmitted)}
                      </span>
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span>{comp ? `${INDUSTRY_EMOJI[comp.industry]} ${comp.name}` : 'Unknown Company'}</span>
                      {app.jobUrl && (
                        <a href={app.jobUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                           style={{ fontSize: 13, color: 'var(--sky)', textDecoration: 'none', fontWeight: 600 }}>
                          ↗ View original posting
                        </a>
                      )}
                      {(app.trackingUrl || comp?.applicationPortalUrl) && (
                        <a href={app.trackingUrl || comp!.applicationPortalUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                           title={[comp?.portalUsername && `Account: ${comp.portalUsername}`, comp?.portalNote].filter(Boolean).join(' — ') || 'Track this application in the company portal'}
                           style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                          🔑 Track my application{comp?.portalUsername ? ` (${comp.portalUsername})` : ''}
                        </a>
                      )}
                    </div>
                    {app.desiredSalary && (
                      <div style={{ fontSize: 13, color: 'var(--emerald)', fontWeight: 600, marginTop: -4, marginBottom: 6 }}>
                        💰 Asked for: {app.desiredSalary}
                      </div>
                    )}

                    {isSel && (
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 16, cursor: 'default' }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="tag" style={{ background: app.status === 'interviewing' ? 'var(--accent)' : app.status === 'offer' ? 'var(--emerald)' : app.status === 'rejected' ? 'var(--red)' : 'rgba(255,255,255,0.1)', color: app.status === 'applied' ? 'var(--text-muted)' : '#000', fontWeight: 700 }}>
                            {app.status?.toUpperCase() || 'APPLIED'}
                          </span>
                          {!isEditing && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                              ✏️ Modify Info
                            </button>
                          )}
                        </div>

                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                             <div>
                                <label className="label">Update Job Title</label>
                                <input type="text" className="input" value={app.jobTitle} onChange={e => onUpdateApplication(app.id, { jobTitle: e.target.value })} />
                             </div>
                             <div>
                                <label className="label">Original Posting URL</label>
                                <input type="url" className="input" placeholder="https://…" value={app.jobUrl || ''} onChange={e => onUpdateApplication(app.id, { jobUrl: e.target.value })} />
                             </div>
                             <div>
                                <label className="label">Desired Salary</label>
                                <input type="text" className="input" placeholder="e.g. $95,000 CAD" value={app.desiredSalary || ''} onChange={e => onUpdateApplication(app.id, { desiredSalary: e.target.value })} />
                             </div>
                             <div>
                                <label className="label">Track My Application URL <span style={{ fontWeight: 400, opacity: 0.6 }}>(the "view my profile" / candidate portal for this application)</span></label>
                                <input type="url" className="input" placeholder="https://… link where you check this application's status" value={app.trackingUrl || ''} onChange={e => onUpdateApplication(app.id, { trackingUrl: e.target.value })} />
                             </div>
                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                  <label className="label">Sent Date</label>
                                  <input type="date" className="input" value={app.dateSubmitted} onChange={e => onUpdateApplication(app.id, { dateSubmitted: e.target.value })} />
                                </div>
                                <div>
                                  <label className="label">Response Date</label>
                                  <input type="date" className="input" value={app.responseDate || ''} onChange={e => onUpdateApplication(app.id, { responseDate: e.target.value })} />
                                </div>
                             </div>
                             <div>
                                <label className="label">Follow-up Date <span style={{ fontWeight: 400, opacity: 0.6 }}>(when to check in if no response)</span></label>
                                <input type="date" className="input" value={app.followUpDate || ''} onChange={e => onUpdateApplication(app.id, { followUpDate: e.target.value })} />
                             </div>
                             <div>
                                <label className="label">CV / Document</label>
                                <label className="btn btn-ghost" style={{ width: '100%', cursor: 'pointer', textAlign: 'center', border: '1px dashed var(--border)', display: 'block' }}>
                                  <span>{app.cvFile && typeof app.cvFile === 'object' && 'name' in app.cvFile ? `Replace: ${app.cvFile.name}` : '📎 Attach CV File (PDF/Doc)'}</span>
                                  <input type="file" style={{ display: 'none' }} accept=".pdf,.doc,.docx,.pages" onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      // @ts-ignore
                                      onUpdateApplication(app.id, { cvFile: { name: file.name, path: file.path } });
                                      
                                      if (file.type === 'application/pdf' && onAddCV) {
                                        const pdfText = await extractTextFromPdfFile(file);
                                        const comp = companies.find(c => c.id === app.companyId);
                                        setShowCvSavePrompt({ 
                                          name: `${app.jobTitle} - ${comp?.name || 'Company'}`, 
                                          text: pdfText, 
                                          type: 'Other' 
                                        });
                                      }
                                    }
                                  }} />
                                </label>
                             </div>
                             <div>
                                <label className="label">Cover Letter Document</label>
                                <label className="btn btn-ghost" style={{ width: '100%', cursor: 'pointer', textAlign: 'center', border: '1px dashed var(--border)', display: 'block' }}>
                                  <span>{app.coverLetterFile ? `Replace: ${app.coverLetterFile.name}` : '📎 Attach Cover Letter File'}</span>
                                  <input type="file" style={{ display: 'none' }} accept=".pdf,.doc,.docx,.pages" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      // @ts-ignore
                                      onUpdateApplication(app.id, { coverLetterFile: { name: file.name, path: file.path } });
                                    }
                                  }} />
                                </label>
                             </div>
                             <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}>Done Editing ✓</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }} onClick={(e) => { e.stopPropagation(); onUpdateApplication(app.id, { status: 'interviewing', responseDate: new Date().toISOString().split('T')[0] }); }}>
                                🎯 I got an interview!
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--emerald)', color: 'var(--emerald)' }} onClick={(e) => { e.stopPropagation(); onUpdateApplication(app.id, { status: 'offer', responseDate: new Date().toISOString().split('T')[0] }); }}>
                                🏆 I got an offer!
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--red)', color: 'var(--red)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateApplication(app.id, { status: 'rejected', responseDate: new Date().toISOString().split('T')[0] });
                                }}>
                                ❌ Rejected
                              </button>
                            </div>

                            {/* Rejection reason — appears when rejected */}
                            {app.status === 'rejected' && (
                              <div>
                                <label className="label">Why were you rejected? <span style={{ fontWeight: 400, opacity: 0.6 }}>(helps identify patterns over time)</span></label>
                                <select
                                  className="input select"
                                  value={app.rejectionReason || ''}
                                  onChange={e => onUpdateApplication(app.id, { rejectionReason: e.target.value as any })}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <option value="">— Select reason —</option>
                                  <option value="no_response">No response (ghosted)</option>
                                  <option value="screening">Screened out before interview</option>
                                  <option value="technical">Failed technical/case interview</option>
                                  <option value="cultural">Cultural fit</option>
                                  <option value="overqualified">Overqualified</option>
                                  <option value="underqualified">Missing a required skill</option>
                                  <option value="role_filled">Role filled internally</option>
                                  <option value="other">Other / Unknown</option>
                                </select>
                              </div>
                            )}

                            {/* Follow-up row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 180 }}>
                                <label className="label" style={{ marginBottom: 4 }}>Follow-up date</label>
                                <input
                                  type="date"
                                  className="input"
                                  value={app.followUpDate || ''}
                                  onChange={e => onUpdateApplication(app.id, { followUpDate: e.target.value })}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                              {app.followUpDate && !app.followedUp && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ marginTop: 20, border: '1px solid #10b981', color: '#10b981' }}
                                  onClick={e => { e.stopPropagation(); onUpdateApplication(app.id, { followedUp: true }); }}
                                >
                                  ✓ Followed up
                                </button>
                              )}
                              {app.followedUp && (
                                <span style={{ marginTop: 20, fontSize: 12, color: '#10b981' }}>✓ Followed up</span>
                              )}
                              {app.followUpDate && new Date(app.followUpDate) <= new Date() && !app.followedUp && app.status === 'applied' && (
                                <span style={{ marginTop: 20, fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>⚠️ Overdue!</span>
                              )}
                            </div>

                            {/* Why I want this */}
                            {app.whyIWantThis && (
                              <div style={{ padding: '10px 14px', background: 'rgba(212,175,55,0.06)', borderRadius: 8, border: '1px solid rgba(212,175,55,0.15)' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#d4af37', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>💡 Why I wanted this</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{app.whyIWantThis}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {app.responseDate && (
                           <div style={{ fontSize: 13, color: 'var(--accent)' }}>
                             📣 Pivot Date: {fmtDate(app.responseDate)}
                           </div>
                        )}

                        {(app.jobDescription || '').length > 0 && (
                          <div>
                            <div className="label">Job Description text</div>
                            <div style={{ fontSize: 14, color: 'var(--text-muted)', backgroundColor: 'var(--surface)', padding: 10, borderRadius: 6, maxHeight: 150, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                              {app.jobDescription}
                            </div>
                          </div>
                        )}

                        {(app.coverLetter || '').length > 0 && (
                          <div>
                            <div className="label">Cover Letter text</div>
                            <div style={{ fontSize: 14, color: 'var(--text-muted)', backgroundColor: 'var(--surface)', padding: 10, borderRadius: 6, maxHeight: 150, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                              {app.coverLetter}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="label">Response from Company</div>
                          <textarea 
                            className="input" 
                            rows={3} 
                            style={{ resize: 'vertical', fontSize: 14 }} 
                            placeholder="Optional: Record phone screen dates, interview invites, rejections, or recruiter notes here..."
                            value={app.responseFromCompany || ''}
                            onChange={e => onUpdateApplication(app.id, { responseFromCompany: e.target.value })}
                          />
                        </div>

                        {(app.cvFile && typeof app.cvFile === 'object' && 'path' in app.cvFile) && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--surface)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 20 }}>📄</span>
                              <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>CV / Resume</div>
                                <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.cvFile.name}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={(e) => { e.stopPropagation(); openFile(app.cvFile!.path); }} className="btn btn-primary btn-sm">Preview</button>
                              <button onClick={(e) => { e.stopPropagation(); showFile(app.cvFile!.path); }} className="btn btn-ghost btn-sm">📁</button>
                            </div>
                          </div>
                        )}

                        {(app.coverLetterFile && typeof app.coverLetterFile === 'object' && 'path' in app.coverLetterFile) && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--surface)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 20 }}>✉️</span>
                              <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cover Letter</div>
                                <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.coverLetterFile.name}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={(e) => { e.stopPropagation(); openFile(app.coverLetterFile!.path); }} className="btn btn-primary btn-sm">Preview</button>
                              <button onClick={(e) => { e.stopPropagation(); showFile(app.coverLetterFile!.path); }} className="btn btn-ghost btn-sm">📁</button>
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Form */}
      <div style={{ width: 420, backgroundColor: 'var(--surface)', padding: 24, overflowY: 'auto' }}>
        <div className="detail-section-title">Record a New Application</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          <div>
            <label className="label">Company applied to</label>
            <select className="input select" value={formCompanyId} onChange={e => setFormCompanyId(e.target.value)} required>
              <option value="" disabled>Select a company...</option>
              {companies.map(c => (
                <option key={`form-c-${c.id}`} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Job Title applied for</label>
            <input type="text" className="input" placeholder="e.g. Senior Product Manager" value={formJobTitle} onChange={e => setFormJobTitle(e.target.value)} required />
          </div>

          <div>
            <label className="label">Original Posting URL (Optional)</label>
            <input type="url" className="input" placeholder="https://… link to the job posting" value={formJobUrl} onChange={e => setFormJobUrl(e.target.value)} />
          </div>

          <div>
            <label className="label">Desired Salary (Optional)</label>
            <input type="text" className="input" placeholder="e.g. $95,000 CAD or 90–100k" value={formSalary} onChange={e => setFormSalary(e.target.value)} />
          </div>

          <div>
            <label className="label">Date Applied</label>
            <input type="date" className="input" value={formDate} onChange={e => setFormDate(e.target.value)} required />
          </div>

          <div>
            <label className="label">Job Description / Posting Text (Optional)</label>
            <textarea className="input" rows={4} style={{ resize: 'vertical' }} placeholder="Paste the text of the job opening here..." value={formJobDescription} onChange={e => setFormJobDescription(e.target.value)} />
          </div>

          <div>
            <label className="label">Tailored Cover Letter Text (Optional)</label>
            <textarea className="input" rows={4} style={{ resize: 'vertical' }} placeholder="Paste the cover letter text you sent..." value={formCoverLetter} onChange={e => setFormCoverLetter(e.target.value)} />
          </div>

          <div>
            <label className="label">Attached CV / Document (Optional)</label>
            {formCvFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 6 }}>
                <span style={{ fontSize: 18 }}>📄</span>
                <div style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formCvFile.name}</div>
                <button type="button" onClick={() => setFormCvFile(null)} className="btn btn-ghost btn-sm">✖</button>
              </div>
            ) : (
              <label className="btn btn-ghost" style={{ width: '100%', cursor: 'pointer', textAlign: 'center', border: '1px dashed var(--border)', position: 'relative', overflow: 'hidden' }}>
                <span>{isExtracting ? '⏳ Syncing with AI Master CV...' : '📎 Select CV File (PDF/Doc)'}</span>
                <input type="file" style={{ display: 'none' }} disabled={isExtracting} onChange={handleFileSelect} accept=".pdf,.doc,.docx,.pages" />
              </label>
            )}
          </div>

          <div>
            <label className="label">Attached Cover Letter (Optional)</label>
            {formClFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 6 }}>
                <span style={{ fontSize: 18 }}>✉️</span>
                <div style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formClFile.name}</div>
                <button type="button" onClick={() => setFormClFile(null)} className="btn btn-ghost btn-sm">✖</button>
              </div>
            ) : (
              <label className="btn btn-ghost" style={{ width: '100%', cursor: 'pointer', textAlign: 'center', border: '1px dashed var(--border)', position: 'relative', overflow: 'hidden' }}>
                <span>📎 Select Cover Letter File</span>
                <input type="file" style={{ display: 'none' }} onChange={handleClFileSelect} accept=".pdf,.doc,.docx,.pages" />
              </label>
            )}
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.4 }}>
            The file paths are safely memorized by Electron. You'll be able to "Preview" or locate the originals later.
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 10, height: 42 }}>
            ➕ Save Application Record
          </button>

        </form>
      </div>

      {/* CV Save Prompt Modal */}
      {showCvSavePrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="fade-in" style={{ width: 400, background: 'var(--surface-2)', padding: 24, borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>💾 Save to CV Bank?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
              Would you like to save this tailored CV to your global CV Bank for future reuse in the Prompt Generator?
            </p>
            <div style={{ marginBottom: 16 }}>
              <label className="label">CV Name</label>
              <input type="text" className="input" value={showCvSavePrompt.name} onChange={e => setShowCvSavePrompt({...showCvSavePrompt, name: e.target.value})} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="label">Category</label>
              <select className="input select" value={showCvSavePrompt.type} onChange={e => setShowCvSavePrompt({...showCvSavePrompt, type: e.target.value as any})}>
                {CV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowCvSavePrompt(null)}>Skip</button>
              <button className="btn btn-primary" onClick={() => {
                if (onAddCV) onAddCV({
                  name: showCvSavePrompt.name,
                  text: showCvSavePrompt.text,
                  type: showCvSavePrompt.type,
                  dateAdded: new Date().toISOString().split('T')[0]
                });
                setShowCvSavePrompt(null);
              }}>Save to Bank</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
