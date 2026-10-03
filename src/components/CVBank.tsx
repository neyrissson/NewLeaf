import { useState, useRef } from 'react';
import type { SavedCV } from '../data/jobs';
import { extractTextFromPdfFile } from '../utils/pdfParser';

const CV_TYPES: SavedCV['type'][] = ['Consulting', 'VC/Finance', 'Biotech/Research', 'Tech', 'Marketing', 'General', 'Other'];

interface Props {
  cvBio: string;
  onCvBioChange: (val: string) => void;
  savedCVs: SavedCV[];
  onAddCV: (cv: Omit<SavedCV, 'id' | 'dateAdded'>) => void;
  onDeleteCV: (id: string) => void;
  onUpdateCV: (id: string, updates: Partial<SavedCV>) => void;
}

export function CVBank({ cvBio, onCvBioChange, savedCVs, onAddCV, onDeleteCV, onUpdateCV }: Props) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [cvUploadForm, setCvUploadForm] = useState({ name: '', type: 'Consulting' as SavedCV['type'] });
  const [isUploadingCV, setIsUploadingCV] = useState(false);
  const cvFileRef = useRef<HTMLInputElement>(null);
  const [editingCvId, setEditingCvId] = useState<string | null>(null);
  const [editingCvName, setEditingCvName] = useState('');

  const handleMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsExtracting(true);
      const text = await extractTextFromPdfFile(file);
      onCvBioChange(cvBio ? cvBio + '\n\n---\n\n' + text : text);
    } catch (err: any) {
      console.error(err);
      alert('Failed to read PDF: ' + err.message);
    } finally {
      setIsExtracting(false);
      e.target.value = '';
    }
  };

  const handleCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCV(true);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await extractTextFromPdfFile(file);
      } else {
        text = await file.text();
      }
      onAddCV({
        name: cvUploadForm.name || file.name.replace(/\.[^/.]+$/, ''),
        type: cvUploadForm.type,
        text: text.trim(),
        fileName: file.name,
      });
      setCvUploadForm({ name: '', type: 'Consulting' });
      if (cvFileRef.current) cvFileRef.current.value = '';
    } catch (err) {
      console.error('CV upload failed', err);
    }
    setIsUploadingCV(false);
  };

  return (
    <div className="settings-section">
      {/* Master CV / Bio */}
      <div className="card" style={{ border: '1px solid var(--accent-glow)', background: 'rgba(212, 175, 55, 0.03)' }}>
        <div className="card-header">
          <div className="card-title" style={{ color: 'var(--accent)' }}>📄 Master CV / Bio</div>
          <div className="card-subtitle">The default profile — used by the AI Interview Coach, and as the fallback CV whenever an application doesn't use one of your tailored CVs below</div>
        </div>
        <div className="card-body">
          <textarea
            className="input"
            style={{ minHeight: 180, border: '1px solid rgba(212, 175, 55, 0.2)', fontSize: 13.5, lineHeight: 1.6 }}
            placeholder="Paste your key experiences, achievements, and core profile here... (e.g., 'Senior Scientist with 5 years in Biotech...')"
            value={cvBio}
            onChange={e => onCvBioChange(e.target.value)}
          />
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Or upload a Master PDF CV to automatically extract text:
            </span>
            <label className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, position: 'relative', overflow: 'hidden' }}>
              {isExtracting ? '⏳ Extracting...' : '📄 Upload Master CV'}
              <input type="file" accept="application/pdf" style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} disabled={isExtracting} onChange={handleMasterUpload} />
            </label>
          </div>
        </div>
      </div>

      {/* Tailored CVs */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📋 Tailored CVs</div>
          <div className="card-subtitle">Store CVs tailored by job type — pick one per application in the Application Strategist modal, instead of the Master CV</div>
        </div>
        <div className="card-body">
          {savedCVs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {savedCVs.map(cv => (
                <div key={cv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: 18 }}>📄</span>
                  <div style={{ flex: 1 }}>
                    {editingCvId === cv.id ? (
                      <input
                        type="text"
                        value={editingCvName}
                        onChange={e => setEditingCvName(e.target.value)}
                        onBlur={() => {
                          if (editingCvName.trim()) onUpdateCV(cv.id, { name: editingCvName.trim() });
                          setEditingCvId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (editingCvName.trim()) onUpdateCV(cv.id, { name: editingCvName.trim() });
                            setEditingCvId(null);
                          }
                          if (e.key === 'Escape') setEditingCvId(null);
                        }}
                        autoFocus
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #d4af37', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 13, outline: 'none' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{cv.name}</div>
                        <button onClick={() => { setEditingCvId(cv.id); setEditingCvName(cv.name); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cv.type} · {cv.fileName || 'Pasted text'} · Added {cv.dateAdded} · {Math.round(cv.text.length / 4)} words approx.</div>
                  </div>
                  <select
                    value={cv.type}
                    onChange={e => onUpdateCV(cv.id, { type: e.target.value as SavedCV['type'] })}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}
                  >
                    {CV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={() => onDeleteCV(cv.id)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add a CV</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                className="input"
                placeholder="Name (e.g. Consulting - McKinsey 2025)"
                value={cvUploadForm.name}
                onChange={e => setCvUploadForm(f => ({ ...f, name: e.target.value }))}
                style={{ flex: 2, minWidth: 200 }}
              />
              <select
                value={cvUploadForm.type}
                onChange={e => setCvUploadForm(f => ({ ...f, type: e.target.value as SavedCV['type'] }))}
                style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', padding: '8px 10px', borderRadius: 8, fontSize: 13 }}
              >
                {CV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input ref={cvFileRef} type="file" accept=".pdf,.txt,.md" onChange={handleCVUpload} style={{ display: 'none' }} />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => cvFileRef.current?.click()}
                disabled={isUploadingCV}
                style={{ flex: 1 }}
              >
                {isUploadingCV ? '⏳ Extracting text...' : '📁 Upload PDF or TXT'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              PDF text will be extracted automatically. Formatting isn't preserved but the content is — that's what the AI uses.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
