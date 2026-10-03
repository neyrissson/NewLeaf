import { useState } from 'react';
import type { Company } from '../data/jobs';

interface Props {
  companies: Company[];
  onClose: () => void;
  onAdd: (companyId: string, companyName: string, title: string, link: string, dateDiscovered: string, description?: string, location?: string) => void;
}

export function ManualJobModal({ companies, onClose, onAdd }: Props) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    const company = companies.find(c => c.id === companyId);
    const today = new Date().toLocaleDateString('en-CA');
    // Fall back to company career page or website if no link given
    const finalLink = link.trim() || company?.careerPage || company?.website || '';
    onAdd(companyId, company?.name || companyId, title, finalLink, today, description, location.trim() || undefined);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="page-title" style={{ fontSize: 18 }}>Add Manual Job</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="label">Company</label>
              <select 
                className="input select" 
                value={companyId} 
                onChange={e => setCompanyId(e.target.value)}
              >
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Job Title</label>
              <input 
                className="input" 
                placeholder="e.g. Senior Associate" 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Job Link / URL <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
              <input 
                className="input" 
                placeholder="https://... (leave blank to use company career page)" 
                value={link} 
                onChange={e => setLink(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Location <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
              <input 
                className="input" 
                placeholder="e.g. Remote, Montreal (Hybrid)" 
                value={location} 
                onChange={e => setLocation(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Job Description (Paste for AI Synthesis)</label>
              <textarea 
                className="input" 
                style={{ height: 120, resize: 'vertical' }}
                placeholder="Paste the full job description here..." 
                value={description} 
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add to Feed ✓</button>
          </div>
        </form>
      </div>
    </div>
  );
}
