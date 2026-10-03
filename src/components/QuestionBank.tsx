import { useState, useEffect, useRef } from 'react';
import type { Company } from '../data/jobs';
import type { InterviewQuestion } from '../App';

interface QuestionBankProps {
  questions: InterviewQuestion[];
  companies: Company[];
  onAdd: (q: Omit<InterviewQuestion, 'id'>) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<InterviewQuestion>) => void;
}

export function QuestionBank({ questions, companies, onAdd, onDelete, onUpdate }: QuestionBankProps) {
  const [newText, setNewText] = useState('');
  const [newJobType, setNewJobType] = useState('General');
  const [newCompType, setNewCompType] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [filterContextStatus, setFilterContextStatus] = useState('All'); // All, Completed, Missing
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const [ollamaReady, setOllamaReady] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNotesId, setShowNotesId] = useState<string | null>(null);
  const [showDeepPrepId, setShowDeepPrepId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editJobType, setEditJobType] = useState('');
  const [editCompType, setEditCompType] = useState('');
  const [isSearching, setIsSearching] = useState<string | null>(null); // questionId if searching
  const [isSearchingAll, setIsSearchingAll] = useState(false);
  const [selectedCompId, setSelectedCompId] = useState('');
  const [cachedContexts, setCachedContexts] = useState<Record<string, string | null>>(() => {
    try {
      const saved = localStorage.getItem('newleaf_cached_contexts');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [starredQuestions, setStarredQuestions] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('newleaf_starred_questions');
    return saved ? JSON.parse(saved) : {};
  });
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [sourceUrlOverrides, setSourceUrlOverrides] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('newleaf_source_overrides');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('newleaf_source_overrides', JSON.stringify(sourceUrlOverrides));
  }, [sourceUrlOverrides]);

  useEffect(() => {
    localStorage.setItem('newleaf_starred_questions', JSON.stringify(starredQuestions));
  }, [starredQuestions]);

  useEffect(() => {
    // Pruning logic to stay under 5MB localStorage limit
    // We keep the last 5 companies researched
    const keys = Object.keys(cachedContexts);
    if (keys.length > 5) {
        const nextCache = { ...cachedContexts };
        // Delete the oldest keys (simple approach for now)
        keys.slice(0, keys.length - 5).forEach(k => delete nextCache[k]);
        localStorage.setItem('newleaf_cached_contexts', JSON.stringify(nextCache));
    } else {
        localStorage.setItem('newleaf_cached_contexts', JSON.stringify(cachedContexts));
    }
  }, [cachedContexts]);

  const selectedCompany = companies.find(c => c.id === selectedCompId);
  const currentSourceUrl = sourceUrlOverrides[selectedCompId] || selectedCompany?.careerPage || selectedCompany?.website || '';

  // Check Ollama status
  useEffect(() => {
    const check = async () => {
      try {
        const res = await (window as any).electron.checkOllama();
        setOllamaReady(res?.success || false);
        setOllamaError(res?.error || null);
      } catch (e: any) {
        console.error("DEBUG: IPC Check failed", e);
        setOllamaReady(false);
        setOllamaError("IPC_FAIL");
      }
    };
    check();
    const timer = setInterval(check, 5000); // Check every 5s for faster testing
    return () => clearInterval(timer);
  }, []);

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAdd({ text: newText, jobType: newJobType, companyType: newCompType });
    setNewText('');
  };

  const filteredQuestions = questions.filter(q => {
    const matchesType = filterType === 'All' || q.jobType === filterType;
    
    let matchesStatus = true;
    if (selectedCompId) {
      const hasContext = !!q.answers?.[selectedCompId];
      if (filterContextStatus === 'Completed') matchesStatus = hasContext;
      if (filterContextStatus === 'Missing') matchesStatus = !hasContext;
    }

    const matchesStarred = !filterStarredOnly || !selectedCompId || (starredQuestions[selectedCompId] || []).includes(q.id);

    const matchesSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (q.notes || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (selectedCompId && q.answers?.[selectedCompId] || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesType && matchesStatus && matchesStarred && matchesSearch;
  });

  const startEdit = (q: InterviewQuestion) => {
    setEditingId(q.id);
    setEditText(q.text);
    setEditJobType(q.jobType);
    setEditCompType(q.companyType);
  };

  const saveEdit = () => {
    if (editingId) {
      onUpdate(editingId, { text: editText, jobType: editJobType, companyType: editCompType });
      setEditingId(null);
    }
  };

  // handleSearch removed - merged into handleStrategicAnalysis

  const stopRef = useRef(false);

  const handleStrategicAnalysisAll = async () => {
    if (!selectedCompId || isSearchingAll) return;
    setIsSearchingAll(true);
    stopRef.current = false;
    setStatusType('info');
    setStatusMessage("🧠 Strategic Batch: Analyzing all topics...");
    
    for (const q of filteredQuestions) {
      if (stopRef.current) break;
      await handleStrategicAnalysis(q);
    }
    setIsSearchingAll(false);
  };
  const handleStrategicAnalysis = async (question: InterviewQuestion) => {
    if (!ollamaReady) {
      alert("Local AI (Ollama) is not running. Please start Ollama to use Deep Search!");
      return;
    }
    if (!selectedCompId) return;
    
    setIsSearching(question.id);
    setStatusMessage(`🧠 AI Thinking: ${question.text.substring(0, 25)}...`);
    
    const company = companies.find(c => c.id === selectedCompId);
    if (!company) return;

    try {
      let rawContext: string | null = cachedContexts[selectedCompId] || null;

      if (!rawContext) {
        setStatusMessage(`🌐 Scanning ${company.name} Source...`);
        const res1 = await (window as any).electron.searchAnswer({
            url: currentSourceUrl,
            question: question.text
        });
        rawContext = res1.text || (res1.debug?.bodyLength > 300 ? res1.debug?.bodyText : null);
        
        if (rawContext && typeof rawContext === 'string' && rawContext.startsWith('NEWLEAF_ERR_LINKEDIN_BLOCKED')) {
            setStatusType('error');
            setStatusMessage(`🚫 LinkedIn Blocked: Manual paste required.`);
            setIsSearching(null);
            return;
        }

        if (rawContext) {
            setCachedContexts(prev => ({ ...prev, [selectedCompId]: rawContext }));
        }

        if (stopRef.current) { setIsSearching(null); return; }

        if (!rawContext && company.website && currentSourceUrl !== company.website) {
            setStatusMessage(`🌐 Trying Website fallback...`);
            const res2 = await (window as any).electron.searchAnswer({
                url: company.website,
                question: question.text
            });
            rawContext = res2.text || (res2.debug?.bodyLength > 300 ? res2.debug?.bodyText : null);
            
            if (rawContext && typeof rawContext === 'string' && rawContext.startsWith('NEWLEAF_ERR_LINKEDIN_BLOCKED')) {
                setStatusType('error');
                setStatusMessage(`🚫 LinkedIn Fallback Blocked.`);
                setIsSearching(null);
                return;
            }

            if (rawContext) {
                setCachedContexts(prev => ({ ...prev, [selectedCompId]: rawContext }));
            }
        }
      }

      if (stopRef.current) { setIsSearching(null); return; }

      if (!rawContext) {
        setStatusType('error');
        setStatusMessage(`⚠️ No data found to analyze.`);
        setIsSearching(null);
        await new Promise(r => setTimeout(r, 1500));
        return;
      }

      setStatusMessage("✍️ AI: Synthesizing Research Script...");
      const prompt = `Context from company site: "${rawContext.substring(0, 3000)}"\nQuestion: "${question.text}"\n\nTask: Synthesize a reason and a tailored script for this question. Suggest 1 follow-up. Keep it very concise.`;
      const synthesis = await (window as any).electron.askLocalLLM({ prompt });
      
      if (stopRef.current) { setIsSearching(null); return; }
      
      const newAnswers = { ...(question.answers || {}), [selectedCompId]: synthesis };
      onUpdate(question.id, { answers: newAnswers });
      
      setStatusType('success');
      setStatusMessage(`✨ Deep Search Complete! (${rawContext.length} chars used)`);
      setShowNotesId(question.id);
    } catch (e) {
      console.error("AI Analysis failed:", e);
      setStatusType('error');
      setStatusMessage("❌ Analysis failed.");
    } finally {
      setIsSearching(null);
      // Only clear message if it's NOT a batch, to prevent blinking
      if (!isSearchingAll) {
         setTimeout(() => setStatusMessage(''), 8000);
      }
    }
  };

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="page-title">Questions for Interviewers</div>
          <div className="page-subtitle">Strategic questions for your future team & deep company research 🌿</div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          {statusMessage && (
            <div className="fade-in" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              padding: '6px 16px', 
              borderRadius: 20, 
              background: 'rgba(212, 175, 55, 0.08)', 
              border: `1px solid ${statusType === 'error' ? '#f43f5e' : 'var(--accent)'}`,
              fontSize: 13,
              fontWeight: 600,
              color: statusType === 'error' ? '#f43f5e' : 'var(--accent)',
              boxShadow: (isSearching || isSearchingAll) ? `0 0 12px ${statusType === 'error' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(212, 175, 55, 0.2)'}` : 'none',
              maxWidth: 400,
              transition: 'all 0.3s ease'
            }}>
              <span style={{ fontSize: 16 }}>{statusType === 'success' ? '🎯' : statusType === 'error' ? '🚫' : '🪄'}</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusMessage}</span>
              {(isSearchingAll || isSearching) && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    stopRef.current = true;
                  }}
                  style={{ 
                    marginLeft: 8, 
                    background: '#f43f5e', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: 4, 
                    padding: '2px 8px', 
                    fontSize: 10, 
                    fontWeight: 800,
                    cursor: 'pointer' 
                  }}
                >
                  STOP
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: ollamaReady ? 'var(--accent)' : 'var(--text-muted)', opacity: 0.8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: ollamaReady ? 'var(--accent)' : '#444', boxShadow: ollamaReady ? '0 0 6px var(--accent)' : 'none' }} />
            {ollamaReady ? 'LOCAL AI READY' : `OLLAMA OFFLINE ${ollamaError ? `[${ollamaError}]` : ''}`}
            {!ollamaReady && (
              <span 
                style={{ cursor: 'pointer', textDecoration: 'underline', marginLeft: 4, opacity: 0.7 }}
                onClick={async () => {
                  const res = await (window as any).electron.checkOllama();
                  setOllamaReady(res.success);
                  setOllamaError(res.error || null);
                }}
              >
                (Refresh)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select 
              className="input select" 
              style={{ width: 180, height: 38, fontSize: 13 }}
              value={selectedCompId}
              onChange={(e) => setSelectedCompId(e.target.value)}
            >
              <option value="" disabled>Select a company...</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {selectedCompId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ position: 'relative', width: 140 }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: 10 }}>🌐 Src:</span>
                  <input 
                    className="input" 
                    style={{ width: '100%', paddingLeft: 45, paddingRight: 30, height: 38, fontSize: 10, background: 'rgba(255,255,255,0.02)', borderColor: 'var(--accent)' }} 
                    value={currentSourceUrl}
                    onChange={(e) => setSourceUrlOverrides(prev => ({ ...prev, [selectedCompId]: e.target.value }))}
                  />
                  <button 
                    style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.5 }}
                    title="Switch between Career and Website"
                    onClick={() => {
                        const next = currentSourceUrl === selectedCompany?.careerPage ? selectedCompany?.website : selectedCompany?.careerPage;
                        if (next) setSourceUrlOverrides(prev => ({ ...prev, [selectedCompId]: next }));
                    }}
                  >
                    🔄
                  </button>
                </div>
              </div>
            )}
            <div style={{ position: 'relative', width: 160 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: 13 }}>🔍</span>
              <input 
                className="input" 
                style={{ width: '100%', paddingLeft: 30, height: 38, fontSize: 13, background: 'rgba(255,255,255,0.02)' }} 
                placeholder="Search..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <select 
              className="input select" 
              style={{ width: 110, height: 38, fontSize: 13 }}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="All">All Types</option>
              <option>General</option>
              <option>Technical</option>
              <option>Management</option>
              <option>Strategy</option>
              <option>Red Flag</option>
              <option>Operations</option>
              <option>Sales</option>
            </select>

            <select 
              className="input select" 
              style={{ width: 110, height: 38, fontSize: 13, border: filterStarredOnly ? '1px solid var(--accent)' : 'none' }}
              value={filterStarredOnly ? 'STARRED' : 'ALL'}
              onChange={(e) => setFilterStarredOnly(e.target.value === 'STARRED')}
            >
                <option value="ALL">All Qs</option>
                <option value="STARRED">🌟 Top Plan</option>
            </select>

            {selectedCompId && (
              <select 
                className="input select" 
                style={{ width: 110, height: 38, fontSize: 13, border: '1px solid var(--accent-glow)', background: 'rgba(212, 175, 55, 0.05)' }}
                value={filterContextStatus}
                onChange={(e) => setFilterContextStatus(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Completed">Ready</option>
                <option value="Missing">Needs Context</option>
              </select>
            )}

            {selectedCompId && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button 
                  className={isSearchingAll ? "btn btn-ghost" : "btn btn-outline"} 
                  style={{ 
                    height: 38, 
                    fontSize: 12, 
                    padding: '0 12px',
                    whiteSpace: 'nowrap', 
                    border: '1px solid var(--accent)',
                    color: 'var(--accent)',
                    boxShadow: 'none',
                    animation: isSearchingAll ? 'pulse 1.5s infinite' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }} 
                  onClick={handleStrategicAnalysisAll}
                  disabled={isSearchingAll}
                >
                  {isSearchingAll ? "🧠 Analyzing..." : "🧠 Strategic Analysis All"}
                </button>

              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12, fontSize: 14 }}>＋ Add New Question</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="label">Question Text</label>
            <input 
              className="input" 
              placeholder="e.g. How does your team handle rapid scaling?" 
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
            />
          </div>
          <div style={{ width: 160 }}>
            <label className="label">Type</label>
            <select className="input select" value={newJobType} onChange={(e) => setNewJobType(e.target.value)}>
               <option>General</option>
               <option>Technical</option>
               <option>Management</option>
               <option>Sales</option>
               <option>Operations</option>
               <option>Strategy</option>
               <option>Red Flag</option>
            </select>
          </div>
          <div style={{ width: 140 }}>
            <label className="label">Company Type</label>
            <select className="input select" value={newCompType} onChange={(e) => setNewCompType(e.target.value)}>
               <option>All</option>
               <option>Startup</option>
               <option>Enterprise</option>
               <option>Pharma</option>
               <option>Consulting</option>
               <option>VC</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ height: 38 }} onClick={handleAdd}>Add to Bank</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
        {filteredQuestions
          .map(q => (
          <div key={q.id} className="card fade-in" style={{ 
            position: 'relative', 
            minHeight: editingId === q.id ? 400 : 180, 
            display: 'flex', 
            flexDirection: 'column', 
            border: editingId === q.id ? '2px solid var(--accent)' : '1px solid var(--border)', 
            boxShadow: editingId === q.id ? 'var(--shadow-glow)' : '0 0 15px rgba(212, 175, 55, 0.1), var(--shadow-card)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
          }}>
            <div className="card-header" style={{ padding: '12px 16px', background: editingId === q.id ? 'rgba(212, 175, 55, 0.05)' : 'rgba(255,255,255,0.02)' }}>
              {editingId === q.id ? (
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>
                  Interview Question #{q.id.slice(-4).toUpperCase()}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="tag" style={{ background: 'rgba(212, 175, 55, 0.15)', color: 'var(--accent-2)', borderColor: 'rgba(212, 175, 55, 0.25)' }}>{q.jobType}</span>
                  <span className="tag" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{q.companyType}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {editingId === q.id ? (
                  <button className="btn btn-ghost btn-sm" style={{ padding: '0 8px', fontSize: 13 }} onClick={() => setEditingId(null)}>✕</button>
                ) : (
                  <>
                    {selectedCompId && (
                        <button 
                            className="btn-icon"
                            style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                cursor: 'pointer',
                                fontSize: 18,
                                opacity: (starredQuestions[selectedCompId] || []).includes(q.id) ? 1 : 0.3,
                                filter: (starredQuestions[selectedCompId] || []).includes(q.id) ? 'drop-shadow(0 0 4px var(--accent))' : 'none',
                                transition: 'all 0.2s ease',
                                padding: 0, width: 24, height: 24
                            }}
                            title="Pick for Interview"
                            onClick={() => {
                                const current = starredQuestions[selectedCompId] || [];
                                const next = current.includes(q.id) ? current.filter(id => id !== q.id) : [...current, q.id];
                                setStarredQuestions(prev => ({ ...prev, [selectedCompId]: next }));
                            }}
                        >
                            {(starredQuestions[selectedCompId] || []).includes(q.id) ? '🌟' : '⭐'}
                        </button>
                    )}
                    <button 
                      className="btn-icon" 
                      style={{ 
                        background: 'rgba(212, 175, 55, 0.1)', 
                        border: '1px solid rgba(212, 175, 55, 0.2)', 
                        borderRadius: 6, 
                        width: 28, height: 28, 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14 
                      }} 
                      onClick={() => startEdit(q)} 
                      title="Edit question"
                    >✏️</button>
                    <button 
                      className="btn-icon" 
                      style={{ 
                        background: 'rgba(244, 63, 94, 0.1)', 
                        border: '1px solid rgba(244, 63, 94, 0.2)', 
                        borderRadius: 6, 
                        width: 28, height: 28, 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#f43f5e', 
                        fontSize: 16, 
                        fontWeight: 800, 
                        opacity: 0.9 
                      }} 
                      onClick={() => onDelete(q.id)}
                      title="Delete question"
                    >✕</button>
                  </>
                )}
              </div>
            </div>
            
            <div style={{ padding: 16, flex: 1 }}>
              {editingId === q.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label">Job Type</label>
                      <select className="input select" style={{ fontSize: 13 }} value={editJobType} onChange={e => setEditJobType(e.target.value)}>
                        <option>General</option><option>Technical</option><option>Management</option><option>Strategy</option><option>Red Flag</option><option>Operations</option><option>Sales</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Company Type</label>
                      <select className="input select" style={{ fontSize: 13 }} value={editCompType} onChange={e => setEditCompType(e.target.value)}>
                        <option>All</option><option>Startup</option><option>Enterprise</option><option>Pharma</option><option>Consulting</option><option>VC</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Interview Question</label>
                    <textarea 
                      className="input" 
                      style={{ 
                        fontSize: 15, 
                        fontWeight: 600, 
                        width: '100%', 
                        minHeight: 80, 
                        border: '1px solid var(--accent)',
                        boxShadow: '0 0 12px var(--accent-glow)'
                      }}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Notes / Prep</label>
                    <textarea 
                      className="input" 
                      style={{ width: '100%', minHeight: 60, fontSize: 13 }}
                      value={q.notes || ''}
                      onChange={e => onUpdate(q.id, { notes: e.target.value })}
                      placeholder="Add prep notes here..."
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: showNotesId === q.id || (selectedCompId && q.answers?.[selectedCompId]) ? 12 : 20, lineHeight: 1.4 }}>{q.text}</p>
                  
                  {showNotesId === q.id && (
                    <div className="fade-in" style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <label className="label" style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: 0.5, marginBottom: 4 }}>GLOBAL INQUIRY NOTES</label>
                          <textarea 
                            className="input"
                            style={{ 
                              width: '100%', 
                              minHeight: 60, 
                              fontSize: 13, 
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid var(--border)',
                              resize: 'vertical',
                              lineHeight: 1.5
                            }}
                            placeholder="General key points for this question..."
                            value={q.notes || ''}
                            onChange={(e) => onUpdate(q.id, { notes: e.target.value })}
                          />
                        </div>

                        {selectedCompId && (
                          <div className="fade-in" style={{ padding: 12, borderRadius: 8, background: 'rgba(212, 175, 55, 0.03)', border: '1px dashed var(--accent-glow)' }}>
                            <label className="label" style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: 0.5, marginBottom: 4 }}>
                              CONTEXT FOR: {companies.find(c => c.id === selectedCompId)?.name.toUpperCase() || 'SELECTED COMPANY'}
                            </label>
                            <textarea 
                              className="input"
                              style={{ 
                                width: '100%', 
                                minHeight: 80, 
                                fontSize: 14, 
                                background: 'transparent',
                                border: '1px solid var(--accent-glow)',
                                resize: 'vertical',
                                fontWeight: 500,
                                color: 'var(--text)'
                              }}
                              placeholder="Draft your tailored script or inquiry context for this company..."
                              value={q.answers?.[selectedCompId] || ''}
                              onChange={(e) => {
                                const newAnswers = { ...(q.answers || {}), [selectedCompId]: e.target.value };
                                onUpdate(q.id, { answers: newAnswers });
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCompId && q.answers?.[selectedCompId] && (
                    <div className="fade-in" style={{ 
                      marginBottom: 12, 
                      padding: 12, 
                      background: 'rgba(212, 175, 55, 0.08)', 
                      borderRadius: 8,
                      fontSize: 14,
                      border: '1px solid var(--accent-glow)',
                      color: 'var(--text)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong style={{ color: 'var(--accent)', fontSize: 11, letterSpacing: 0.5 }}>STRATEGIC ANALYSIS</strong>
                        <button 
                          className="btn btn-ghost" 
                          style={{ fontSize: 9, padding: '2px 6px', height: 'auto', border: '1px solid var(--accent-glow)', color: 'var(--accent)' }}
                          onClick={() => {
                            const newAnswers = { ...(q.answers || {}) };
                            delete newAnswers[selectedCompId];
                            onUpdate(q.id, { answers: newAnswers });
                          }}
                        >
                          Recalculate ↻
                        </button>
                      </div>
                      <span style={{ fontStyle: 'italic', opacity: 0.9 }}>"{q.answers?.[selectedCompId]}"</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div style={{ padding: '0 16px 20px 16px', marginTop: 'auto' }}>
              {editingId === q.id ? (
                <div style={{ display: 'flex', gap: 10 }}>
                   <button className="btn btn-ghost" style={{ flex: 1, height: 40 }} onClick={() => setEditingId(null)}>Cancel</button>
                   <button className="btn btn-primary" style={{ flex: 2, height: 40 }} onClick={saveEdit}>Save Changes</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button 
                    className={showNotesId === q.id ? "btn btn-primary" : "btn btn-outline"}
                    style={{ 
                      width: '100%', 
                      height: 38, 
                      justifyContent: 'center',
                      background: showNotesId === q.id ? 'var(--accent)' : 'rgba(0,0,0,0.4)',
                      color: showNotesId === q.id ? '#000' : 'var(--accent)',
                      fontSize: 14,
                      boxShadow: 'none',
                      border: showNotesId === q.id ? 'none' : '1px solid var(--accent)'
                    }}
                    onClick={() => setShowDeepPrepId(q.id)}
                  >
                    📝 Prep & Context
                  </button>

                  {selectedCompId && (
                    <button 
                      className="btn btn-outline"
                      style={{ 
                        width: '100%', 
                        height: 38, 
                        fontSize: 13,
                        borderColor: 'var(--accent)',
                        color: 'var(--accent)',
                        opacity: ollamaReady ? 1 : 0.6,
                        cursor: ollamaReady ? 'pointer' : 'not-allowed',
                        background: 'rgba(212, 175, 55, 0.03)',
                        boxShadow: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        animation: isSearching === q.id ? 'pulse 1.5s infinite' : 'none'
                      }}
                      onClick={() => handleStrategicAnalysis(q)}
                      disabled={!ollamaReady || !!isSearching}
                    >
                      {isSearching === q.id ? '🧠 Analyzing...' : '🧠 Strategic Analysis'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showDeepPrepId && (() => {
        const q = questions.find(question => question.id === showDeepPrepId);
        if (!q) return null;
        const comp = companies.find(c => c.id === selectedCompId);
        
        return (
          <div className="modal-overlay" onClick={() => setShowDeepPrepId(null)}>
            <div className="elite-modal" onClick={e => e.stopPropagation()}>
              <div className="elite-modal-header">
                <div>
                   <div style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 800, letterSpacing: 1.5, marginBottom: 8 }}>DIAGNOSTIC CASE #{q.id.slice(-4).toUpperCase()}</div>
                   <div className="elite-modal-title">{q.text}</div>
                   <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <span className="tag">{q.jobType}</span>
                        <span className="tag">{q.companyType}</span>
                   </div>
                </div>
                <button className="btn btn-ghost" style={{ fontSize: 24 }} onClick={() => setShowDeepPrepId(null)}>✕</button>
              </div>

              <div className="elite-modal-content">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div className="elite-card">
                    <label className="elite-section-label">🌎 Global Prep Notes</label>
                    <textarea 
                      className="elite-textarea"
                      placeholder="Frameworks, metrics, or universal key points for this question..."
                      value={q.notes || ''}
                      onChange={(e) => onUpdate(q.id, { notes: e.target.value })}
                    />
                  </div>
                  
                  <div className="elite-card" style={{ opacity: 0.6 }}>
                    <label className="elite-section-label">📋 Diagnostic Context</label>
                    <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                        This question tests your ability to navigate **{q.jobType}** challenges in **{q.companyType}** environments. 
                        AI synthesis below provides the specific lens for the chosen firm.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                   {selectedCompId ? (
                     <div className="elite-card elite-card-gold">
                        <label className="elite-section-label">📝 Strategic Answer: {comp?.name || 'Selected Firm'}</label>
                        <textarea 
                          className="elite-textarea"
                          style={{ minHeight: 200 }}
                          placeholder={`Draft your ${comp?.name} specific response here...`}
                          value={q.answers?.[selectedCompId] || ''}
                          onChange={(e) => {
                            const newAnswers = { ...(q.answers || {}), [selectedCompId]: e.target.value };
                            onUpdate(q.id, { answers: newAnswers });
                          }}
                        />
                        
                        {q.answers?.[selectedCompId] && (
                            <button className="btn-elite" style={{ marginTop: 16 }} onClick={() => setShowDeepPrepId(null)}>
                                Use as Answer ⚡
                            </button>
                        )}

                        <div className="insight-pill">
                            <label className="elite-section-label" style={{ marginBottom: 8 }}>🌐 Website Insight: {comp?.website?.replace('https://', '') || 'Company Data'}</label>
                            <div style={{ fontSize: 14, color: 'var(--accent-2)', fontStyle: 'italic', lineHeight: 1.5 }}>
                                {q.answers?.[selectedCompId] ? "Synthesis analyzed from company source code and active career postings." : "No active AI synthesis for this firm. Click 'Deep Search' on the dashboard to generate."}
                            </div>
                        </div>
                     </div>
                   ) : (
                     <div className="empty-state" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 18 }}>
                        <div className="empty-text">Select a company on the left to see firm-specific insights.</div>
                     </div>
                   )}
                </div>
              </div>
              
              <div style={{ padding: '20px 40px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)' }}>
                  <button className="btn-elite" onClick={() => setShowDeepPrepId(null)}>Save & Close Strategy</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default QuestionBank;
