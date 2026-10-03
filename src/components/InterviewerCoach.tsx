import { useState, useMemo } from 'react';
import type { Company, SubmittedApplication } from '../data/jobs';
import type { InterviewerQuestion } from '../App';

interface Props {
  questions: InterviewerQuestion[];
  companies: Company[];
  applications: SubmittedApplication[];
  cvBio: string;
  onUpdate: (id: string, updates: Partial<InterviewerQuestion>) => void;
}

const CATEGORIES = [
  'All',
  'Background & Motivation',
  'Strategic Thinking',
  'Data, Analytics & AI',
  'Consulting-Specific',
  'VC & Finance-Specific',
  'Pharma & Life Sciences Knowledge',
  'Collaboration & Communication',
  'Growth, Ambition & Learning Agility',
  'Problem-Solving & Execution',
  'Compensation, Fit & Logistics'
] as const;

export function InterviewerCoach({ questions, companies, applications, cvBio, onUpdate }: Props) {
  const [showModalId, setShowModalId] = useState<string | null>(null);
  const [isCoaching, setIsCoaching] = useState<string | null>(null);
  const [selectedCompId, setSelectedCompId] = useState<string>('general');
  const [status, setStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const activeQuestion = questions.find(q => q.id === showModalId);
  const selectedApp = applications.find(a => a.companyId === selectedCompId);
  const selectedComp = companies.find(c => c.id === selectedCompId);

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const matchSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = activeCategory === 'All' || q.category === activeCategory;
      return matchSearch && matchCat;
    });
  }, [questions, searchTerm, activeCategory]);

  const handleCoachMe = async () => {
    if (!activeQuestion) return;
    setIsCoaching(activeQuestion.id);
    setStatus('🧠 AI is synthesizing your background...');

    try {
      const jdContent = selectedApp?.jobDescription || '';
      const clContent = selectedApp?.coverLetter || '';
      const firmName = selectedComp?.name || '';

      const prompt = `
        You are an Elite Interview Coach specializing in McKinsey/BCG style interviews and Life Sciences VC/Pharma strategy. 
        Help me answer this behavioral question using my CV/Bio context and (if provided) the job details.
        
        QUESTION: "${activeQuestion.text}"
        USER BIO: "${cvBio || 'No bio provided. Suggest general best practices.'}"
        CONTEXT: ${firmName ? `Candidate is applying to ${firmName}.` : 'General advice.'}
        ${jdContent ? `JOB DESCRIPTION: ${jdContent.slice(0, 1500)}` : ''}
        ${clContent ? `COVER LETTER: ${clContent.slice(0, 1500)}` : ''}

        REQUIREMENTS:
        - Provide a response using the professional "STAR" Method (Situation, Task, Action, Result). 
        - The tone must be strategic, results-driven, and highlight high-impact achievements from the BIO.
        - Tailor the "Action" and "Result" to the specific company (${firmName}) if provided.
        - Keep the output concise but punchy.
      `;

      // @ts-ignore
      const res = await window.electron.askLocalLLM({ prompt });
      if (res && typeof res === 'string' && res.trim().length > 0) {
        onUpdate(activeQuestion.id, { aiSuggestion: res });
      }
    } catch (e) {
      console.error(e);
      setStatus('⚠️ AI unavailable. Check Ollama status.');
    } finally {
      setIsCoaching(null);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="page-title">Personalized Interview Coach 🎤🤖</div>
          <div className="page-subtitle">Draft your responses for {questions.length} behavioral questions</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Context:</div>
            <select 
                className="input select" 
                style={{ width: 220 }}
                value={selectedCompId}
                onChange={e => setSelectedCompId(e.target.value)}
            >
                <option value="general">💼 General best practice</option>
                {companies.filter(c => applications.some(a => a.companyId === c.id)).map(c => (
                    <option key={c.id} value={c.id}>🏢 {c.name}</option>
                ))}
            </select>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
          <input 
            type="text" 
            className="input" 
            placeholder="🔍 Search questions (e.g. conflict, data, failure...)" 
            style={{ width: '100%', height: 44, fontSize: 15 }}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
      </div>

      <div className="category-bar" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 24, paddingBottom: 8, scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
              <button 
                key={cat} 
                className={`tag ${activeCategory === cat ? 'active' : ''}`}
                style={{ 
                    cursor: 'pointer', 
                    padding: '8px 16px', 
                    fontSize: 12, 
                    whiteSpace: 'nowrap',
                    background: activeCategory === cat ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                    color: activeCategory === cat ? '#000' : 'var(--text-dim)',
                    border: activeCategory === cat ? 'none' : '1px solid rgba(255,255,255,0.1)'
                }}
                onClick={() => setActiveCategory(cat)}
              >
                  {cat}
              </button>
          ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {filteredQuestions.map(q => (
            <div key={q.id} className="card fade-in" style={{ display: 'flex', flexDirection: 'column', border: q.userNote ? '1px solid var(--emerald-glow)' : '1px solid var(--border)' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="tag" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--accent)', fontSize: 10 }}>{q.category}</span>
                {q.userNote && <span style={{ color: 'var(--emerald)', fontSize: 12 }}>✅ Drafted</span>}
                </div>
                <div className="card-body" style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, lineHeight: 1.4, color: '#fff' }}>{q.text}</div>
                </div>
                <div className="card-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 20px' }}>
                <button 
                    className="btn btn-outline" 
                    style={{ width: '100%', height: 38, justifyContent: 'center' }}
                    onClick={() => setShowModalId(q.id)}
                >
                    {q.userNote ? '📋 View/Edit Draft' : '➕ Draft Strategic Answer'}
                </button>
                </div>
            </div>
            ))}
        </div>
        {filteredQuestions.length === 0 && (
            <div className="empty-state">No questions found matching your filter.</div>
        )}
      </div>

      {showModalId && activeQuestion && (
        <div className="modal-overlay" onClick={() => setShowModalId(null)}>
          <div className="elite-modal" style={{ border: '1px solid var(--accent)' }} onClick={e => e.stopPropagation()}>
            <div className="elite-modal-header">
              <div>
                <div style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 800, letterSpacing: 1.5, marginBottom: 8 }}>REVERSE INTERVIEW COACHING #{activeQuestion.id.slice(-4).toUpperCase()}</div>
                <div className="elite-modal-title">{activeQuestion.text}</div>
                <div style={{ marginTop: 8 }}><span className="tag">{activeQuestion.category}</span></div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 24 }} onClick={() => setShowModalId(null)}>✕</button>
            </div>

            <div className="elite-modal-content" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {/* Left Column: Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
                <div className="elite-card" style={{ flex: 1 }}>
                  <label className="elite-section-label">✍️ My Response (STAR Draft)</label>
                  <textarea 
                    className="elite-textarea"
                    style={{ height: 'calc(100% - 40px)', minHeight: 400, fontSize: 15 }}
                    placeholder="Structure your answer here. Use the 'Coach Me' button to brainstorm using your background..."
                    value={activeQuestion.userNote || ''}
                    onChange={e => onUpdate(activeQuestion.id, { userNote: e.target.value })}
                  />
                </div>
              </div>

              {/* Right Column: AI Suggestions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
                <div className="elite-card elite-card-gold" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label className="elite-section-label">🤖 AI COACH DRAFT (Personalized)</label>
                  <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                    {activeQuestion.aiSuggestion ? (
                      <div className="fade-in" style={{ fontSize: 14, lineHeight: 1.7, color: '#e0e0e0', whiteSpace: 'pre-wrap' }}>
                        {activeQuestion.aiSuggestion}
                      </div>
                    ) : (
                      <div className="empty-state" style={{ background: 'transparent' }}>
                        <div style={{ maxWidth: 280, margin: '40px auto', textAlign: 'center', opacity: 0.6 }}>
                           {cvBio ? (
                               "Press 'Coach Me' to synthesize your Bio and Application data into a high-impact response."
                           ) : (
                               "⚠️ Go to Settings and add your Bio to unlock the AI coach."
                           )}
                        </div>
                      </div>
                    )}
                  </div>

                  <button 
                    className="btn-elite" 
                    style={{ height: 48, width: '100%' }}
                    onClick={handleCoachMe}
                    disabled={!!isCoaching || !cvBio}
                  >
                    {isCoaching ? '🧠 Analyzing Experience...' : '✨ Coach Me (AI)'}
                  </button>
                  {status && <div style={{ fontSize: 11, color: 'var(--accent)', textAlign: 'center', marginTop: 10 }}>{status}</div>}
                </div>
                
                <div className="elite-card" style={{ opacity: 0.7 }}>
                   <label className="elite-section-label">💡 Coaching Pro-Tip</label>
                   <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                       For <strong>{activeQuestion.category}</strong> questions, focus on specific metrics (e.g., $ saved, % growth). 
                       The AI will prioritize these from your "CV Bank" if available.
                   </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 40px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)', gap: 12 }}>
                 <button className="btn btn-ghost" onClick={() => onUpdate(activeQuestion.id, { userNote: '' })}>Clear Draft</button>
                 <button className="btn-elite" onClick={() => setShowModalId(null)}>Save Strategy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
