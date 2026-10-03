import type { Company } from '../data/jobs';
import { INDUSTRY_TAG, STATUS_LABELS, STATUS_COLORS, INDUSTRY_EMOJI } from '../data/jobs';

interface CompanyCardProps {
  company: Company;
  selected: boolean;
  onClick: () => void;
}

export function CompanyCard({ company, selected, onClick }: CompanyCardProps) {
  return (
    <div
      className={`job-item ${selected ? 'selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      id={`company-${company.id}`}
    >
      <div className="job-logo">{INDUSTRY_EMOJI[company.industry]}</div>
      <div className="job-info">
        <div className="job-company">{company.industry}</div>
        <div className="job-title">{company.name}</div>
        <div className="job-meta">
          {company.indeedRating && (
            <span className="job-meta-item">🔍 {company.indeedRating.toFixed(1)}</span>
          )}
          {company.glassdoorRating && (
            <span className="job-meta-item" style={{ color: '#00a35c' }}>🏢 {company.glassdoorRating.toFixed(1)}</span>
          )}
          {company.possibleContact && (
            <span className="job-meta-item">👤 {company.possibleContact}</span>
          )}
          {company.openApplicationUrl && (
            <span className="job-meta-item text-accent">✨ Open App</span>
          )}
        </div>
        <div className="job-tags">
          <span className={`tag ${INDUSTRY_TAG[company.industry]}`}>{company.industry}</span>
          {company.openApplicationUrl && <span className="tag tag-emerald">Open App</span>}
          {company.applied && <span className="tag tag-sky">Applied</span>}
          {company.careerPage?.includes('linkedin.com') && (
            <span className="tag" style={{ background: 'rgba(10,102,194,0.15)', color: '#0a66c2', border: '1px solid rgba(10,102,194,0.3)', fontSize: 10 }} title="No direct job board — check LinkedIn periodically">💼 LI only</span>
          )}
          {company.status && (
            <span className={`status-pill ${STATUS_COLORS[company.status]}`}>
              {STATUS_LABELS[company.status]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
