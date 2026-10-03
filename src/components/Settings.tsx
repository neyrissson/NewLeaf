import { useState, type CSSProperties } from 'react';
import type { SubmittedApplication, Company } from '../data/jobs';
import { COMPANIES } from '../data/jobs';
import { DEFAULT_SWEEP_QUERIES } from '../utils/sweepConfig';
import { DEFAULT_GEO_ALLOWED, GEO_ALLOWED_KEY, loadGeoAllowed, pushGeoAllowed, CANADA_PROVINCES, PROVINCES_ALLOWED_KEY, loadProvincesAllowed, pushProvincesAllowed } from '../utils/geoConfig';
import { DEFAULT_NEGATIVE, DEFAULT_POSITIVE, NEGATIVE_KEY, POSITIVE_KEY, loadNegative, loadPositive } from '../utils/jobFilter';
import { OK_WORDS_KEY, TRASH_WORDS_KEY, DEFAULT_OK_WORDS, DEFAULT_TRASH_WORDS, loadOkWords, loadTrashWords } from '../utils/jobTitleFilter';
import type { Theme } from '../utils/theme';

interface Props {
  applications?: SubmittedApplication[];
  companies?: Company[];
  scoringProfile?: string;
  onScoringProfileChange?: (val: string) => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  discardedJobs?: string[];
  discardedTitles?: string[];
  onRemoveDiscardedJob?: (link: string) => void;
  onRemoveDiscardedTitle?: (title: string) => void;
  onClearDiscardedJobs?: () => void;
  onClearDiscardedTitles?: () => void;
}

export function Settings({ applications = [], companies = [], scoringProfile = '', onScoringProfileChange, theme, onThemeChange, discardedJobs = [], discardedTitles = [], onRemoveDiscardedJob, onRemoveDiscardedTitle, onClearDiscardedJobs, onClearDiscardedTitles }: Props) {
  const [saved, setSaved] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [discardFilter, setDiscardFilter] = useState('');

  // Dual-Engine AI Settings
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => localStorage.getItem('newleaf_anthropic_api_key') || '');
  const [scoringEngine, setScoringEngine] = useState<'ollama' | 'haiku'>(() => (localStorage.getItem('newleaf_scoring_engine') as any) || 'ollama');
  const [haikuUsage, setHaikuUsage] = useState<{input: number, output: number}>(() => {
    try {
      const u = JSON.parse(localStorage.getItem('newleaf_haiku_usage') || '{"input":0,"output":0}');
      return { input: Number(u.input) || 0, output: Number(u.output) || 0 };
    }
    catch { return {input:0,output:0}; }
  });

  // Calculate cost (Haiku 4.5 pricing: $1.00 / 1M input, $5.00 / 1M output)
  const totalCost = (haikuUsage.input / 1000000) * 1.00 + (haikuUsage.output / 1000000) * 5.00;

  const handleExportCSV = async () => {
    const el = (window as any).electron;
    if (!el?.exportCsv) return;
    setCsvExporting(true);
    try {
      const result = await el.exportCsv({ applications, companies });
      if (result) alert(`Exported to: ${result}`);
    } catch {}
    setCsvExporting(false);
  };

  // Full-pipeline JSON backup: every localStorage key (companies, applications,
  // fit scores, CV bank, interview answers, settings) in one restorable file.
  const handleBackupExport = async () => {
    const el = (window as any).electron;
    if (!el?.saveJsonFile) return;
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) data[key] = localStorage.getItem(key) || '';
    }
    const backup = { app: 'NewLeaf', version: 1, exportedAt: new Date().toISOString(), data };
    const path = await el.saveJsonFile({
      defaultName: `newleaf_backup_${new Date().toISOString().split('T')[0]}.json`,
      json: JSON.stringify(backup, null, 2)
    });
    if (path) alert(`✅ Full backup saved to:\n${path}`);
  };

  const handleBackupImport = async () => {
    const el = (window as any).electron;
    if (!el?.openJsonFile) return;
    const raw = await el.openJsonFile();
    if (!raw) return;
    try {
      const backup = JSON.parse(raw);
      if (backup?.app !== 'NewLeaf' || typeof backup?.data !== 'object' || backup.data === null) {
        alert('This file does not look like a NewLeaf backup.');
        return;
      }
      const count = Object.keys(backup.data).length;
      const when = (backup.exportedAt || '').split('T')[0] || 'unknown date';
      if (!confirm(`Restore ${count} data entries from the backup dated ${when}?\n\nThis OVERWRITES your current data, then reloads the app.`)) return;
      Object.entries(backup.data).forEach(([k, v]) => localStorage.setItem(k, String(v)));
      window.location.reload();
    } catch {
      alert('Could not read this backup file — invalid JSON.');
    }
  };

  // Aggregator sweep queries (one per line) — saved as you type
  const [sweepQueries, setSweepQueries] = useState(() =>
    localStorage.getItem('newleaf_sweep_queries') ?? DEFAULT_SWEEP_QUERIES
  );

  // Accepted work locations beyond Canada + remote (one per line)
  const [geoLocations, setGeoLocations] = useState(() => loadGeoAllowed().join('\n'));
  const parseGeoList = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);
  const saveGeoLocations = (text: string) => {
    setGeoLocations(text);
    const list = parseGeoList(text);
    localStorage.setItem(GEO_ALLOWED_KEY, JSON.stringify(list));
    pushGeoAllowed(list);  // takes effect on the next scan
  };
  // Called when the user finishes editing (blur) or resets. Nothing to prune: the Job Feed
  // judges every job's location live, so jobs that no longer match simply move to Dismissed.
  const applyGeoLocations = (text: string) => saveGeoLocations(text);

  // Which Canadian provinces count as "home" for on-site/hybrid roles. Defaults to
  // all of them; narrow temporarily (e.g. while work authorization is province-limited)
  // and widen back whenever that's no longer a constraint.
  const [provincesAllowed, setProvincesAllowedState] = useState(() => loadProvincesAllowed());
  const applyProvinces = (next: string[]) => {
    setProvincesAllowedState(next);
    localStorage.setItem(PROVINCES_ALLOWED_KEY, JSON.stringify(next));
    pushProvincesAllowed(next);  // takes effect on the next scan
  };
  const toggleProvince = (id: string) => {
    applyProvinces(provincesAllowed.includes(id) ? provincesAllowed.filter(p => p !== id) : [...provincesAllowed, id]);
  };

  // Pre-scoring filters (one entry per line). Saved as you type.
  const [negativeFilters, setNegativeFilters] = useState(() => loadNegative().join('\n'));
  const [positiveFilters, setPositiveFilters] = useState(() => loadPositive().join('\n'));
  const saveNegative = (text: string) => {
    setNegativeFilters(text);
    localStorage.setItem(NEGATIVE_KEY, JSON.stringify(text.split('\n').map(s => s.trim()).filter(Boolean)));
  };
  const savePositive = (text: string) => {
    setPositiveFilters(text);
    localStorage.setItem(POSITIVE_KEY, JSON.stringify(text.split('\n').map(s => s.trim()).filter(Boolean)));
  };

  // "Is this a job?" teaching lists — an OK list (rescues real jobs the built-in
  // patterns misjudge as junk) and a trash list (catches junk the patterns miss).
  const [okWords, setOkWords] = useState(() => loadOkWords().join('\n'));
  const [trashWords, setTrashWords] = useState(() => loadTrashWords().join('\n'));
  const saveOkWords = (text: string) => {
    setOkWords(text);
    localStorage.setItem(OK_WORDS_KEY, JSON.stringify(text.split('\n').map(s => s.trim()).filter(Boolean)));
  };
  const saveTrashWords = (text: string) => {
    setTrashWords(text);
    localStorage.setItem(TRASH_WORDS_KEY, JSON.stringify(text.split('\n').map(s => s.trim()).filter(Boolean)));
  };

  const handleSave = () => {
    localStorage.setItem('newleaf_anthropic_api_key', anthropicApiKey.trim());
    localStorage.setItem('newleaf_scoring_engine', scoringEngine);
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };

  const exportToCSV = () => {
    const headers = ['id', 'name', 'industry', 'website', 'careerPage', 'linkedinUrl', 'notes'];
    const csvRows = [headers.join(',')];

    COMPANIES.forEach(c => {
      const row = [
        c.id,
        `"${c.name.replace(/"/g, '""')}"`,
        c.industry,
        `"${(c.website || '').replace(/"/g, '""')}"`,
        `"${(c.careerPage || '').replace(/"/g, '""')}"`,
        `"${(c.linkedinUrl || '').replace(/"/g, '""')}"`,
        `"${(c.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `JobRadar_Companies_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="settings-section">
      {/* Appearance */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🎨 Appearance</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => onThemeChange('black')}
              style={{
                flex: 1, padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                background: theme === 'black' ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.03)',
                border: theme === 'black' ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: theme === 'black' ? 'var(--accent)' : 'var(--text-muted)'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>⚫ Black &amp; Gold</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>The original look</div>
            </button>
            <button
              onClick={() => onThemeChange('blue')}
              style={{
                flex: 1, padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                background: theme === 'blue' ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.03)',
                border: theme === 'blue' ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: theme === 'blue' ? 'var(--accent)' : 'var(--text-muted)'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>🔵 Blue &amp; Gold</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Navy surfaces, same gold accents</div>
            </button>
          </div>
        </div>
      </div>

      {/* AI Scoring Engine Setup */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">🤖 AI Scoring Engine</div>
            <div className="card-subtitle">Choose the engine that evaluates your job feed and powers the Application Strategist (cover letters, strategy, "why this company").</div>
          </div>
          {scoringEngine === 'haiku' && (
            <div style={{ fontSize: 13, background: 'rgba(212,175,55,0.1)', padding: '4px 10px', borderRadius: 20, color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}
                 title={`Job-scoring only (in: ${haikuUsage.input.toLocaleString()} tok, out: ${haikuUsage.output.toLocaleString()} tok at $1/$5 per M). Application Strategist usage (cover letters, strategy, "why this company") isn't tracked here yet. Check console.anthropic.com for your true total bill.`}>
              <span>💸 Scoring spend:</span>
              <strong style={{ fontFamily: 'monospace' }}>${totalCost.toFixed(3)}</strong>
              <button
                className="btn btn-ghost btn-xs"
                style={{ fontSize: 10, padding: '0 6px', height: 18, minHeight: 18, color: 'var(--sky)' }}
                title="Open your real Anthropic usage & billing page (console.anthropic.com)"
                onClick={() => {
                  const url = 'https://console.anthropic.com/settings/usage';
                  const el = (window as any).electron;
                  if (el?.openExternal) el.openExternal(url); else window.open(url, '_blank');
                }}
              >
                ↗ Check for real
              </button>
              <button
                className="btn btn-ghost btn-xs"
                style={{ fontSize: 10, padding: '0 6px', height: 18, minHeight: 18, color: 'var(--text-muted)' }}
                title="Reset the counter to zero (does not affect your Anthropic bill)"
                onClick={() => {
                  if (confirm('Reset the scoring-spend counter to $0.00?\n\nThis only clears NewLeaf\'s local estimate — it does not change anything on your Anthropic bill.')) {
                    localStorage.setItem('newleaf_haiku_usage', JSON.stringify({ input: 0, output: 0 }));
                    setHaikuUsage({ input: 0, output: 0 });
                  }
                }}
              >
                ↺ Reset
              </button>
            </div>
          )}
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => setScoringEngine('ollama')}
              style={{
                flex: 1, padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                background: scoringEngine === 'ollama' ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.03)',
                border: scoringEngine === 'ollama' ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: scoringEngine === 'ollama' ? 'var(--accent)' : 'var(--text-muted)'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>🦙 Local Ollama (Llama 3)</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>100% Free & Private • Slower • Requires local server</div>
            </button>
            <button
              onClick={() => setScoringEngine('haiku')}
              style={{
                flex: 1, padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                background: scoringEngine === 'haiku' ? 'rgba(16, 163, 127, 0.15)' : 'rgba(255,255,255,0.03)',
                border: scoringEngine === 'haiku' ? '1px solid #10a37f' : '1px solid var(--border)',
                color: scoringEngine === 'haiku' ? '#10a37f' : 'var(--text-muted)'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>⚡️ Anthropic API (Claude 3.5 Haiku)</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Blazing Fast • Incredible JSON IQ • Costs ~$0.001 / job</div>
            </button>
          </div>

          {scoringEngine === 'haiku' && (
            <div className="form-group" style={{ marginTop: 12, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px dashed var(--border)' }}>
              <label className="label" htmlFor="anthropic-key">Anthropic API Key</label>
              <input
                id="anthropic-key"
                type="password"
                className="input"
                value={anthropicApiKey}
                onChange={e => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Your key is stored purely locally. Get one from console.anthropic.com.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scoring Profile */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🎯 Scoring Profile</div>
          <div className="card-subtitle">Not a CV — a short factual snapshot the AI compares against every job description to score your fit. Manage your actual CVs in the CV Bank tab.</div>
        </div>
        <div className="card-body">
          <textarea
            className="input"
            rows={6}
            style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit' }}
            value={scoringProfile}
            onChange={e => {
              onScoringProfileChange?.(e.target.value);
              localStorage.removeItem('newleaf_fit_scores');
            }}
            placeholder="e.g. PhD molecular biology, Python bioinformatics, scientific writing, software projects..."
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Factual only — no "seeking" language. Keep it under 300 words (shorter = faster scoring).
            Editing this clears all cached scores.
            {scoringProfile && <span style={{ marginLeft: 8, opacity: 0.6 }}>~{scoringProfile.split(/\s+/).filter(Boolean).length} words</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">📍 Accepted Work Locations</div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {import.meta.env.VITE_DEMO_MODE === 'true' ? (
              <>Canada only: <strong style={{ color: 'var(--text)' }}>remote</strong> roles must be based in Canada,
              and <strong style={{ color: 'var(--text)' }}>on-site/hybrid</strong> roles must match a city listed
              below (one per line) — nothing else qualifies.</>
            ) : (
              <>The scraper always keeps any <strong style={{ color: 'var(--text)' }}>remote</strong> role. For
              <strong style={{ color: 'var(--text)' }}> on-site and hybrid</strong> roles, Canada is limited to the provinces checked below —
              uncheck a province to stop seeing on-site jobs there (handy if work authorization only covers part of the
              country right now). List any additional cities/states/regions below (one per line) that should also be kept —
              everything else on-site, including the US, is filtered out.</>
            )} Already-discovered jobs that don't match move to <strong style={{ color: 'var(--text)' }}>Dismissed</strong> in
            the Job Feed (so you don't pay to score them) and come straight back if you add the location again.
          </p>
          {import.meta.env.VITE_DEMO_MODE !== 'true' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CANADA_PROVINCES.map(({ id, label }) => {
                  const checked = provincesAllowed.includes(id);
                  return (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: checked ? 'var(--text)' : 'var(--text-muted)' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleProvince(id)} />
                      {label}
                    </label>
                  );
                })}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-muted)' }}
                onClick={() => applyProvinces(CANADA_PROVINCES.map(p => p.id))}
              >
                ↺ Select all provinces
              </button>
            </div>
          )}
          <textarea
            className="input"
            rows={5}
            value={geoLocations}
            onChange={e => saveGeoLocations(e.target.value)}
            onBlur={e => applyGeoLocations(e.target.value)}
            placeholder={"san francisco\nnew york\nboston"}
            style={{ fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
          />
          <button
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-muted)' }}
            onClick={() => applyGeoLocations(DEFAULT_GEO_ALLOWED.join('\n'))}
          >
            ↺ Reset to defaults
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">🧮 Scoring Filters (save Haiku cost)</div>
          <div className="card-subtitle">Free, local pre-filters that decide which jobs "Score Unscored" will pay to score. Editable — changes apply next time you open the Job Feed.</div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">🚫 Drop these roles (title contains — one phrase per line)</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 6px' }}>
              A job whose <strong>title</strong> contains any of these is <strong>Dismissed</strong> (never scored unless you override). Keep these specific — sales / account-exec are intentionally left out since they're often scientific in biotech. Built in as English + French pairs; accents and capitals don't matter.
            </p>
            <textarea
              className="input"
              rows={6}
              value={negativeFilters}
              onChange={e => saveNegative(e.target.value)}
              placeholder={"customer service\nreceptionist\nwarehouse"}
              style={{ fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}
              onClick={() => saveNegative(DEFAULT_NEGATIVE.join('\n'))}>
              ↺ Reset drop-list
            </button>
          </div>

          <div>
            <label className="label">✅ Relevance keywords (description must contain ≥1 — one per line)</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 6px' }}>
              A job's <strong>description</strong> must mention at least one of these to be scorable. If a description has none → Dismissed. If a job has <strong>no description</strong> → it goes to "Needs a description" (paste one in the feed to promote it). Every English keyword has a French counterpart in the list (accents and capitals don't matter), so French postings are judged the same way.
            </p>
            <textarea
              className="input"
              rows={6}
              value={positiveFilters}
              onChange={e => savePositive(e.target.value)}
              placeholder={"biology\ngenomics\npython\nconsulting"}
              style={{ fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}
              onClick={() => savePositive(DEFAULT_POSITIVE.join('\n'))}>
              ↺ Reset keywords
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">🏷️ "Is this a job?" filter</div>
          <div className="card-subtitle">
            Career sites sometimes mix in non-job pages (policy pages, application FAQs) that get scraped alongside
            real postings. Built-in patterns catch most of it, but these two lists let you teach it directly instead
            of reporting each miss — or just click "✓ This is a job" on a wrongly-flagged card in the feed.
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">✅ Always a real job (title contains — one phrase per line)</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 6px' }}>
              Rescues real jobs the built-in patterns wrongly flag as junk (e.g. an unconventional or industry-specific title).
            </p>
            <textarea
              className="input"
              rows={4}
              value={okWords}
              onChange={e => saveOkWords(e.target.value)}
              placeholder={"illustrator\naudit"}
              style={{ fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
            {okWords.trim() && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}
                onClick={() => saveOkWords(DEFAULT_OK_WORDS.join('\n'))}>
                ↺ Clear list
              </button>
            )}
          </div>

          <div>
            <label className="label">🚫 Never a real job (title contains — one phrase per line)</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 6px' }}>
              Catches junk the built-in patterns miss. These land in Dismissed, same as anything else — not deleted.
            </p>
            <textarea
              className="input"
              rows={4}
              value={trashWords}
              onChange={e => saveTrashWords(e.target.value)}
              placeholder={"product quality & safety"}
              style={{ fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
            {trashWords.trim() && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}
                onClick={() => saveTrashWords(DEFAULT_TRASH_WORDS.join('\n'))}>
                ↺ Clear list
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">🌐 Aggregator Sweep (LinkedIn)</div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            After each full scan, NewLeaf also searches LinkedIn's public job listings for these queries
            (Montreal area + remote-in-Canada, last 7 days) and adds the results to the Job Feed under
            "LinkedIn Sweep" — catching companies outside your registry. One query per line; leave empty to disable.
          </p>
          <textarea
            className="input"
            rows={4}
            value={sweepQueries}
            onChange={e => { setSweepQueries(e.target.value); localStorage.setItem('newleaf_sweep_queries', e.target.value); }}
            placeholder={"bioinformatics\ncomputational biology"}
            style={{ fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">🗑️ Discarded Jobs</div>
          <div className="card-subtitle">
            Every job you've ever deleted (by link) or dismissed permanently (by title) lives here, forever, silently
            excluded from every future scan. Removing an entry below doesn't restore the job itself — it just lets
            your next scan find it again.
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            className="input"
            placeholder="Filter by title or link..."
            value={discardFilter}
            onChange={e => setDiscardFilter(e.target.value)}
          />
          {(() => {
            const q = discardFilter.trim().toLowerCase();
            const filteredTitles = discardedTitles.filter(t => !q || t.toLowerCase().includes(q));
            const filteredLinks = discardedJobs.filter(l => !q || l.toLowerCase().includes(q));
            const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5 };
            return (
              <>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="label" style={{ margin: 0 }}>By title ({filteredTitles.length}{filteredTitles.length !== discardedTitles.length ? ` of ${discardedTitles.length}` : ''})</label>
                    {discardedTitles.length > 0 && (
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--rose)', fontSize: 11 }}
                        onClick={() => { if (confirm(`Clear all ${discardedTitles.length} discarded titles? They'll be findable again on your next scan.`)) onClearDiscardedTitles?.(); }}>
                        Clear all
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                    {filteredTitles.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 2px' }}>Nothing here.</div>}
                    {filteredTitles.map(t => (
                      <div key={t} style={rowStyle}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--rose)', flexShrink: 0 }} onClick={() => onRemoveDiscardedTitle?.(t)}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="label" style={{ margin: 0 }}>By link ({filteredLinks.length}{filteredLinks.length !== discardedJobs.length ? ` of ${discardedJobs.length}` : ''})</label>
                    {discardedJobs.length > 0 && (
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--rose)', fontSize: 11 }}
                        onClick={() => { if (confirm(`Clear all ${discardedJobs.length} discarded links? They'll be findable again on your next scan.`)) onClearDiscardedJobs?.(); }}>
                        Clear all
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                    {filteredLinks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 2px' }}>Nothing here.</div>}
                    {filteredLinks.map(l => (
                      <div key={l} style={rowStyle}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{l}</span>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--rose)', flexShrink: 0 }} onClick={() => onRemoveDiscardedJob?.(l)}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">📤 Data Management</div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text)' }}>Full backup</strong> saves everything — companies, discovered jobs,
            applications, fit scores, CV bank, interview answers, and settings — as one JSON file you can restore anytime.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleBackupExport} style={{ flex: 1, justifyContent: 'center' }}>
              💾 Full Backup (JSON)
            </button>
            <button className="btn btn-ghost" onClick={handleBackupImport} style={{ flex: 1, justifyContent: 'center' }}>
              ♻️ Restore from Backup
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Export your applications as a CSV file — with status, follow-up dates, rejection reasons, and notes.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={handleExportCSV} disabled={csvExporting} style={{ flex: 1, justifyContent: 'center' }}>
              {csvExporting ? '⏳ Exporting...' : '📊 Export Applications to CSV'}
            </button>
            <button className="btn btn-ghost" onClick={exportToCSV} style={{ flex: 1, justifyContent: 'center' }}>
              🏢 Export Companies to CSV
            </button>
          </div>
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-primary" onClick={handleSave} id="save-settings-btn">
          {saved ? '✅ Saved!' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  );
}
