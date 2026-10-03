import { useMemo } from 'react';
import type { Company, JobStatus, SubmittedApplication, RejectionReason } from '../data/jobs';
import { STATUS_LABELS, INDUSTRY_TAG, INDUSTRY_EMOJI } from '../data/jobs';

interface TrackerProps {
  companies: Company[];
  applications: SubmittedApplication[];
  onStatusChange: (id: string, status: JobStatus | undefined) => void;
  onAppliedChange: (id: string, applied: boolean) => void;
  onTalentCommunityChange: (id: string, joined: boolean) => void;
}

const REJECTION_LABELS: Record<RejectionReason, string> = {
  no_response: 'Ghosted',
  screening: 'Screened out',
  technical: 'Technical/case',
  cultural: 'Cultural fit',
  overqualified: 'Overqualified',
  underqualified: 'Missing skill',
  role_filled: 'Filled internally',
  other: 'Other',
};

export function Tracker({ companies, applications, onStatusChange, onAppliedChange, onTalentCommunityChange }: TrackerProps) {
  const appliedCount = applications.length;
  const interviewingCount = applications.filter(a => a.status === 'interviewing').length;
  const offerCount = applications.filter(a => a.status === 'offer').length;
  const rejectedCount = applications.filter(a => a.status === 'rejected').length;
  const pendingCount = applications.filter(a => a.status === 'applied').length;

  const responseRate = appliedCount > 0
    ? Math.round(((interviewingCount + offerCount) / appliedCount) * 100)
    : 0;

  const avgDaysToResponse = useMemo(() => {
    const responded = applications.filter(a => a.responseDate && a.dateSubmitted && a.status !== 'applied');
    if (!responded.length) return null;
    const total = responded.reduce((sum, a) => {
      const days = Math.round((new Date(a.responseDate!).getTime() - new Date(a.dateSubmitted).getTime()) / 86400000);
      return sum + Math.max(0, days);
    }, 0);
    return Math.round(total / responded.length);
  }, [applications]);

  const lastApplicationDaysAgo = useMemo(() => {
    if (!applications.length) return null;
    const latest = applications.reduce((a, b) => a.dateSubmitted > b.dateSubmitted ? a : b);
    return Math.round((Date.now() - new Date(latest.dateSubmitted).getTime()) / 86400000);
  }, [applications]);

  // Weekly application breakdown (last 8 weeks)
  const weeklyData = useMemo(() => {
    const weeks: { label: string; count: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - w * 7 - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const count = applications.filter(a => {
        const d = new Date(a.dateSubmitted);
        return d >= weekStart && d < weekEnd;
      }).length;
      const label = weekStart.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      weeks.push({ label, count });
    }
    return weeks;
  }, [applications]);

  const maxWeeklyCount = Math.max(...weeklyData.map(w => w.count), 1);

  // Rejection breakdown
  const rejectionBreakdown = useMemo(() => {
    const counts: Partial<Record<RejectionReason, number>> = {};
    applications.filter(a => a.status === 'rejected' && a.rejectionReason).forEach(a => {
      counts[a.rejectionReason!] = (counts[a.rejectionReason!] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number));
  }, [applications]);

  // Overdue follow-ups
  const overdueFollowUps = applications.filter(a => {
    if (a.followedUp || a.status === 'rejected' || a.status === 'offer') return false;
    if (!a.followUpDate) return false;
    return new Date(a.followUpDate) <= new Date();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Overdue follow-ups banner */}
      {overdueFollowUps.length > 0 && (
        <div style={{ padding: '12px 18px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: 14 }}>{overdueFollowUps.length} application{overdueFollowUps.length > 1 ? 's' : ''} overdue for follow-up</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {overdueFollowUps.map(a => a.jobTitle).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { label: 'Applications sent', value: appliedCount, icon: '📤', color: '#fff' },
          { label: 'In interviews', value: interviewingCount, icon: '🎯', color: 'var(--accent)' },
          { label: 'Offers', value: offerCount, icon: '🏆', color: '#10b981' },
          { label: 'Rejected', value: rejectedCount, icon: '❌', color: '#ef4444' },
          { label: 'Awaiting response', value: pendingCount, icon: '⏳', color: '#94a3b8' },
          { label: 'Response rate', value: `${responseRate}%`, icon: '📊', color: responseRate >= 20 ? '#10b981' : responseRate >= 10 ? '#fbbf24' : '#ef4444' },
          ...(avgDaysToResponse !== null ? [{ label: 'Avg days to response', value: `${avgDaysToResponse}d`, icon: '⏱️', color: '#94a3b8' }] : []),
          ...(lastApplicationDaysAgo !== null ? [{ label: 'Last application', value: `${lastApplicationDaysAgo}d ago`, icon: '📅', color: lastApplicationDaysAgo > 7 ? '#fbbf24' : '#10b981' }] : []),
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Application velocity chart */}
      {appliedCount > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">📈 Application Velocity</div>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Last 8 weeks</span>
          </div>
          <div style={{ padding: '8px 20px 20px', display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {weeklyData.map((w, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{w.count > 0 ? w.count : ''}</div>
                <div style={{
                  width: '100%', borderRadius: 4,
                  height: w.count > 0 ? `${Math.max(8, (w.count / maxWeeklyCount) * 64)}px` : '4px',
                  background: w.count > 0 ? 'linear-gradient(to top, rgba(212,175,55,0.8), rgba(212,175,55,0.4))' : 'rgba(255,255,255,0.05)',
                  transition: 'height 0.3s'
                }} />
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{w.label}</div>
              </div>
            ))}
          </div>
          {lastApplicationDaysAgo !== null && lastApplicationDaysAgo > 7 && (
            <div style={{ padding: '0 20px 16px', fontSize: 13, color: '#fbbf24' }}>
              ⚠️ You haven't applied anywhere in {lastApplicationDaysAgo} days. Keep the momentum going!
            </div>
          )}
        </div>
      )}

      {/* Rejection analysis */}
      {rejectionBreakdown.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">🔍 Rejection Analysis</div>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pattern recognition</span>
          </div>
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rejectionBreakdown.map(([reason, count]) => (
              <div key={reason} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 150, fontSize: 13, color: 'var(--text-muted)' }}>
                  {REJECTION_LABELS[reason as RejectionReason] || reason}
                </div>
                <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${((count as number) / rejectedCount) * 100}%`, background: 'rgba(239,68,68,0.6)', borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', width: 28, textAlign: 'right' }}>{count as number}</div>
              </div>
            ))}
            {rejectedCount > 0 && rejectionBreakdown.length < rejectedCount && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {rejectedCount - rejectionBreakdown.reduce((s, [, c]) => s + (c as number), 0)} rejection{rejectedCount > 1 ? 's' : ''} without a recorded reason — add them in Submitted Applications
              </div>
            )}
            {/* Insight */}
            {rejectionBreakdown[0] && (rejectionBreakdown[0][1] as number) >= 2 && (
              <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', fontSize: 13, color: '#fca5a5' }}>
                💡 Most common rejection: <strong>{REJECTION_LABELS[rejectionBreakdown[0][0] as RejectionReason]}</strong> ({rejectionBreakdown[0][1]}×).
                {rejectionBreakdown[0][0] === 'screening' && " Your CV or cover letter may need stronger keyword alignment."}
                {rejectionBreakdown[0][0] === 'no_response' && " Consider following up 7 days after applying."}
                {rejectionBreakdown[0][0] === 'technical' && " Consider more case prep — the Interview Coach can help."}
                {rejectionBreakdown[0][0] === 'underqualified' && " Look for roles with 'Associate' or entry-level equivalents in the target sector."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Company pipeline table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📋 Company Tracker</div>
          <span className="text-muted" style={{ fontSize: 14 }}>{companies.filter(c => c.applied).length} applied · {companies.filter(c => c.status === 'interviewing').length} interviewing</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tracker-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Industry</th>
                <th>Rating</th>
                <th>Links</th>
                <th>Applied</th>
                <th>Talent Community</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{INDUSTRY_EMOJI[c.industry]}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
                    </div>
                  </td>
                  <td><span className={`tag ${INDUSTRY_TAG[c.industry]}`}>{c.industry}</span></td>
                  <td style={{ fontSize: 14 }}>
                    {c.indeedRating ? `⭐ ${c.indeedRating.toFixed(1)}` : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {c.careerPage && <a href={c.careerPage} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11 }}>📋</a>}
                      {c.openApplicationUrl && <a href={c.openApplicationUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11, color: 'var(--emerald)' }}>✉️</a>}
                      {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11 }}>💼</a>}
                    </div>
                  </td>
                  <td>
                    <input type="checkbox" checked={c.applied} onChange={e => onAppliedChange(c.id, e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  </td>
                  <td>
                    <input type="checkbox" checked={c.talentCommunity} onChange={e => onTalentCommunityChange(c.id, e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--sky)', cursor: 'pointer' }} />
                  </td>
                  <td>
                    <select
                      className="input select"
                      style={{ width: 'auto', fontSize: 13, padding: '4px 28px 4px 10px' }}
                      value={c.status ?? 'none'}
                      onChange={e => {
                        const val = e.target.value;
                        onStatusChange(c.id, val === 'none' ? undefined : val as JobStatus);
                      }}
                    >
                      <option value="none">— No status —</option>
                      {(['interested', 'applied', 'interviewing', 'offer', 'rejected'] as JobStatus[]).map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
