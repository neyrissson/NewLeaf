import type { Company, JobStatus, Industry } from '../data/jobs';
import { INDUSTRY_EMOJI } from '../data/jobs';
import { CompanyCard } from './CompanyCard';
import { CompanyDetail } from './CompanyDetail';
import { useState, useMemo } from 'react';

const ALL_INDUSTRIES: Industry[] = [
  'Biotech', 'Pharma', 'Consulting', 'Finance', 'VC', 'Research',
  'HealthTech', 'Innovation', 'AI', 'Tech', 'Startup', 'Government', 'Publisher',
];

interface DiscoveryProps {
  companies: Company[];
  onStatusChange: (id: string, status: JobStatus | undefined) => void;
  onAppliedChange: (id: string, applied: boolean) => void;
  onTalentCommunityChange: (id: string, joined: boolean) => void;
  onNotesChange: (id: string, notes: string) => void;
  onAddCompany: (company: Company) => void;
  onUpdateCompany: (id: string, updates: Partial<Company>) => void;
  onDeleteCompany: (id: string) => void;
  onInterestedJob: (companyId: string, companyName: string, title: string, link: string, dateDiscovered: string, description?: string, location?: string) => void;
  jobBriefs?: Record<string, { important: string, keywords: string[] }>;
  onGenerateBrief?: (job: {link: string, title: string, companyId: string, description?: string}) => void;
  onSaveContext?: (id: string, context: string) => void;
  onApplyRegistryFixes?: () => void;
  onScanCompanyJobs?: (company: Company) => Promise<void>;
}

const BLANK_FORM = {
  name: '', industry: 'Biotech' as Industry,
  website: '', careerPage: '', openApplicationUrl: '',
  linkedinUrl: '', indeedUrl: '', indeedRating: '',
  glassdoorUrl: '', glassdoorRating: '',
  possibleContact: '', coldCallEmail: '',
};

export function Discovery({
  companies, onStatusChange, onAppliedChange, onTalentCommunityChange, onNotesChange, onAddCompany, onUpdateCompany, onDeleteCompany, onInterestedJob,
  jobBriefs, onGenerateBrief, onSaveContext, onApplyRegistryFixes, onScanCompanyJobs,
}: DiscoveryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(companies[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState<Industry | 'all'>('all');
  const [appliedFilter, setAppliedFilter] = useState<'all' | 'applied' | 'not-applied'>('all');
  const [openAppFilter, setOpenAppFilter] = useState(false);
  const [linkedinOnlyFilter, setLinkedinOnlyFilter] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'industry'>('name');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  const filtered = useMemo(() => {
    const result = companies.filter(c => {
      const matchQuery =
        query === '' ||
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.industry.toLowerCase().includes(query.toLowerCase());
      const matchIndustry = industryFilter === 'all' || c.industry === industryFilter;
      const matchApplied =
        appliedFilter === 'all' ||
        (appliedFilter === 'applied' && c.applied) ||
        (appliedFilter === 'not-applied' && !c.applied);
      const matchOpen = !openAppFilter || !!c.openApplicationUrl;
      // LinkedIn-only: career page is a linkedin URL (no real ATS page to scrape)
      const isLinkedinOnly = !!c.careerPage && c.careerPage.includes('linkedin.com') && !c.website?.includes('linkedin.com');
      const matchLinkedinOnly = !linkedinOnlyFilter || isLinkedinOnly;
      return matchQuery && matchIndustry && matchApplied && matchOpen && matchLinkedinOnly;
    });

    return [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'industry') return a.industry.localeCompare(b.industry);
      return 0;
    });
  }, [companies, query, industryFilter, appliedFilter, openAppFilter, linkedinOnlyFilter, sortBy]);

  const selected = filtered.find(c => c.id === selectedId) ?? filtered[0] ?? null;

  const handleAdd = () => {
    if (!form.name.trim()) return;
    const newCompany: Company = {
      id: `user-${Date.now()}`,
      name: form.name.trim(),
      industry: form.industry,
      website: form.website.trim(),
      careerPage: form.careerPage.trim(),
      openApplicationUrl: form.openApplicationUrl.trim() || undefined,
      linkedinUrl: form.linkedinUrl.trim() || undefined,
      indeedUrl: form.indeedUrl.trim() || undefined,
      indeedRating: form.indeedRating ? parseFloat(form.indeedRating) : undefined,
      glassdoorUrl: form.glassdoorUrl.trim() || undefined,
      glassdoorRating: form.glassdoorRating ? parseFloat(form.glassdoorRating) : undefined,
      possibleContact: form.possibleContact.trim() || undefined,
      coldCallEmail: form.coldCallEmail.trim() || undefined,
      applied: false,
      talentCommunity: false,
      status: 'interested',
      notes: '',
    };
    onAddCompany(newCompany);
    setSelectedId(newCompany.id);
    setForm(BLANK_FORM);
    setShowAddPanel(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Filter bar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input-wrap" style={{ flex: '1 1 180px' }}>
          <span className="search-icon">🔍</span>
          <input id="discovery-search" className="input" placeholder="Search companies or industry…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <select id="industry-filter" className="input select" style={{ width: 'auto' }} value={industryFilter} onChange={e => setIndustryFilter(e.target.value as Industry | 'all')}>
          <option value="all">All Industries</option>
          {ALL_INDUSTRIES.map(i => <option key={i} value={i}>{INDUSTRY_EMOJI[i]} {i}</option>)}
        </select>
        <select id="applied-filter" className="input select" style={{ width: 'auto' }} value={appliedFilter} onChange={e => setAppliedFilter(e.target.value as 'all' | 'applied' | 'not-applied')}>
          <option value="all">All</option>
          <option value="applied">Applied ✅</option>
          <option value="not-applied">Not Applied</option>
        </select>
        <button id="open-app-toggle" className={`btn ${openAppFilter ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setOpenAppFilter(v => !v)}>
          ✉️ Open App
        </button>
        <button
          id="linkedin-only-toggle"
          className={`btn ${linkedinOnlyFilter ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          onClick={() => setLinkedinOnlyFilter(v => !v)}
          title="Show only companies whose career page is LinkedIn — check these periodically for a real job board"
          style={linkedinOnlyFilter ? { background: '#0a66c2', color: '#fff', borderColor: '#0a66c2' } : { borderColor: '#0a66c2', color: '#0a66c2' }}
        >
          💼 LinkedIn-only ({companies.filter(c => !!c.careerPage && c.careerPage.includes('linkedin.com')).length})
        </button>
        <select id="sort-by" className="input select" style={{ width: 'auto' }} value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'industry')}>
          <option value="name">Sort by Name</option>
          <option value="industry">Sort by Industry</option>
        </select>
        {onApplyRegistryFixes && (
          <button className="btn btn-ghost btn-sm" onClick={onApplyRegistryFixes} title="Fix common link issues">
            🛠️ Repair
          </button>
        )}
        <button id="add-company-btn" className="btn btn-primary btn-sm" onClick={() => setShowAddPanel(v => !v)}>
          {showAddPanel ? '✕ Cancel' : '＋ Add Company'}
        </button>
      </div>

      {/* Add company panel */}
      {showAddPanel && (
        <div style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>
            ➕ Add Company to Watchlist
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div className="form-group">
              <label className="label" htmlFor="add-name">Company name *</label>
              <input id="add-name" className="input" placeholder="e.g. BioNtech" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="add-industry">Industry</label>
              <select id="add-industry" className="input select" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value as Industry }))}>
                {ALL_INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <button id="add-company-submit" className="btn btn-primary" onClick={handleAdd} disabled={!form.name.trim()} style={{ height: 38 }}>
              Add ✓
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { id: 'add-website', key: 'website', label: '🌐 Website URL' },
              { id: 'add-career', key: 'careerPage', label: '📋 Career page URL' },
              { id: 'add-openapp', key: 'openApplicationUrl', label: '✉️ Open application URL' },
              { id: 'add-linkedin', key: 'linkedinUrl', label: '💼 LinkedIn' },
              { id: 'add-indeed', key: 'indeedUrl', label: '🔍 Indeed URL' },
              { id: 'add-indeed-rate', key: 'indeedRating', label: '⭐ Indeed Rating' },
              { id: 'add-glassdoor', key: 'glassdoorUrl', label: '🏢 Glassdoor URL' },
              { id: 'add-glassdoor-rate', key: 'glassdoorRating', label: '⭐ Glassdoor Rating' },
              { id: 'add-contact', key: 'possibleContact', label: '👤 Contact' },
            ].map(({ id, key, label }) => (
              <div className="form-group" key={key}>
                <label className="label" htmlFor={id}>{label}</label>
                <input id={id} className="input" placeholder="(optional)" value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            💡 For the cleanest scan results, use a career page URL hosted on a known ATS —
            Greenhouse, Lever, Ashby, Workday, BambooHR, or Gem. Other pages still work via a
            generic scraper, but results can be thinner.
          </div>
        </div>
      )}

      <div className="split" style={{ flex: 1 }}>
        <div className="split-left">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <div className="empty-title">No results</div>
              <div className="empty-text">Try adjusting your filters, or add a new company.</div>
            </div>
          ) : (
            <div className="job-list">
              {filtered.map(c => (
                <CompanyCard key={c.id} company={c} selected={selected?.id === c.id} onClick={() => setSelectedId(c.id)} />
              ))}
            </div>
          )}
        </div>
        <div className="split-right">
          {selected ? (
            <CompanyDetail
              key={selected.id}
              company={selected}
              onStatusChange={onStatusChange}
              onAppliedChange={onAppliedChange}
              onTalentCommunityChange={onTalentCommunityChange}
              onNotesChange={onNotesChange}
              onUpdateCompany={onUpdateCompany}
              onDeleteCompany={onDeleteCompany}
              onInterestedJob={onInterestedJob}
              jobBriefs={jobBriefs}
              onGenerateBrief={onGenerateBrief}
              onSaveContext={onSaveContext}
              onScanJobs={onScanCompanyJobs}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-icon">👈</div>
              <div className="empty-title">Select a company</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-muted)' }}>
        Showing {filtered.length} of {companies.length} companies
      </div>
    </div>
  );
}
