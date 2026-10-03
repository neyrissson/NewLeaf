import { useState, useEffect, useRef } from 'react';
import type { SavedCV } from '../data/jobs';

type ModalTab = 'strategy' | 'why' | 'cover_letter';

interface JobApplyModalProps {
  job: {
    title: string;
    companyName: string;
    link?: string;
    description?: string;
    aiStrategy?: string;
  };
  cvBio: string;
  savedCVs?: SavedCV[];
  onClose: () => void;
  onSaveStrategy?: (strategy: string) => void;
}

// Same engine switch as fit scoring (⚙️ Scoring Engine in Settings) — Haiku for
// both, or Ollama for both, never mixed. See ask-local-llm in main.js.
const getScoringEngine = () => localStorage.getItem('newleaf_scoring_engine') || 'ollama';
const getAnthropicApiKey = () => localStorage.getItem('newleaf_anthropic_api_key') || '';
const getAiFailHint = () => getScoringEngine() === 'haiku' ? 'Check your API key in Settings.' : 'Ensure Ollama is running.';

export function JobApplyModal({ job, cvBio, savedCVs = [], onClose, onSaveStrategy }: JobApplyModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('strategy');
  const [selectedCVId, setSelectedCVId] = useState<string>('master');
  const [isAnalyzing, setIsAnalyzing] = useState(!job.aiStrategy);
  const [suggestions, setSuggestions] = useState<string | null>(job.aiStrategy || null);
  const [regenTrigger, setRegenTrigger] = useState(0);

  // Cover Letter Tab states
  const [coverLetter, setCoverLetter] = useState('');
  const [isGeneratingCL, setIsGeneratingCL] = useState(false);
  const [clCopied, setClCopied] = useState(false);

  // Why I want this tab
  const [whyText, setWhyText] = useState('');
  const [isGeneratingWhy, setIsGeneratingWhy] = useState(false);
  const [whySaved, setWhySaved] = useState(false);

  const lastTriggeredRef = useRef(-1);

  const getActiveCVText = () => {
    if (selectedCVId === 'master') return cvBio;
    if (selectedCVId === 'none') return '';
    return savedCVs.find(c => c.id === selectedCVId)?.text || cvBio;
  };

  const getActiveCVLabel = () => {
    if (selectedCVId === 'master') return 'Master CV';
    if (selectedCVId === 'none') return 'No relevant CV yet';
    return savedCVs.find(c => c.id === selectedCVId)?.name || 'Master CV';
  };

  useEffect(() => {
    if (activeTab !== 'strategy') return;
    if (job.aiStrategy && regenTrigger === 0) return;
    if (lastTriggeredRef.current === regenTrigger) return;
    lastTriggeredRef.current = regenTrigger;

    let currentText = '';
    // @ts-ignore
    const removeListener = window.electron.onAIChunk((data: { response: string, done: boolean }) => {
      if (data.done) {
        setIsAnalyzing(false);
        if (onSaveStrategy) onSaveStrategy(currentText);
      } else {
        currentText += data.response;
        setSuggestions(currentText);
      }
    });

    async function analyze() {
      const cvText = getActiveCVText();
      if (selectedCVId !== 'none' && (!cvText || cvText.trim().length < 50)) {
        setSuggestions('⚠️ Please upload your Master CV in Settings first, or select a specific CV.');
        setIsAnalyzing(false);
        return;
      }

      setSuggestions(`⏳ Analyzing with ${getActiveCVLabel()}...`);
      setIsAnalyzing(true);

      const cvSection = selectedCVId === 'none'
        ? 'Note: No relevant CV available yet for this type of role. Focus on transferable skills and framing.'
        : `Here is my CV (${getActiveCVLabel()}):\n${cvText.substring(0, 3000)}`;

      const jdText = (job.description || '').substring(0, 2000);

      const prompt = `Act as an expert career coach. I am applying for the role of "${job.title}" at "${job.companyName}".
${jdText ? `Job Description:\n${jdText}\n\n` : ''}
${cvSection}

Analyze my profile against this specific job. Return a highly actionable guide formatted exactly like this:
1. **Top 3 Bullet Points to Highlight**: (exact experiences to emphasize for this specific role)
2. **Missing Skills to Address**: (gaps to frame carefully, or skills to acquire)
3. **Cover Letter Hook**: (a compelling one-paragraph opening)
4. **Keywords to Use**: (5-8 keywords from the job description to weave into your CV/CL)

Be precise and strategic. NO CONVERSATIONAL FILLER.`;

      try {
        // @ts-ignore
        await window.electron.askLocalLLM({ prompt, engine: getScoringEngine(), anthropicApiKey: getAnthropicApiKey() });
      } catch (err) {
        setSuggestions(`❌ Failed to query AI. ${getAiFailHint()}`);
        setIsAnalyzing(false);
      }
    }

    analyze();
    return () => { if (typeof removeListener === 'function') removeListener(); };
  }, [job.title, job.companyName, job.description, job.aiStrategy, selectedCVId, regenTrigger, activeTab]);



  const handleGenerateWhy = async () => {
    const cvText = getActiveCVText();
    setIsGeneratingWhy(true);
    const el = (window as any).electron;
    let currentText = '';
    const removeListener = el.onAIChunk((data: { response: string, done: boolean }) => {
      if (data.done) {
        setIsGeneratingWhy(false);
        setWhyText(currentText);
      } else {
        currentText += data.response;
        setWhyText(currentText);
      }
    });

    const prompt = `I am considering applying for: "${job.title}" at "${job.companyName}".
${job.description ? `Job context:\n${job.description.substring(0, 1000)}\n` : ''}
My background: ${cvText.substring(0, 1500)}

In 3-4 sentences, explain concretely:
1. Why this specific role aligns with my background and transition goals
2. What I would genuinely learn or gain
3. One specific overlap between my experience and their work

Be honest and specific. Not a cover letter — these are private notes for me to remember why I applied. Write in first person.`;

    try {
      await el.askLocalLLM({ prompt, engine: getScoringEngine(), anthropicApiKey: getAnthropicApiKey() });
    } catch {
      setWhyText(`❌ Failed. ${getAiFailHint()}`);
      setIsGeneratingWhy(false);
    }
    removeListener();
  };

  const handleGenerateCoverLetter = async () => {
    const cvText = getActiveCVText();
    setIsGeneratingCL(true);
    const el = (window as any).electron;
    let currentText = '';
    const removeListener = el.onAIChunk((data: { response: string, done: boolean }) => {
      if (data.done) {
        setIsGeneratingCL(false);
        setCoverLetter(currentText);
      } else {
        currentText += data.response;
        setCoverLetter(currentText);
      }
    });

    const prompt = `I am applying for: "${job.title}" at "${job.companyName}".
${job.description ? `Job description:\n${job.description.substring(0, 1500)}\n` : ''}
My background: ${cvText.substring(0, 2000)}

Write a professional, tailored cover letter. Keep it under 350 words, compelling, and specific to the alignment between my experiences and the job. Do not include template placeholders like [Date] or [Address]. Make it ready to send.`;

    try {
      await el.askLocalLLM({ prompt, engine: getScoringEngine(), anthropicApiKey: getAnthropicApiKey() });
    } catch {
      setCoverLetter(`❌ Failed. ${getAiFailHint()}`);
      setIsGeneratingCL(false);
    }
    removeListener();
  };

  const handleCopyCL = () => {
    if (coverLetter) {
      // @ts-ignore
      window.electron.copyToClipboard(coverLetter);
      setClCopied(true);
      setTimeout(() => setClCopied(false), 2000);
    }
  };

  const handleOpenPrompt = async (target: 'claude' | 'gemini', type: 'cover_letter' | 'cv') => {
    const el = (window as any).electron;
    
    const masterCvText = cvBio ? cvBio.substring(0, 3000) : 'No Master CV provided.';
    let cvSection = `==== MY MASTER CV ====\\n${masterCvText}\\n====================`;

    if (selectedCVId !== 'master' && selectedCVId !== 'none') {
      const tailoredCv = savedCVs.find(c => c.id === selectedCVId);
      if (tailoredCv) {
        cvSection += `\\n\\n==== INSPIRATION / FORMATTING TEMPLATE CV (${tailoredCv.name}) ====\\n${tailoredCv.text.substring(0, 2000)}\\n====================`;
      }
    }

    const linkText = job.link ? `Job URL: ${job.link}\\n` : '';
    
    let instructions = '';
    if (type === 'cover_letter') {
      instructions = `Please help me write a highly tailored, non-robotic Cover Letter.
1. Extract 2-3 core company values from the job description or their website.
2. Identify the top 3 overlaps between my CV and the job's core requirements.
3. Write a compelling cover letter (max 300 words). The opening hook should be specific to why this company/role. No generic filler or "I am writing to apply for" clichés.`;
    } else {
      instructions = `Please help me tailor my CV for this specific role.
1. Identify 3 critical gaps or weak points in my current CV relative to the job requirements.
2. Extract 5 core keywords from the job description that I should weave in.
3. Rewrite the 3 most relevant bullet points from my CV to match their language exactly.`;
    }

    const prompt = `I am applying for "${job.title}" at "${job.companyName}".
${linkText}
${job.description ? `Job Description:\\n${job.description.substring(0, 2000)}\\n\\n` : ''}
${cvSection}

${instructions}`;

    await el?.copyToClipboard(prompt);
    const url = target === 'claude' ? 'https://claude.ai/new' : 'https://gemini.google.com/app';
    await el?.openExternal(url);
  };

  const handleRegenerate = () => {
    setSuggestions(null);
    setIsAnalyzing(true);
    setRegenTrigger(prev => prev + 1);
  };

  const tabStyle = (t: ModalTab) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    borderRadius: 8, transition: 'all 0.2s',
    background: activeTab === t ? 'rgba(212,175,55,0.2)' : 'transparent',
    color: activeTab === t ? '#d4af37' : 'var(--text-muted)',
    borderBottom: activeTab === t ? '2px solid #d4af37' : '2px solid transparent',
  });

  const renderMarkdown = (text: string) => text.split('\n').map((line, i) => {
    if (line.includes('**')) {
      const parts = line.split('**');
      return <div key={i} style={{ marginBottom: 8 }}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: 'var(--accent)' }}>{p}</strong> : p)}</div>;
    }
    return <div key={i} style={{ marginBottom: 6 }}>{line}</div>;
  });

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div
        className="fade-in"
        style={{ width: 740, maxWidth: '92%', maxHeight: '88vh', overflowY: 'auto', background: 'linear-gradient(145deg, rgba(30,30,30,0.97) 0%, rgba(15,15,15,0.99) 100%)', border: '1px solid rgba(212,175,55,0.6)', borderRadius: 20, padding: 36, boxShadow: '0 12px 48px rgba(212,175,55,0.15)', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 26 }}>✨</span>
          <h2 style={{ fontSize: 22, fontWeight: 700, background: 'linear-gradient(135deg, #d4af37 0%, #f1d592 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>Application Strategist</h2>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
          <strong style={{ color: '#fff' }}>{job.title}</strong> at <strong style={{ color: '#fff' }}>{job.companyName}</strong>
        </div>

        {/* CV Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Using CV:</span>
          <select
            value={selectedCVId}
            onChange={e => { setSelectedCVId(e.target.value); setSuggestions(null); setIsAnalyzing(true); setRegenTrigger(t => t + 1); }}
            style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 13 }}
          >
            <option value="master">📄 Master CV</option>
            {savedCVs.map(cv => (
              <option key={cv.id} value={cv.id}>📋 {cv.name} ({cv.type})</option>
            ))}
            <option value="none">🚫 No relevant CV yet for this type</option>
          </select>
        </div>

        {/* Prompt Generators */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#d4af37', marginBottom: 8 }}>📝 Cover Letter Prompt</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => handleOpenPrompt('claude', 'cover_letter')} className="btn btn-sm" style={{ flex: 1, background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: 'none' }}>Claude ↗</button>
              <button onClick={() => handleOpenPrompt('gemini', 'cover_letter')} className="btn btn-sm" style={{ flex: 1, background: 'rgba(66,133,244,0.15)', color: '#4285f4', border: 'none' }}>Gemini ↗</button>
            </div>
          </div>
          <div style={{ background: 'rgba(16,163,127,0.05)', border: '1px solid rgba(16,163,127,0.2)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#10a37f', marginBottom: 8 }}>📄 CV Tailoring Prompt</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => handleOpenPrompt('claude', 'cv')} className="btn btn-sm" style={{ flex: 1, background: 'rgba(16,163,127,0.15)', color: '#10a37f', border: 'none' }}>Claude ↗</button>
              <button onClick={() => handleOpenPrompt('gemini', 'cv')} className="btn btn-sm" style={{ flex: 1, background: 'rgba(66,133,244,0.15)', color: '#4285f4', border: 'none' }}>Gemini ↗</button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button style={tabStyle('strategy')} onClick={() => setActiveTab('strategy')}>🎯 Strategy</button>
          <button style={tabStyle('cover_letter')} onClick={() => setActiveTab('cover_letter')}>📝 Cover Letter</button>
          <button style={tabStyle('why')} onClick={() => setActiveTab('why')}>💡 Why I Want This</button>
        </div>

        {/* Strategy Tab */}
        {activeTab === 'strategy' && (
          <>
            {suggestions && (
              <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)', background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 12, border: '1px solid rgba(212,175,55,0.1)', marginBottom: 20 }}>
                {renderMarkdown(suggestions)}
                {isAnalyzing && <div style={{ color: 'var(--accent)', marginTop: 10 }}>● Thinking...</div>}
              </div>
            )}
            {isAnalyzing && !suggestions && (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--accent)' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🧠</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Analyzing with {getActiveCVLabel()}...</div>
              </div>
            )}
            {!isAnalyzing && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <button className="btn" style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13 }} onClick={handleRegenerate}>🔄 Regenerate</button>
                <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #d4af37, #f1d592)', color: '#000', fontWeight: 700, border: 'none' }} onClick={onClose}>Close & Save</button>
              </div>
            )}
          </>
        )}

        {/* Cover Letter Tab */}
        {activeTab === 'cover_letter' && (
          <div>
            {!coverLetter && !isGeneratingCL && (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
                  Generate a ready-to-edit draft using <strong style={{ color: '#fff' }}>{getActiveCVLabel()}</strong>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg, #d4af37, #f1d592)', color: '#000', fontWeight: 700, border: 'none', padding: '12px 28px' }}
                  onClick={handleGenerateCoverLetter}
                >
                  📝 Generate Draft
                </button>
              </div>
            )}
            {(coverLetter || isGeneratingCL) && (
              <>
                <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'pre-wrap', minHeight: 180, marginBottom: 16 }}>
                  {coverLetter}
                  {isGeneratingCL && <span style={{ color: 'var(--accent)' }}> ●</span>}
                </div>
                {!isGeneratingCL && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={handleGenerateCoverLetter}>🔄 Regenerate</button>
                    <button
                      className="btn btn-sm"
                      style={{ background: clCopied ? 'rgba(16,185,129,0.2)' : 'rgba(212,175,55,0.15)', border: `1px solid ${clCopied ? '#10b981' : 'rgba(212,175,55,0.3)'}`, color: clCopied ? '#10b981' : '#d4af37', fontWeight: 700 }}
                      onClick={handleCopyCL}
                    >
                      {clCopied ? '✓ Copied!' : '📋 Copy to Clipboard'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Why I Want This Tab */}
        {activeTab === 'why' && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Private notes — why <em>you</em> want this role. Helps you stay sharp when they call unexpectedly.
            </div>
            <textarea
              value={whyText}
              onChange={e => setWhyText(e.target.value)}
              placeholder="Why does this role genuinely interest you? What would you learn? Where does it overlap with your goals?..."
              style={{ width: '100%', minHeight: 140, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 10, padding: 14, fontSize: 14, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37', fontWeight: 700 }}
                onClick={handleGenerateWhy}
                disabled={isGeneratingWhy}
              >
                {isGeneratingWhy ? '🧠 Thinking...' : '✨ AI: Why this fits me'}
              </button>
              {whyText.trim().length > 10 && (
                <button
                  className="btn btn-sm"
                  style={{ background: whySaved ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${whySaved ? '#10b981' : 'rgba(255,255,255,0.12)'}`, color: whySaved ? '#10b981' : '#fff' }}
                  onClick={() => { onSaveStrategy?.(suggestions || ''); setWhySaved(true); setTimeout(() => setWhySaved(false), 2000); }}
                >
                  {whySaved ? '✓ Saved' : '💾 Save Notes'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
