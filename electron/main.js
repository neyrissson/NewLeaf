const { app, BrowserWindow, shell, ipcMain } = require('electron')
// Newer Chromium (Electron 41+) renders a fully blank window on this Mac's GPU
// (Radeon Pro 560X + Intel UHD 630) — confirmed via --disable-gpu fixing it outright.
// Must be called before app.whenReady()/ready.
app.disableHardwareAcceleration()
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')
const net = require('net')
const geoData = require('./geoData.js')

// Electron app.isPackaged tells us if we're running the compiled .app
// But sometimes we want to manually test prod build without packaging.
const isDev = !app.isPackaged && !__dirname.includes('Contents/Resources/app') && !process.env.PROD_TEST;

// NewLeaf 2.0 is the demo copy (separate bundle, separate userData — see repackage
// notes). It runs a stricter Canada-only geo policy; see isGeoExcludedNode below.
// Read directly from the bundled package.json rather than app.name: Electron's
// app.name fallback (when a bundle isn't rebranded past the generic "Electron"
// CFBundleName) changed between versions — 34 fell back to the .app folder's own
// name, 41 uses package.json's "name" instead. Reading package.json ourselves
// sidesteps that entirely and works the same on any Electron version.
const IS_DEMO_BUILD = require('../package.json').name === 'newleaf-demo';

let viteProcess = null

function checkFailsafe() {
  const userDataPath = app.getPath('userData');
  const failsafePath = path.join(userDataPath, 'last_launch.json');
  const now = Date.now();
  
  try {
    if (fs.existsSync(failsafePath)) {
      const data = JSON.parse(fs.readFileSync(failsafePath, 'utf8'));
      if (now - data.lastLaunch < 2000) {
        return false;
      }
    }
  } catch (e) {
    // Ignore read errors
  }
  
  try {
    fs.writeFileSync(failsafePath, JSON.stringify({ lastLaunch: now }));
  } catch (e) {}

  return true;
}

function startVite() {
  const vite = path.join(__dirname, '..', 'node_modules', 'vite', 'dist', 'node', 'cli.js')
  viteProcess = spawn(process.execPath, [vite, '--port', '5177'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    detached: false,
  })
}

function createWindow() {
  let iconPath = path.join(__dirname, '..', 'public', 'final_tree_icon_fixed.icns');
  const hasIcon = fs.existsSync(iconPath);

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'NewLeaf',
    backgroundColor: '#0a0b10',
    titleBarStyle: 'hiddenInset', // macOS: compact native title bar
    webPreferences: {
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    ...(hasIcon ? { icon: iconPath } : {}),
  })

  if (process.platform === 'darwin' && hasIcon) {
    try {
      app.dock.setIcon(iconPath)
    } catch (e) {
      console.warn("Failed to set dock icon", e)
    }
  }

  // Open external links in the system browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    // DEV MODE: Try to load the Vite dev server — retry until it's ready
    const tryLoad = (attempts = 0) => {
      win.loadURL('http://localhost:5177').catch(() => {
        if (attempts < 20) setTimeout(() => tryLoad(attempts + 1), 500)
      })
    }
    tryLoad()
  } else {
    // PROD MODE: Load the built index.html from Vite's dist dir
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Remove default menu bar on Windows/Linux
  if (process.platform !== 'darwin') win.setMenuBarVisibility(false)
}

// (Single persistent scraper window replaced by the scraper window pool below)

// --- Geographic filter (Node-side scrapers) ---
// User rule: based in Montreal — keep any Canada position OR any remote position.
// Drop on-site/hybrid roles outside Canada (including US on-site).
const GEO_INTL_REGEX = /\b(china|india|uk|united kingdom|england|scotland|wales|britain|germany|france|japan|brazil|austria|spain|italy|dubai|singapore|wuhan|beijing|shanghai|korea|seoul|australia|sydney|ireland|dublin|emea|apac|europe|switzerland|basel|zurich|london|netherlands|amsterdam|belgium|taiwan|hong kong|israel|sweden|denmark|portugal|poland|russia|mexico|argentina|chile|colombia|peru|south africa|egypt|nigeria|kenya|new zealand|auckland|melbourne|brisbane|perth|tokyo|osaka|kyoto|milan|rome|paris|lyon|berlin|munich|frankfurt|hamburg|madrid|barcelona|lisbon|vienna|geneva|stockholm|copenhagen|oslo|helsinki|warsaw|prague|budapest|athens|istanbul|abu dhabi|tel aviv|mumbai|delhi|bangalore|bengaluru|gurugram|gurgaon|noida|pune|kolkata|ahmedabad|chandigarh|kochi|coimbatore|jaipur|indore|nagpur|karachi|lahore|dhaka|colombo|hyderabad|chennai|manila|bangkok|kuala lumpur|jakarta|ho chi minh|hanoi|taipei|busan|costa rica|puerto rico|saudi arabia|qatar|johannesburg|cape town)\b/i;
const GEO_US_REGEX = /\b(usa|u\.s\.|united states|california|massachusetts|new jersey|texas|florida|illinois|pennsylvania|north carolina|maryland|georgia|colorado|arizona|minnesota|michigan|ohio|indiana|tennessee|missouri|wisconsin|virginia|connecticut|oregon|utah|san francisco|south san francisco|boston|seattle|san diego|chicago|los angeles|austin|cambridge|raleigh|durham|bethesda|princeton|philadelphia|houston|denver|atlanta|miami|dallas|nashville|phoenix|minneapolis|pittsburgh|baltimore|waltham|lexington|emeryville|berkeley|palo alto|menlo park|redwood city|foster city|mountain view|sunnyvale|santa clara|san jose|irvine|thousand oaks|gaithersburg|rockville|tarrytown|new haven|ann arbor|salt lake city|kansas city|st\.? louis|new york|washington)\b/i;
// "Always keep" locations. Canada + remote are permanent; the extra allowed
// list (accepted US relocation targets) is user-configurable from Settings.
const GEO_CANADA_TERMS = 'canada|montreal|montréal|quebec|québec|ontario|toronto|vancouver|laval|ottawa|calgary|edmonton|winnipeg|halifax|ca-qc';
const GEO_DEFAULT_EXTRA = IS_DEMO_BUILD ? [] : [
  // SF Bay Area / California
  'san francisco','south san francisco','sf bay','bay area','california',
  'mountain view','sunnyvale','palo alto','menlo park','redwood city','foster city',
  'santa clara','san jose','cupertino','san mateo','emeryville','berkeley','oakland',
  // United States (whole country accepted) + notable cities kept for display/back-compat
  'united states','usa','new york','boston','san diego','la jolla','carlsbad','torrey pines',
  // Spain / Barcelona
  'barcelona','spain','madrid',
  // UK / Scotland / England
  'uk','united kingdom','england','london','cambridge','oxford','scotland','edinburgh','glasgow','wales','britain','great britain',
  // Ireland
  'ireland','dublin','cork','galway',
  // Italy
  'italy','milan','milano','rome','roma','turin','bologna'
];
const escapeReTerm = (s) => String(s).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '');
let geoExtraAllowed = GEO_DEFAULT_EXTRA.slice();
let allowedCountrySet = new Set();  // countries she authorized (e.g. 'uk','spain')
let allowedStateSet = new Set();    // US states / CA provinces she authorized (e.g. 'california')

// Which Canadian provinces count as "home" for ON-SITE/hybrid roles (real app only —
// remote stays unrestricted regardless of province, and the demo build has its own
// separate city-only policy, untouched by this). Defaults to all of them (today's
// "anywhere in Canada" behavior); must mirror CANADA_PROVINCES in geoConfig.ts.
const ALL_CA_PROVINCES = ['ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick', 'newfoundland', 'prince edward island'];
let provincesAllowed = ALL_CA_PROVINCES.slice();
let allowedProvinceSet = new Set(provincesAllowed);
// Terms (province names/abbreviations + their cities, from the shared geoData resolver)
// for the currently-allowed provinces, plus a bare "canada" as long as at least one
// province is allowed — an unspecified "Canada" location shouldn't be dropped just
// because the posting didn't say which province.
// Full names only (length > 2): 2-letter codes collide with ordinary words and other
// countries' codes — "ON" in "On-site", "QC" in "QC Analyst" (quality control), "NL" for
// the Netherlands. Ambiguous city names (Victoria, Hamilton, Waterloo) are left to the
// resolver below, which weighs the rest of the location ("Melbourne, Victoria, Australia").
const AMBIGUOUS_CA_CITIES = new Set(['victoria', 'hamilton', 'waterloo']);
const getCanadaHomeTerms = () => {
  if (provincesAllowed.length === 0) return [];
  const provinceTerms = Object.keys(geoData.CA_PROVINCES).filter(k => k.length > 2 && allowedProvinceSet.has(geoData.CA_PROVINCES[k]));
  const cityTerms = Object.keys(geoData.CITY_DB).filter(k => geoData.CITY_DB[k].c === 'canada' && !AMBIGUOUS_CA_CITIES.has(k) && allowedProvinceSet.has(geoData.CITY_DB[k].s));
  // The bare word "canada" is only a blanket keep while EVERY province is allowed. Once any is
  // unticked it must not match here, or "Calgary, Alberta, Canada" would sail through before the
  // province check below ever runs; an unspecified "Canada" is then handled by that check.
  const allProvinces = ALL_CA_PROVINCES.every(p => allowedProvinceSet.has(p));
  return [...(allProvinces ? ['canada'] : []), ...provinceTerms, ...cityTerms, ...(allowedProvinceSet.has('quebec') ? ['ca-qc'] : [])];
};

const geoHomeAlternation = () => {
  const terms = [...getCanadaHomeTerms(), ...geoExtraAllowed].map(escapeReTerm).filter(Boolean);
  return terms.length ? terms.join('|') : '(?!)';
};
let GEO_HOME_REGEX = new RegExp('\\b(' + geoHomeAlternation() + ')\\b', 'i');
// Demo build only: on-site roles must match one of HER LISTED cities specifically —
// unlike GEO_HOME_REGEX above, this deliberately excludes the baked-in Canada terms
// (which include city names like Toronto/Vancouver), since "anywhere in Canada" is
// not the demo's on-site rule — only the cities she's explicitly added qualify.
let GEO_EXTRA_ONLY_REGEX = new RegExp('\\b(' + (geoExtraAllowed.map(escapeReTerm).filter(Boolean).join('|') || '(?!)') + ')\\b', 'i');
const rebuildAllowedSets = () => {
  allowedCountrySet = new Set();
  allowedStateSet = new Set();
  geoExtraAllowed.forEach(term => {
    const c = geoData.classifyAllowedTerm(term);
    if (c.country) allowedCountrySet.add(c.country);
    if (c.state) allowedStateSet.add(c.state);
  });
};
const setGeoAllowed = (list) => {
  if (Array.isArray(list)) {
    geoExtraAllowed = list.map(s => String(s).trim()).filter(Boolean);
    GEO_HOME_REGEX = new RegExp('\\b(' + geoHomeAlternation() + ')\\b', 'i');
    GEO_EXTRA_ONLY_REGEX = new RegExp('\\b(' + (geoExtraAllowed.map(escapeReTerm).filter(Boolean).join('|') || '(?!)') + ')\\b', 'i');
    rebuildAllowedSets();
  }
};
const setProvincesAllowed = (list) => {
  if (Array.isArray(list)) {
    provincesAllowed = list.map(s => String(s).trim().toLowerCase()).filter(Boolean);
    allowedProvinceSet = new Set(provincesAllowed);
    GEO_HOME_REGEX = new RegExp('\\b(' + geoHomeAlternation() + ')\\b', 'i');
  }
};
rebuildAllowedSets();
const GEO_REMOTE_REGEX = /\b(remote|télétravail|teletravail|work from home|anywhere|distributed)\b/i;
const GEO_HYBRID_REGEX = /\b(hybrid|hybride)\b/i;

// t: title + location text, h: job URL. Returns true if the job should be dropped.
// Keep: Canada · remote · her allowed cities/states/countries · hybrid (when not clearly foreign).
// Uses the city→state→country resolver so "california" authorizes all CA cities and an
// unlisted foreign city (e.g. "Bengaluru") is resolved to its country and dropped.
const isGeoExcludedNode = (t, h) => {
  const text = (t || '').toLowerCase();
  const href = (h || '').toLowerCase().replace(/-/g, ' ');
  const combined = text + ' ' + href;

  if (IS_DEMO_BUILD) {
    // Demo policy: Canada only. Remote must resolve to Canada specifically (an
    // unspecified/foreign "remote" no longer qualifies); on-site/hybrid must match
    // one of the cities listed in Accepted Work Locations. Nothing else is kept —
    // no unresolved-defaults-to-keep, no blanket hybrid carve-out.
    const isRemote = GEO_REMOTE_REGEX.test(combined);
    const res = geoData.resolveLocation(combined);
    // Some boards list a remote job's countries as abbreviated pairs, e.g. "Remote -
    // US; CA" — here CA means Canada, not California (writing "US; California" that
    // way would be redundant phrasing no board actually uses this shorthand for).
    const usCaPair = /\bus\b\s*[;,/&]\s*ca\b|\bca\b\s*[;,/&]\s*us\b/i.test(combined);
    const isCanada = (res && res.country === 'canada') || new RegExp('\\b(' + GEO_CANADA_TERMS + ')\\b', 'i').test(combined) || usCaPair;
    if (isRemote) return !isCanada;
    return !(GEO_EXTRA_ONLY_REGEX.test(text) || GEO_EXTRA_ONLY_REGEX.test(href));
  }

  if (GEO_REMOTE_REGEX.test(combined)) return false;                 // remote → keep
  if (GEO_HOME_REGEX.test(text) || GEO_HOME_REGEX.test(href)) return false;  // her explicit term → keep
  // Resolve the location to a country/state and authorize by state/country
  let res = geoData.resolveLocation(combined);
  // "Decatur, IL": a US place written with a state code, which the resolver ignores on purpose (case-sensitive: original text)
  if (!res) { const st = geoData.usStateFromCode(t); if (st) res = { country: 'us', state: st }; }
  if (res) {
    // A listing that names Canada next to another country ("United States / Canada") resolves to
    // whichever came first — still judge its Canadian part by province.
    if (res.country === 'canada' || /\bcanada\b/.test(combined)) {
      const province = geoData.canadianProvince(combined);   // "Vancouver, Canada" → BC
      return province ? !allowedProvinceSet.has(province) : provincesAllowed.length === 0;
    }
    if (res.country && allowedCountrySet.has(res.country)) return false;
    if (res.state && allowedStateSet.has(res.state)) return false;
    return true;                                                     // resolved to a non-allowed place → drop
  }
  // Unresolved location → fall back to the legacy denylist (keep unknowns by default)
  const isIntl = GEO_INTL_REGEX.test(combined);
  if (!isIntl && GEO_HYBRID_REGEX.test(combined)) return false;      // US/unknown hybrid → keep
  return isIntl || GEO_US_REGEX.test(combined);
};

// --- HTML → plain text (for API-provided job descriptions) ---
const htmlEntityDecode = (s) => (s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, '&');

const htmlToText = (html, maxLen = 6000) => {
  if (!html) return '';
  // Greenhouse returns HTML-escaped content — unescape first if it looks escaped
  let h = html.includes('&lt;') && !html.includes('<') ? htmlEntityDecode(html) : html;
  return htmlEntityDecode(
    h.replace(/<script[\s\S]*?<\/script>/gi, '')
     .replace(/<style[\s\S]*?<\/style>/gi, '')
     .replace(/<br\s*\/?>/gi, '\n')
     .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
     .replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim().substring(0, maxLen);
};

// Shared HTTPS JSON GET (Node built-in, no browser window needed)
// --- Global network concurrency throttle ---
// A full scan fans workers out across many companies at once (3 concurrent), and each
// company's newly-found jobs are then each fetched (check-url-alive + fetch-job-description)
// via Promise.all with no cap — so a scan can briefly open dozens of simultaneous outbound
// requests from the main process. Capping total in-flight requests bounds concurrent
// DNS/socket load regardless of how many jobs/companies are in flight at once.
const NETWORK_MAX_CONCURRENT = 8;
let networkInFlight = 0;
const networkWaiters = [];
const networkThrottle = (fn) => new Promise((resolve, reject) => {
  const run = () => {
    networkInFlight++;
    fn().then(resolve, reject).finally(() => {
      networkInFlight--;
      const next = networkWaiters.shift();
      if (next) next();
    });
  };
  if (networkInFlight < NETWORK_MAX_CONCURRENT) run(); else networkWaiters.push(run);
});

const httpsGetJsonShared = (apiUrl, timeoutMs = 12000) => networkThrottle(() => new Promise((resolve, reject) => {
  const https = require('https');
  const req = https.get(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewLeaf/1.0)', 'Accept': 'application/json' },
    timeout: timeoutMs
  }, (res) => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.resume();
      return reject(new Error(`HTTP ${res.statusCode}`));
    }
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
}));

// --- Hidden scraper window pool ---
// Multiple companies can now scan in parallel: each in-flight scrape gets
// exclusive ownership of one hidden window, so loadURL() calls never race.
const SCRAPER_POOL_SIZE = 3;
const scraperPool = [];   // { win, busy }
const scraperWaiters = [];

const makePoolWindow = () => new BrowserWindow({
  show: false,
  webPreferences: { nodeIntegration: false, contextIsolation: true }
});

const acquireScraperWin = () => new Promise((resolve) => {
  // Drop destroyed windows from the pool
  for (let i = scraperPool.length - 1; i >= 0; i--) {
    if (scraperPool[i].win.isDestroyed()) scraperPool.splice(i, 1);
  }
  const free = scraperPool.find(e => !e.busy);
  if (free) { free.busy = true; return resolve(free); }
  if (scraperPool.length < SCRAPER_POOL_SIZE) {
    const entry = { win: makePoolWindow(), busy: true };
    scraperPool.push(entry);
    return resolve(entry);
  }
  scraperWaiters.push(resolve);
});

const releaseScraperWin = (entry) => {
  if (entry.win.isDestroyed()) {
    const i = scraperPool.indexOf(entry);
    if (i >= 0) scraperPool.splice(i, 1);
    const waiter = scraperWaiters.shift();
    if (waiter) {
      const fresh = { win: makePoolWindow(), busy: true };
      scraperPool.push(fresh);
      waiter(fresh);
    }
    return;
  }
  const waiter = scraperWaiters.shift();
  if (waiter) { waiter(entry); return; }  // hand over still-busy
  entry.busy = false;
};

// Scraper Backend
ipcMain.handle('scan-jobs', (event, params) => scanJobsCore(params, 0));
async function scanJobsCore(params, depth = 0) {
  try {
    const url = typeof params === 'string' ? params : params?.url;
    const discarded = Array.isArray(params?.discarded) ? params.discarded : [];
    const discardedTitles = Array.isArray(params?.discardedTitles) ? params.discardedTitles : [];

    if (!url || typeof url !== 'string' || !url.startsWith('http')) return [];

    // --- NODE-SIDE GREENHOUSE API SCRAPER INTERCEPTOR ---
    if (url.includes('greenhouse.io') && !url.includes('my.greenhouse.io')) {

      // Helper: reliable HTTPS GET using Node's built-in https module (works in all Electron versions)
      const httpsGetJson = (apiUrl) => new Promise((resolve, reject) => {
        const https = require('https');
        const req = https.get(apiUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewLeaf/1.0)', 'Accept': 'application/json' },
          timeout: 12000
        }, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });

      try {
        const urlObj = new URL(url);
        let slug = '';
        if (urlObj.pathname.includes('/embed/job_board')) {
          slug = urlObj.searchParams.get('board_id');
        } else {
          // e.g. /anthropic/jobs/5066977008 or /anthropic
          const parts = urlObj.pathname.split('/').filter(Boolean);
          if (parts[0] === 'embed') {
            slug = parts[2];
          } else {
            slug = parts[0];
          }
        }
        if (slug) {
            // content=true embeds the full (HTML-escaped) job description in the same response,
            // so scoring gets the real JD with zero extra requests
            const apiData = await httpsGetJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);

          const jobs = [];
          const today = new Date().toLocaleDateString('en-CA');
          (apiData.jobs || []).forEach(job => {
            const titleStr = (job.title || '').trim();
            const locationStr = (job.location?.name || '');
            if (!titleStr || titleStr.length < 3) return;

            // Apply geographic exclusion: keep Canada OR remote, drop on-site elsewhere
            if (isGeoExcludedNode(titleStr + ' ' + locationStr, job.absolute_url || '')) return;

            // Normalize to the posting page (strip apply-form artifacts so "View opening" lands on the job, not the form)
            const ghLink = (job.absolute_url || `https://job-boards.greenhouse.io/${slug}/jobs/${job.id}`)
              .replace(/\/application(_form)?\/?/i, '/').replace(/#.*$/, '').replace(/\/apply\/?$/i, '');
            jobs.push({
              title: titleStr,
              link: ghLink,
              dateDiscovered: 'Greenhouse API • ' + today,
              location: locationStr || '',
              description: htmlToText(job.content || '')
            });
          });
          
          const finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title));
          if (finalJobs.length > 0) return finalJobs.slice(0, 100);
          // If 0 after filtering, still return early to avoid falling through to broken browser scraper
          // Only fall through if the API call itself returned 0 jobs (company has none posted)
          if ((apiData.jobs || []).length > 0) return [];
        }
      } catch (err) {
        console.error('Node Greenhouse API fetch failed, falling back to browser window:', err.message);
      }
    } else if (url.includes('sepalai.com')) {
      try {
        const https = require('https');
        const fetchSepalJobs = () => new Promise((resolve, reject) => {
          const apiReqUrl = "https://api.nexus.sepalai.com/trpc/jobs.getPublicJobs?input=" + encodeURIComponent('{"json":{"searchQuery":""}}');
          const req = https.get(apiReqUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' },
            timeout: 12000
          }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              res.resume();
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });

        const apiData = await fetchSepalJobs();
        const rawJobs = apiData.result?.data || [];
        const jobs = [];
        const today = new Date().toLocaleDateString('en-CA');

        rawJobs.forEach(job => {
          const titleStr = (job.jobTitle || '').trim();
          if (!titleStr || titleStr.length < 3) return;

          const locationVal = (job.location || '').trim();
          const descText = (job.jobDescription || '').toLowerCase();
          
          let derivedLoc = locationVal;
          if (!derivedLoc) {
            if (descText.includes('montreal') || descText.includes('montréal')) {
              derivedLoc = 'Montreal';
            } else if (descText.includes('remote')) {
              derivedLoc = 'Remote';
            } else {
              derivedLoc = 'Remote';
            }
          }

          const h = `https://expert-hub.sepalai.com/jobs/${job.id}`;
          if (isGeoExcludedNode(titleStr + ' ' + derivedLoc, h)) return;

          jobs.push({
            title: titleStr,
            link: h,
            dateDiscovered: 'Sepal AI API • ' + today,
            location: derivedLoc
          });
        });

        const finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title));
        if (finalJobs.length > 0) return finalJobs.slice(0, 100);
        if (rawJobs.length > 0) return [];
      } catch (err) {
        console.error('Node Sepal AI API fetch failed, falling back to browser window:', err.message);
      }
    } else if (url.includes('work.turing.com')) {
      // --- TURING EXPERT NETWORK FAST PATH ---
      // POST https://work.turing.com/api/jobs/all {page,pageSize} → all public expert/gig roles (all remote)
      try {
        const apiData = await new Promise((resolve, reject) => {
          const https = require('https');
          const body = JSON.stringify({ page: 1, pageSize: 300 });
          const req = https.request('https://work.turing.com/api/jobs/all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; NewLeaf/1.0)' },
            timeout: 12000
          }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
          req.write(body); req.end();
        });
        const rawJobs = apiData.jobs || [];
        const today = new Date().toLocaleDateString('en-CA');
        const jobs = [];
        rawJobs.forEach(job => {
          const titleStr = (job.title || '').trim();
          if (!titleStr || titleStr.length < 3) return;
          const link = job.jobCode ? `https://work.turing.com/jobs?jobCode=${job.jobCode}` : 'https://work.turing.com/jobs';
          // All Turing expert roles are remote
          jobs.push({
            title: titleStr,
            link,
            dateDiscovered: 'Turing • ' + today,
            location: 'Remote',
            description: htmlToText(job.description || job.oneLinerDescription || '')
          });
        });
        const finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title));
        if (finalJobs.length > 0) return finalJobs.slice(0, 250);
        if (rawJobs.length > 0) return [];
      } catch (err) {
        console.error('Node Turing API fetch failed, falling back to browser window:', err.message);
      }
    } else if (url.includes('work.mercor.com') || url.includes('mercor.com')) {
      // --- MERCOR FAST PATH ---
      // The /explore page server-renders ALL active listings into __NEXT_DATA__
      // (React Query dehydratedState). No login/API token needed; descriptions embedded.
      try {
        const html = await httpsGetText('https://work.mercor.com/explore', 15000);
        const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!m) throw new Error('no __NEXT_DATA__');
        const nd = JSON.parse(m[1]);
        const queries = nd?.props?.pageProps?.dehydratedState?.queries || [];
        let rawJobs = [];
        for (const q of queries) {
          const arr = q?.state?.data?.listings;
          if (Array.isArray(arr) && arr.length) { rawJobs = arr; break; }
        }
        // Mercor tags most listings with a structured ISO-3166 alpha-3 eligibleLocation
        // allow-list (e.g. ["USA"], ["JPN"], ["CAN","USA","GBR",...]) — far more reliable
        // than scanning free-text descriptions (which mention countries incidentally,
        // e.g. "clients in Tokyo"). When present, trust it. Verified: every listing whose
        // location field names a foreign country ("Japan (remote)") DOES carry a matching
        // eligibleLocation code, and the 282 listings with no eligibleLocation are all
        // plain "Remote"/blank — so no free-text country parsing is needed here.
        const MERCOR_ALLOWED_ISO3 = new Set(['CAN', 'USA', 'GBR', 'IRL', 'ESP', 'ITA']);
        const today = new Date().toLocaleDateString('en-CA');
        const jobs = [];
        rawJobs.forEach(job => {
          if (job.status && job.status !== 'active') return;
          if (job.isPrivate) return;
          const titleStr = (job.title || '').trim();
          if (!titleStr || titleStr.length < 3) return;
          const elig = Array.isArray(job.eligibleLocation) ? job.eligibleLocation : [];
          if (elig.length && !elig.some(c => MERCOR_ALLOWED_ISO3.has(c))) return; // restricted to countries she can't work from
          const link = `https://work.mercor.com/explore?listingId=${job.listingId}`;
          const rate = (job.rateMin || job.rateMax)
            ? ` (${job.rateMin === job.rateMax ? '$' + job.rateMin : '$' + job.rateMin + '-' + job.rateMax}${job.payRateFrequency ? '/' + job.payRateFrequency.replace('per-', '') : ''})`
            : '';
          const locationStr = job.location || (job.workArrangement === 'remote' ? 'Remote' : '');
          // Safety-net pass on title+location only (never the full description — see note above).
          if (isGeoExcludedNode(titleStr + ' ' + locationStr, link)) return;
          jobs.push({
            title: titleStr + rate,
            link,
            dateDiscovered: 'Mercor • ' + today,
            location: locationStr || 'Remote',
            description: htmlToText(job.description || '')
          });
        });
        const finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title));
        if (finalJobs.length > 0) return finalJobs.slice(0, 500);
        if (rawJobs.length > 0) return [];
      } catch (err) {
        console.error('Node Mercor fetch failed, falling back to browser window:', err.message);
      }
    } else if (url.includes('jobs.gem.com')) {
      // --- GEM FAST PATH ---
      // POST https://jobs.gem.com/api/public/graphql/batch (public, no auth). One batched
      // call gets the board's job list; a second batched call gets every description at once.
      try {
        const slug = new URL(url).pathname.split('/').filter(Boolean)[0];
        if (!slug) throw new Error('no board slug in URL');
        const LIST_QUERY = `query JobBoardList($boardId: String!) { oatsExternalJobPostings(boardId: $boardId) { jobPostings { id extId title locations { id name city isoCountry isRemote extId } job { id department { id name extId } locationType employmentType } } } }`;
        const DETAIL_QUERY = `query ExternalJobPosting($boardId: String!, $extId: String!) { oatsExternalJobPosting(boardId: $boardId, extId: $extId) { descriptionHtml } }`;
        const gemPost = (body) => new Promise((resolve, reject) => {
          const https = require('https');
          const data = JSON.stringify(body);
          const req = https.request('https://jobs.gem.com/api/public/graphql/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; NewLeaf/1.0)' },
            timeout: 15000
          }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
          req.write(data); req.end();
        });

        const listResult = await gemPost([{ operationName: 'JobBoardList', query: LIST_QUERY, variables: { boardId: slug } }]);
        const rawJobs = listResult?.[0]?.data?.oatsExternalJobPostings?.jobPostings || [];

        // Fetched in chunks rather than one batch — a large board (Mercor-sized: 400+
        // listings) would otherwise build a single multi-megabyte POST body/response.
        let details = [];
        if (rawJobs.length > 0) {
          const GEM_DETAIL_CHUNK = 40;
          for (let i = 0; i < rawJobs.length; i += GEM_DETAIL_CHUNK) {
            const chunk = rawJobs.slice(i, i + GEM_DETAIL_CHUNK);
            const detailOps = chunk.map(j => ({ operationName: 'ExternalJobPosting', query: DETAIL_QUERY, variables: { boardId: slug, extId: j.extId } }));
            try {
              const chunkResult = await gemPost(detailOps);
              details.push(...(Array.isArray(chunkResult) ? chunkResult : []));
            } catch {
              details.push(...chunk.map(() => null)); // keep index alignment with rawJobs
            }
          }
        }

        const today = new Date().toLocaleDateString('en-CA');
        const jobs = [];
        rawJobs.forEach((job, i) => {
          const titleStr = (job.title || '').trim();
          if (!titleStr || titleStr.length < 3) return;
          const link = `https://jobs.gem.com/${slug}/${job.extId}`;
          const locationStr = (job.locations || []).map(l => l.name).filter(Boolean).join(' · ') || (job.job?.locationType === 'REMOTE' ? 'Remote' : '');
          const description = htmlToText(details[i]?.data?.oatsExternalJobPosting?.descriptionHtml || '');
          if (isGeoExcludedNode(titleStr + ' ' + locationStr, link)) return;
          jobs.push({
            title: titleStr,
            link,
            dateDiscovered: 'Gem • ' + today,
            location: locationStr || 'Remote',
            description
          });
        });
        const finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title));
        if (finalJobs.length > 0) return finalJobs.slice(0, 300);
        if (rawJobs.length > 0) return [];
      } catch (err) {
        console.error('Node Gem fetch failed, falling back to browser window:', err.message);
      }
    } else if (url.includes('jobs.lever.co')) {
      // --- LEVER API FAST PATH ---
      // https://api.lever.co/v0/postings/{slug}?mode=json — full postings incl. descriptionPlain
      try {
        const slug = new URL(url).pathname.split('/').filter(Boolean)[0];
        if (slug) {
          const rawJobs = await httpsGetJsonShared(`https://api.lever.co/v0/postings/${slug}?mode=json`);
          const today = new Date().toLocaleDateString('en-CA');
          const jobs = [];
          (Array.isArray(rawJobs) ? rawJobs : []).forEach(job => {
            const titleStr = (job.text || '').trim();
            if (!titleStr || titleStr.length < 3) return;
            const locationStr = [job.categories?.location, job.workplaceType].filter(Boolean).join(' · ');
            if (isGeoExcludedNode(titleStr + ' ' + locationStr, job.hostedUrl || '')) return;
            jobs.push({
              title: titleStr,
              link: job.hostedUrl || `https://jobs.lever.co/${slug}/${job.id}`,
              dateDiscovered: 'Lever API • ' + today,
              location: locationStr,
              description: (job.descriptionPlain || htmlToText(job.description || '')).substring(0, 6000)
            });
          });
          const finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title));
          if (finalJobs.length > 0) return finalJobs.slice(0, 100);
          if ((Array.isArray(rawJobs) ? rawJobs : []).length > 0) return [];
        }
      } catch (err) {
        console.error('Node Lever API fetch failed, falling back to browser window:', err.message);
      }
    } else if (url.includes('myworkdayjobs.com')) {
      // --- WORKDAY API FAST PATH ---
      // CXS JSON API: POST https://{tenant}.{dc}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
      try {
        const u = new URL(url);
        const host = u.hostname;                       // {tenant}.{dc}.myworkdayjobs.com
        const tenant = host.split('.')[0];
        const parts = u.pathname.split('/').filter(Boolean);
        // Drop a leading language code like en-US / fr-CA; the site is the next segment
        const site = /^[a-z]{2}-[A-Za-z]{2}$/.test(parts[0]) ? parts[1] : parts[0];
        if (tenant && site) {
          const base = `https://${host}`;
          const today = new Date().toLocaleDateString('en-CA');
          const jobs = [];
          const seen = new Set();
          // Paginate a bounded number of pages (Workday returns ~20/page)
          for (let offset = 0; offset < 140; offset += 20) {
            let data;
            try {
              data = await new Promise((resolve, reject) => {
                const https = require('https');
                const body = JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: '' });
                const req = https.request(`${base}/wday/cxs/${tenant}/${site}/jobs`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; NewLeaf/1.0)' },
                  timeout: 12000
                }, (res) => {
                  if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
                  let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
                });
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
                req.write(body); req.end();
              });
            } catch (e) { break; }

            const postings = data.jobPostings || [];
            if (postings.length === 0) break;
            postings.forEach(job => {
              const titleStr = (job.title || '').trim();
              if (!titleStr || titleStr.length < 3) return;
              const link = job.externalPath ? `${base}/${site}${job.externalPath}` : '';
              if (!link || seen.has(link)) return;
              // bulletFields order varies per tenant and often includes the requisition ID
              // (e.g. "R00352102") — pick the field that's an actual location, not a req ID.
              const bf = (job.bulletFields || []).map(x => String(x).trim()).filter(Boolean);
              const isReqId = (s) => /^[A-Za-z]{0,4}[-_ ]?\d{4,}$/.test(s.replace(/\s+/g, ''));
              let displayLoc = bf.find(f => !isReqId(f)) || '';
              // Fallback + extra geo signal: the city is the first segment after /job/ in externalPath
              let pathLoc = '';
              if (job.externalPath) {
                const seg = job.externalPath.split('/').filter(Boolean);
                const i = seg.indexOf('job');
                if (i >= 0 && seg[i + 1]) pathLoc = seg[i + 1].replace(/-/g, ' ');
              }
              if (!displayLoc) displayLoc = pathLoc;
              // Geo-check against ALL location signals (bullet fields + URL path city)
              if (isGeoExcludedNode(titleStr + ' ' + bf.join(' ') + ' ' + pathLoc, link)) return;
              seen.add(link);
              jobs.push({
                title: titleStr,
                link,
                dateDiscovered: 'Workday API • ' + today,
                location: displayLoc
              });
            });
            if (offset + 20 >= (data.total || 0)) break;
            if (jobs.length >= 100) break;
          }
          const finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title));
          // Return whatever we got (even 0) — the API path is authoritative for Workday
          if (finalJobs.length > 0 || seen.size > 0) return finalJobs.slice(0, 100);
        }
      } catch (err) {
        console.error('Node Workday API fetch failed, falling back to browser window:', err.message);
      }
    } else if (url.includes('bamboohr.com')) {
      // --- BAMBOOHR API FAST PATH ---
      // https://{sub}.bamboohr.com/careers/list — JSON of open positions
      try {
        const sub = new URL(url).hostname.split('.')[0];
        if (sub) {
          const apiData = await httpsGetJsonShared(`https://${sub}.bamboohr.com/careers/list`, 10000);
          const rawJobs = apiData.result || [];
          const today = new Date().toLocaleDateString('en-CA');
          const jobs = [];
          rawJobs.forEach(job => {
            const titleStr = (job.jobOpeningName || '').trim();
            if (!titleStr || titleStr.length < 3) return;
            const loc = job.location || {};
            const locationStr = [loc.city, loc.state, loc.country].filter(Boolean).join(', ') +
                                (job.isRemote === 'yes' || job.locationType === '1' ? ' Remote' : '');
            const link = `https://${sub}.bamboohr.com/careers/${job.id}`;
            if (isGeoExcludedNode(titleStr + ' ' + locationStr, link)) return;
            jobs.push({ id: job.id, title: titleStr, link, dateDiscovered: 'BambooHR API • ' + today, location: locationStr.trim() });
          });
          let finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title)).slice(0, 100);
          // Embed descriptions from the per-job detail API (BambooHR careers pages are JS SPAs)
          finalJobs = await Promise.all(finalJobs.map(async (j) => {
            try {
              const d = await httpsGetJsonShared(`https://${sub}.bamboohr.com/careers/${j.id}/detail`, 8000);
              const desc = htmlToText(d.result?.jobOpening?.description || d.jobOpening?.description || '');
              if (desc.length > 100) return { ...j, description: desc };
            } catch {}
            return j;
          }));
          if (finalJobs.length > 0) return finalJobs;
          if (rawJobs.length > 0) return [];
        }
      } catch (err) {
        console.error('Node BambooHR API fetch failed, falling back to browser window:', err.message);
      }
    } else if (url.includes('jobs.ashbyhq.com')) {
      // --- ASHBY API FAST PATH ---
      // https://api.ashbyhq.com/posting-api/job-board/{slug} — full postings incl. descriptionPlain
      try {
        const slug = new URL(url).pathname.split('/').filter(Boolean)[0];
        if (slug) {
          const apiData = await httpsGetJsonShared(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
          const rawJobs = apiData.jobs || [];
          const today = new Date().toLocaleDateString('en-CA');
          const jobs = [];
          rawJobs.forEach(job => {
            const titleStr = (job.title || '').trim();
            if (!titleStr || titleStr.length < 3) return;
            if (job.isListed === false) return;
            const locParts = [job.location, ...(job.secondaryLocations || []).map(l => l.location)].filter(Boolean);
            const locationStr = (job.isRemote ? 'Remote ' : '') + locParts.join(' / ');
            if (isGeoExcludedNode(titleStr + ' ' + locationStr, job.jobUrl || '')) return;
            jobs.push({
              title: titleStr,
              link: job.jobUrl || url,
              dateDiscovered: 'Ashby API • ' + today,
              location: locationStr.trim(),
              description: (job.descriptionPlain || htmlToText(job.descriptionHtml || '')).substring(0, 6000)
            });
          });
          const finalJobs = jobs.filter(j => !discarded.includes(j.link) && !discardedTitles.includes(j.title));
          if (finalJobs.length > 0) return finalJobs.slice(0, 100);
          if (rawJobs.length > 0) return [];
        }
      } catch (err) {
        console.error('Node Ashby API fetch failed, falling back to browser window:', err.message);
      }
    }
    // ----------------------------------------------------

    // Acquire an exclusive hidden window from the pool (parallel-scan safe)
    const poolEntry = await acquireScraperWin();
    const scrapeWin = poolEntry.win;
    let poolReleased = false;
    const releaseOnce = () => { if (!poolReleased) { poolReleased = true; releaseScraperWin(poolEntry); } };

    try {
    return await new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (val) => {
        if (!resolved) { resolved = true; resolve(val); }
      };

      const timeout = setTimeout(() => {
        // Just resolve empty if we stall for 15 seconds, don't destroy window
        if (!scrapeWin.isDestroyed()) scrapeWin.webContents.stop();
        safeResolve([]);
      }, 15000);

      // Clean old listeners
      scrapeWin.webContents.removeAllListeners('did-finish-load');

      scrapeWin.webContents.once('did-finish-load', async () => {
        try {
          const hostname = new URL(url).hostname;
          if (hostname.includes('greenhouse.io') && !hostname.includes('my.greenhouse.io')) {
            // Greenhouse uses boards-api, no rendering delay needed
            await new Promise(r => setTimeout(r, 100));
          } else if (
            hostname.includes('myworkdayjobs.com') || 
            hostname.includes('workforcenow.adp.com') || 
            hostname.includes('mckinsey.com') || 
            hostname.includes('jnj.com') || 
            hostname.includes('telixpharma.com') || 
            hostname.includes('regeneron.com') ||
            hostname.includes('google.com')
          ) {
            await new Promise(r => setTimeout(r, 6000));
          } else {
            // General 2.5 second delay for all other pages to allow JS rendering/hydration
            await new Promise(r => setTimeout(r, 2500));
          }
          if (scrapeWin.isDestroyed()) return;
          const result = await scrapeWin.webContents.executeJavaScript(`
            (async () => {
              const ATS = window.location.hostname;
              const today = new Date().toLocaleDateString('en-CA');
              const forbiddenTitles = ${JSON.stringify(Array.isArray(params?.discardedTitles) ? params.discardedTitles : [])};

              const normalizeTitle = (str) => {
                return str.toLowerCase()
                  .replace(/[-–—]/g, ' ')
                  .replace(/\\s+/g, ' ')
                  .replace(/\\b(montreal|montréal|canada|quebec|québec|ontario|toronto|vancouver|full time|permanent|remote|hybride?|hybrid|field based|field-based)\\b/g, '')
                  .trim();
              };
              // Keep: Canada (any) · remote (any) · hybrid in the US. Drop: on-site outside Canada, hybrid overseas.
              const isGeographicExcluded = (txt, urlStr) => {
                const t = decodeURIComponent(txt || '').toLowerCase();
                const h = decodeURIComponent(urlStr || '').toLowerCase().replace(/-/g, ' ');
                const intlRegex = /\\b(china|india|uk|united kingdom|england|scotland|wales|britain|germany|france|japan|brazil|austria|spain|italy|dubai|singapore|wuhan|beijing|shanghai|korea|seoul|australia|sydney|ireland|dublin|emea|apac|europe|switzerland|basel|zurich|london|netherlands|amsterdam|belgium|taiwan|hong kong|israel|sweden|denmark|portugal|poland|russia|mexico|argentina|chile|colombia|peru|south africa|egypt|nigeria|kenya|new zealand|auckland|melbourne|brisbane|perth|tokyo|osaka|kyoto|milan|rome|paris|lyon|berlin|munich|frankfurt|hamburg|madrid|barcelona|lisbon|vienna|geneva|stockholm|copenhagen|oslo|helsinki|warsaw|prague|budapest|athens|istanbul|abu dhabi|tel aviv|mumbai|delhi|bangalore|bengaluru|gurugram|gurgaon|noida|pune|kolkata|ahmedabad|chandigarh|kochi|coimbatore|jaipur|indore|nagpur|karachi|lahore|dhaka|colombo|hyderabad|chennai|manila|bangkok|kuala lumpur|jakarta|ho chi minh|hanoi|taipei|busan|costa rica|puerto rico|saudi arabia|qatar|johannesburg|cape town)\\b/i;
                const usRegex = /\\b(usa|u\\.s\\.|united states|california|massachusetts|new jersey|texas|florida|illinois|pennsylvania|north carolina|maryland|georgia|colorado|arizona|minnesota|michigan|ohio|indiana|tennessee|missouri|wisconsin|virginia|connecticut|oregon|utah|san francisco|south san francisco|boston|seattle|san diego|chicago|los angeles|austin|cambridge|raleigh|durham|bethesda|princeton|philadelphia|houston|denver|atlanta|miami|dallas|nashville|phoenix|minneapolis|pittsburgh|baltimore|waltham|lexington|emeryville|berkeley|palo alto|menlo park|redwood city|foster city|mountain view|sunnyvale|santa clara|san jose|irvine|thousand oaks|gaithersburg|rockville|tarrytown|new haven|ann arbor|salt lake city|kansas city|st\\.? louis|new york|washington)\\b/i;
                const homeRegex = new RegExp('\\\\b(' + ${JSON.stringify(geoHomeAlternation())} + ')\\\\b', 'i');
                const remoteRegex = /\\b(remote|télétravail|teletravail|work from home|anywhere|distributed)\\b/i;
                const hybridRegex = /\\b(hybrid|hybride)\\b/i;
                if (homeRegex.test(t) || homeRegex.test(h)) return false;
                if (remoteRegex.test(t) || remoteRegex.test(h)) return false;
                const isIntl = intlRegex.test(t) || intlRegex.test(h);
                if (!isIntl && (hybridRegex.test(t) || hybridRegex.test(h))) return false;
                return isIntl || usRegex.test(t) || usRegex.test(h);
              };

              const extractLocation = (el, titleText) => {
                const t = (titleText || el.textContent || '').toLowerCase();
                
                let isPartTime = t.includes('part-time') || t.includes('part time') || t.includes('temps partiel');
                let isRemote = t.includes('remote') || t.includes('télétravail') || t.includes('teletravail');
                let isHybrid = t.includes('hybrid') || t.includes('hybride');
                
                const parent = el.closest('li, tr, [class*="card"], [class*="item"], [class*="row"], [class*="job"]');
                if (parent) {
                  const pText = parent.textContent.toLowerCase();
                  if (!isRemote && (pText.includes('remote') || pText.includes('télétravail') || pText.includes('teletravail'))) {
                    isRemote = true;
                  }
                  if (!isHybrid && (pText.includes('hybrid') || pText.includes('hybride'))) {
                    isHybrid = true;
                  }
                  if (!isPartTime && (pText.includes('part-time') || pText.includes('part time') || pText.includes('temps partiel'))) {
                    isPartTime = true;
                  }
                  
                  const places = [
                    // Canada
                    'montreal', 'montréal', 'laval', 'toronto', 'vancouver', 'ottawa', 'quebec', 'québec', 'canada',
                    // USA
                    'san francisco', 'new york', 'boston', 'seattle', 'cambridge', 'san diego',
                    'chicago', 'los angeles', 'austin', 'raleigh', 'durham', 'washington',
                    'usa', 'united states'
                  ];
                  for (const place of places) {
                    if (pText.includes(place)) {
                      let city = place.charAt(0).toUpperCase() + place.slice(1);
                      if (city === 'Montréal') city = 'Montreal';
                      if (city === 'Québec') city = 'Quebec';
                      
                      let type = '';
                      if (isRemote) type = isPartTime ? 'Part-time Remote' : 'Remote';
                      else if (isHybrid) type = 'Hybrid';
                      else type = isPartTime ? 'Part-time' : '';
                      
                      return type ? city + ' (' + type + ')' : city;
                    }
                  }
                }
                
                if (isRemote) return isPartTime ? 'Part-time Remote' : 'Remote';
                if (isHybrid) return 'Hybrid';
                if (isPartTime) return 'Part-time';
                return '';
              };
              
              const genericParser = () => {
                const links = Array.from(document.querySelectorAll('a'));
                const currentUrl = window.location.href.toLowerCase().replace(/\\/$/, '');

                const jobLinks = links.filter(a => {
                  const text = a.textContent.trim();
                  const href = a.href.toLowerCase().replace(/\\/$/, '');

                  if (isGeographicExcluded(text, href)) return false;
                  
                  // Text length checks
                  if (text.length < 5 || text.length > 120) return false;

                  // Filter out same-page navigation links or anchor links
                  if (href === currentUrl || href.startsWith('javascript:') || href.startsWith('#')) return false;

                  // Nav/footer/junk filter
                  const textLow = text.toLowerCase();
                  const junkText = [
                    'sign in', 'log in', 'sign-in', 'log-out', 'cookie', 'privacy', 'terms', 'subscribe', 
                    'contact', 'about', 'learn more', 'read more', 'click here', 'view all', 'back to', 
                    'home', 'benefits', 'culture', 'diversity', 'inclusion', 'help', 'support', 
                    'faq', 'search', 'filter', 'clear', 'reset', 'navigation', 'menu', 'press', 
                    'news', 'blog', 'events', 'investors', 'partners', 'office', 'offices', 
                    'facebook', 'twitter', 'linkedin', 'instagram', 'youtube', 'github'
                  ];
                  if (junkText.some(j => textLow.includes(j) || href.includes(j))) return false;

                  // Positive indicators:
                  // 1. Known ATS domain
                  const atsDomains = ['ashbyhq.com','greenhouse.io','lever.co','myworkdayjobs.com','smartrecruiters.com','icims.com','taleo.net','breezy.hr','bamboohr.com','jobvite.com','dayforcehcm.com','workable.com','recruitee.com','personio.com','jobs.criver.com','talent.bayer.com'];
                  const isATS = atsDomains.some(d => href.includes(d));
                  if (isATS) return true;

                  // 2. URL contains a typical job/career path keyword
                  // Strictly matching individual job posting paths, NOT broad career directories like /careers/
                  const jobPathKeywords = ['/job/','/jobs/','/position/','/positions/','/opening/','/openings/','/apply/','/vacancy/','/vacancies/','/opportunity/','/opportunities/','/role/','/roles/','/offre/','/offres/','/poste/','/postes/','/detail/','/details/','/posting/','/postings/'];
                  const jobQueryParams = ['gh_jid=','jid=','jobId=','job_id=','reqId=','req_id=','jobReqId='];
                  const isJobPath = jobPathKeywords.some(kw => href.toLowerCase().includes(kw)) ||
                                    jobQueryParams.some(p => href.includes(p));
                  if (isJobPath) return true;

                  // 3. Current page is a careers page AND the link title looks like it could be a job title
                  // (if it doesn't match the job path directly, e.g. custom subdirectories like company.com/team/scientist)
                  const pageIsCareers = window.location.href.toLowerCase().includes('career') ||
                                        window.location.href.toLowerCase().includes('emploi') ||
                                        window.location.href.toLowerCase().includes('join') ||
                                        window.location.href.toLowerCase().includes('/jobs');
                  if (pageIsCareers && href.startsWith('http')) {
                    // Let's check if the link text could be a job title (excluding common non-job words)
                    const nonJobTitleWords = ['apply', 'view', 'read', 'share', 'like', 'next', 'previous', 'page', 'social', 'more', 'details', 'company', 'talent', 'network', 'why', 'join', 'about', 'login', 'create', 'profile', 'search', 'filter'];
                    const words = textLow.split(/\\s+/);
                    const isNonJob = words.some(w => nonJobTitleWords.includes(w));
                    if (!isNonJob) return true;
                  }

                  return false;
                }).map(a => {
                   let title = a.textContent.trim().replace(/\\s+/g, ' ');
                   if (title.length < 3 || ['view opening', 'apply', 'apply now', 'postuler'].includes(title.toLowerCase())) {
                      const heading = a.closest('h1, h2, h3, h4');
                      if (heading) title = heading.textContent.trim().replace(/\\s+/g, ' ');
                   }
                   
                   // Clean up location/metadata artifacts that get bundled into the link text on some sites
                   // E.g. "Scientist 2Pleasanton, California, USA HQPublié le il y a 6 jours"
                   title = title.replace(/(Pleasanton|California|USA|Canada|Remote|Publié\\s*le|Published|Posted|HQ|Hybrid|On-site|On site).*$/ig, '').replace(/[-.,]\\s*$/, '').trim();
                   return {
                     title,
                     link: a.href,
                     dateDiscovered: today,
                     location: extractLocation(a, title)
                   };
                }).filter(j => j.link.startsWith('http') && j.title.length > 3);

                // Deduplicate
                const uniqueJobs = [];
                const seenKeys = new Set();
                for (const j of jobLinks) {
                   const key = normalizeTitle(j.title);
                   if (!seenKeys.has(key) && !forbiddenTitles.includes(j.title)) {
                      seenKeys.add(key);
                      uniqueJobs.push(j);
                   }
                }
                return uniqueJobs.slice(0, 40);
              };

              try {
                // 1. Workday ATS
                if (ATS.includes('myworkdayjobs.com')) {
                  const jobs = [];
                  document.querySelectorAll('a').forEach(a => {
                    const titleStr = a.textContent.trim().replace(/\\s+/g, ' ');
                    if (isGeographicExcluded(titleStr, a.href)) return;
                    if (a.href.includes('/job/') && titleStr.length > 5) {
                      let dateStr = today;
                      const parentLi = a.closest('li');
                      if (parentLi) {
                        const dateText = parentLi.textContent.toLowerCase();
                        if (dateText.includes('posted')) {
                           const match = parentLi.textContent.match(/Posted\\s+([^A-Z]+[a-z]+)/i);
                           if (match) dateStr = 'Workday • ' + match[1].trim();
                        }
                      }
                      jobs.push({ title: titleStr, link: a.href, dateDiscovered: dateStr, location: extractLocation(a, titleStr) });
                    }
                  });
                  if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 20);
                }
                
                // 2. Ashby ATS
                if (ATS.includes('jobs.ashbyhq.com')) {
                  const jobs = [];
                  document.querySelectorAll('a').forEach(a => {
                    const titleStr = a.textContent.trim().replace(/\\s+/g, ' ');
                    if (isGeographicExcluded(titleStr, a.href)) return;
                    if (a.pathname.startsWith(window.location.pathname) && a.pathname.length > window.location.pathname.length + 10 && titleStr.length > 4) {
                       jobs.push({ title: titleStr, link: a.href, dateDiscovered: 'Ashby ATS • ' + today, location: extractLocation(a, titleStr) });
                    }
                  });
                  if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 20);
                }

                // 2b. Lever ATS (jobs.lever.co) — used by BenchSci, Recursion, Cohere, Coveo, Lightspeed etc
                if (ATS.includes('jobs.lever.co')) {
                  const jobs = [];
                  // Lever job cards: each posting is an <a class="posting-title"> or <a class="posting-btn-submit">
                  // The job title is in h5 inside the link, location in a sibling span
                  document.querySelectorAll('a.posting-title').forEach(a => {
                    const titleEl = a.querySelector('h5');
                    const locationEl = a.querySelector('[class*="location"], .sort-by-time, .commitment, span');
                    const titleStr = titleEl ? titleEl.textContent.trim() : a.textContent.trim().replace(/\\s+/g, ' ');
                    if (!titleStr || titleStr.length < 3) return;
                    if (isGeographicExcluded(titleStr, a.href)) return;
                    const locText = locationEl ? locationEl.textContent.trim() : '';
                    jobs.push({
                      title: titleStr,
                      link: a.href,
                      dateDiscovered: 'Lever ATS • ' + today,
                      location: extractLocation(a, titleStr + ' ' + locText)
                    });
                  });
                  // Fallback: generic Lever link pattern if no .posting-title found
                  if (jobs.length === 0) {
                    document.querySelectorAll('a[href*="/jobs.lever.co/"][href*="/apply"], a[href*="jobs.lever.co"]').forEach(a => {
                      if (a.href.includes('/apply')) return; // skip apply links, get listing links
                      const titleStr = a.textContent.trim().replace(/\\s+/g, ' ');
                      if (titleStr.length < 3 || isGeographicExcluded(titleStr, a.href)) return;
                      jobs.push({ title: titleStr, link: a.href, dateDiscovered: 'Lever ATS • ' + today, location: extractLocation(a, titleStr) });
                    });
                  }
                  if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 25);
                }

                // 3. LinkedIn Native (Must be a specific job view)
                if (ATS.includes('linkedin.com')) {
                   const jobs = [];
                   // Only target specific job view links, exclude search categories
                   document.querySelectorAll('a[href*="linkedin.com/jobs/view/"], a.base-card__full-link[href*="/view/"]').forEach(a => {
                      if (a.href.includes('/jobs/search') || a.href.includes('-jobs/')) return;
                      if (isGeographicExcluded(a.textContent, a.href)) return;
                      let dateStr = today;
                      const card = a.closest('li, div.base-search-card');
                      if (card) {
                        const timeSpan = card.querySelector('time');
                        if (timeSpan && timeSpan.textContent) dateStr = 'LinkedIn • ' + timeSpan.textContent.trim();
                      }
                       const titleStr = a.textContent.trim().replace(/\\s+/g, ' ');
                      if (titleStr.length > 4) jobs.push({ title: titleStr, link: a.href, dateDiscovered: dateStr, location: extractLocation(a, titleStr) });
                   });
                   if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 20);
                }

                // 4. Phenom People (Merck, CRL, Bayer Search)
                if (document.querySelector('.ph-job-card, .data-ph-at-job-title')) {
                   const jobs = [];
                   document.querySelectorAll('.ph-job-card, .ph-card-content, [data-ph-at-id="job-link"]').forEach(card => {
                      const linkEl = card.tagName === 'A' ? card : card.querySelector('a');
                      if (!linkEl) return;
                      if (isGeographicExcluded(linkEl.textContent, linkEl.href)) return;
                      const titleStr = linkEl.textContent.trim().replace(/\\s+/g, ' ');
                      if (titleStr.length > 4) {
                         jobs.push({ title: titleStr, link: linkEl.href, dateDiscovered: 'Enterprise ATS • ' + today, location: extractLocation(linkEl, titleStr) });
                      }
                   });
                   if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 20);
                }

                // 5. Google Careers
                if (ATS.includes('google.com') && window.location.pathname.includes('/careers/')) {
                   const jobs = [];
                    document.querySelectorAll('a[href*="/jobs/results/"]').forEach(a => {
                       const titleStr = a.textContent.trim().replace(/\\s+/g, ' ');
                       if (isGeographicExcluded(titleStr, a.href)) return;
                       if (titleStr.length > 4 && !titleStr.toLowerCase().includes('google')) {
                         jobs.push({ title: titleStr, link: a.href, dateDiscovered: 'Google Careers • ' + today, location: extractLocation(a, titleStr) });
                      }
                    });
                   if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 20);
                }

                // 6. McKinsey Specific
                if (ATS.includes('mckinsey.com')) {
                   const jobs = [];
                    // McKinsey uses h2 a or .mdc-c-heading a
                    document.querySelectorAll('h2 a[href*="/jobs/"], .mdc-c-heading a, a[href*="/careers/search-jobs/jobs/"]').forEach(a => {
                       const titleStr = a.textContent.trim().replace(/\\s+/g, ' ');
                       if (isGeographicExcluded(titleStr, a.href)) return;
                       if (titleStr.length > 2) {
                         jobs.push({ title: titleStr, link: a.href, dateDiscovered: 'McKinsey • ' + today, location: extractLocation(a, titleStr) });
                      }
                    });
                   if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 25);
                }

                // 7. Telix / Greenhouse Specific
                if (ATS.includes('telixpharma.com')) {
                   const jobs = [];
                   document.querySelectorAll('.job-listing__title, a[href*="gh_jid="]').forEach(a => {
                      const titleStr = a.textContent.trim().replace(/\\s+/g, ' ');
                      if (isGeographicExcluded(titleStr, a.href)) return;
                      // Avoid "Apply Now" as the title if possible
                      if (titleStr.toLowerCase().includes('apply now') || titleStr.length < 3) return;
                      
                      jobs.push({ title: titleStr, link: a.href, dateDiscovered: 'Telix • ' + today, location: extractLocation(a, titleStr) });
                   });
                   if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 25);
                }

                // 7b. Greenhouse job board (job-boards.greenhouse.io or boards.greenhouse.io)
                // Use the public Greenhouse JSON API instead of scraping paginated HTML
                // API: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs — no auth, returns ALL jobs
                if (ATS.includes('greenhouse.io') && !ATS.includes('my.greenhouse.io')) {
                  try {
                    // Extract the board slug from the URL path: /anthropic -> anthropic
                    const slug = window.location.pathname.replace(/^\\//, '').split('/')[0];
                    if (slug && slug.length > 0) {
                      const apiResp = await fetch(\`https://boards-api.greenhouse.io/v1/boards/\${slug}/jobs\`);
                      if (apiResp.ok) {
                        const apiData = await apiResp.json();
                        const jobs = [];
                        (apiData.jobs || []).forEach(job => {
                          const titleStr = (job.title || '').trim();
                          const locationStr = (job.location?.name || '');
                          if (!titleStr || titleStr.length < 3) return;
                          if (isGeographicExcluded(titleStr + ' ' + locationStr, job.absolute_url || '')) return;
                          jobs.push({
                            title: titleStr,
                            link: job.absolute_url || \`https://job-boards.greenhouse.io/\${slug}/jobs/\${job.id}\`,
                            dateDiscovered: 'Greenhouse API • ' + today,
                            location: locationStr || extractLocation({ textContent: locationStr }, titleStr + ' ' + locationStr)
                          });
                        });
                        if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 100);
                      }
                    }
                  } catch (apiErr) {
                    // API failed — fall through to DOM scraping fallback
                  }
                  // DOM fallback for older Greenhouse templates
                  const jobs = [];
                  document.querySelectorAll('td a[href*="/jobs/"], .opening a, li.job a').forEach(a => {
                    const titleStr = a.textContent.trim().replace(/\\s+/g, ' ');
                    if (!titleStr || titleStr.length < 3) return;
                    if (isGeographicExcluded(titleStr, a.href)) return;
                    const fullLink = a.href.startsWith('http') ? a.href : 'https://job-boards.greenhouse.io' + a.getAttribute('href');
                    if (!fullLink.includes('/jobs/')) return;
                    jobs.push({ title: titleStr, link: fullLink, dateDiscovered: 'Greenhouse • ' + today, location: extractLocation(a, titleStr) });
                  });
                  if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 50);
                }

                // 8. Regeneron Specific
                if (ATS.includes('regeneron.com')) {
                   const jobs = [];
                   document.querySelectorAll('.card-job, .card.card-job').forEach(card => {
                      const linkEl = card.querySelector('.js-view-job, a.stretched-link');
                      if (!linkEl) return;
                      const titleStr = linkEl.textContent.trim().replace(/\\s+/g, ' ');
                      // Relax geographic exclusion for Regeneron to ensure discovery
                      jobs.push({ title: titleStr, link: linkEl.href, dateDiscovered: 'Regeneron • ' + today, location: extractLocation(linkEl, titleStr) });
                   });
                   if (jobs.length > 0) return Array.from(new Map(jobs.map(j => [j.link, j])).values()).slice(0, 25);
                }

              } catch (err) {
                 // Fail gracefully and default to generic
              }

              const generic = genericParser();
              if (generic.length >= 3) return generic;

              // Few/no jobs on this page — many company career pages are just marketing
              // pages that link out to a real ATS. Detect that link so the backend can follow it.
              const atsHostRe = /(job-boards\\.greenhouse\\.io|boards\\.greenhouse\\.io|jobs\\.lever\\.co|jobs\\.ashbyhq\\.com|[a-z0-9-]+\\.myworkdayjobs\\.com|[a-z0-9-]+\\.bamboohr\\.com)/i;
              const here = window.location.hostname;
              const atsLink = Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .find(h => atsHostRe.test(h || '') && !h.includes(here));
              if (atsLink) return [{ __atsRedirect: atsLink }];
              return generic;
            })();
          `);
          let finalJobs = Array.isArray(result) ? result : [];

          // ATS auto-follow: page linked to a known ATS board — re-scan that (hits an API fast path)
          if (depth < 1 && finalJobs.length === 1 && finalJobs[0] && finalJobs[0].__atsRedirect) {
            clearTimeout(timeout);
            releaseOnce();  // free this window before recursing so the pool can't deadlock
            const sub = await scanJobsCore({ ...params, url: finalJobs[0].__atsRedirect }, depth + 1);
            safeResolve(Array.isArray(sub) ? sub : []);
            return;
          }

          clearTimeout(timeout);
          finalJobs = finalJobs.filter(j => j && !j.__atsRedirect && !discarded.includes(j.link) && !params?.discardedTitles?.includes(j.title));
          safeResolve(finalJobs);
        } catch (e) {
          clearTimeout(timeout);
          safeResolve([]);
        }
      });

      scrapeWin.loadURL(url, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36' })
        .catch(() => safeResolve([]));
    });
    } finally {
      releaseOnce();
    }
  } catch (globalErr) {
    return [];
  }
}

// Native File Openers
ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  shell.showItemInFolder(filePath)
  return true
})

ipcMain.handle('open-path', async (event, filePath) => {
  const error = await shell.openPath(filePath)
  return error ? false : true
})

// Open URL in default browser
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return true;
});

// Copy text to clipboard
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  return true;
});

// Update the user-configurable "accepted locations" list used by the geo filter
ipcMain.handle('set-geo-locations', async (event, list) => {
  setGeoAllowed(list);
  return geoExtraAllowed;
});

ipcMain.handle('set-provinces-allowed', async (event, list) => {
  setProvincesAllowed(list);
  return provincesAllowed;
});

// Quick liveness check for a job link — used to drop dead (404/410) generic-scraped
// postings before they enter the feed. Conservative: only a definitive 404/410 counts
// as dead; timeouts, blocks, and other statuses are treated as alive.
ipcMain.handle('check-url-alive', async (event, { url }) => {
  if (!url || !url.startsWith('http')) return { alive: true };
  const doReq = async (method) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      return await fetch(url, {
        method, redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36' },
        signal: ctrl.signal
      });
    } finally { clearTimeout(t); }
  };
  try {
    return await networkThrottle(async () => {
      let resp = await doReq('HEAD');
      // Some servers don't implement HEAD (405/501) — confirm with a GET before trusting it
      if (resp.status === 405 || resp.status === 501) resp = await doReq('GET');
      if (resp.status === 404 || resp.status === 410) return { alive: false };
      return { alive: true };
    });
  } catch {
    return { alive: true }; // transient error — don't drop
  }
});

// Fetch job description text from a job posting URL
ipcMain.handle('fetch-job-description', async (event, { url }) => {
  if (!url || !url.startsWith('http')) return '';

  // Greenhouse per-job API: clean JD, no page scraping
  // e.g. https://job-boards.greenhouse.io/{slug}/jobs/{id}
  if (url.includes('greenhouse.io') && !url.includes('my.greenhouse.io')) {
    try {
      const m = new URL(url).pathname.match(/^\/(?:embed\/job_app\/)?([^/]+)\/jobs\/(\d+)/);
      if (m) {
        const data = await httpsGetJsonShared(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`, 8000);
        const text = htmlToText(data.content || '');
        if (text.length > 200) return text;
      }
    } catch (err) {
      console.error('Greenhouse per-job API failed, falling back:', err.message);
    }
  }

  // Workday per-job detail API: full HTML jobDescription
  if (url.includes('myworkdayjobs.com') && url.includes('/job/')) {
    try {
      const u = new URL(url);
      const host = u.hostname;
      const tenant = host.split('.')[0];
      const parts = u.pathname.split('/').filter(Boolean);
      const site = /^[a-z]{2}-[A-Za-z]{2}$/.test(parts[0]) ? parts[1] : parts[0];
      const jobIdx = parts.indexOf('job');
      if (tenant && site && jobIdx >= 0) {
        const externalPath = '/' + parts.slice(jobIdx).join('/');
        const data = await httpsGetJsonShared(`https://${host}/wday/cxs/${tenant}/${site}${externalPath}`, 8000);
        const text = htmlToText(data.jobPostingInfo?.jobDescription || '');
        if (text.length > 200) return text;
      }
    } catch (err) {
      console.error('Workday per-job API failed, falling back:', err.message);
    }
  }

  // BambooHR per-job detail API: https://{sub}.bamboohr.com/careers/{id}/detail → jobOpening.description
  if (url.includes('bamboohr.com') && /\/careers\/\d+/.test(url)) {
    try {
      const u = new URL(url);
      const sub = u.hostname.split('.')[0];
      const id = (u.pathname.match(/\/careers\/(\d+)/) || [])[1];
      if (sub && id) {
        const data = await httpsGetJsonShared(`https://${sub}.bamboohr.com/careers/${id}/detail`, 8000);
        const text = htmlToText(data.jobOpening?.description || data.result?.jobOpening?.description || '');
        if (text.length > 200) return text;
      }
    } catch (err) {
      console.error('BambooHR per-job API failed, falling back:', err.message);
    }
  }

  // Lever per-job API: https://api.lever.co/v0/postings/{slug}/{postingId}
  if (url.includes('jobs.lever.co')) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const data = await httpsGetJsonShared(`https://api.lever.co/v0/postings/${parts[0]}/${parts[1]}`, 8000);
        const text = (data.descriptionPlain || htmlToText(data.description || '')).substring(0, 6000);
        if (text.length > 200) return text;
      }
    } catch (err) {
      console.error('Lever per-job API failed, falling back:', err.message);
    }
  }

  if (url.includes('sepalai.com')) {
    try {
      const match = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (match) {
        const jobId = match[1];
        const https = require('https');
        const fetchSepalJobDescription = () => new Promise((resolve, reject) => {
          const apiReqUrl = "https://api.nexus.sepalai.com/trpc/jobs.getPublicJobs?input=" + encodeURIComponent('{"json":{"searchQuery":""}}');
          const req = https.get(apiReqUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' },
            timeout: 8000
          }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              res.resume();
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });

        const apiData = await fetchSepalJobDescription();
        const rawJobs = apiData.result?.data || [];
        const targetJob = rawJobs.find(j => j.id === jobId);
        if (targetJob && targetJob.jobDescription) {
          return targetJob.jobDescription;
        }
      }
    } catch (err) {
      console.error('Fast-path fetch for Sepal AI job description failed:', err.message);
    }
  }

  // Fast path: Node.js HTTP (~100-300ms). Works for Greenhouse, Lever, Ashby, Workday.
  try {
    const text = await networkThrottle(async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
          },
          signal: ctrl.signal
        });
        if (resp.ok) {
          const html = await resp.text();
          return htmlToText(html, 6000);
        }
        return '';
      } finally { clearTimeout(t); }
    });
    if (text.length > 300) return text;
  } catch { /* fall through to browser */ }

  // Slow path: pooled hidden window for JS-rendered SPAs (parallel-safe)
  const poolEntry = await acquireScraperWin();
  const jdWin = poolEntry.win;
  try {
    return await new Promise((resolve) => {
      let resolved = false;
      const safe = (v) => { if (!resolved) { resolved = true; resolve(v); } };
      const timeout = setTimeout(() => safe(''), 10000);
      jdWin.webContents.removeAllListeners('did-finish-load');
      jdWin.webContents.once('did-finish-load', async () => {
        try {
          const text = await jdWin.webContents.executeJavaScript(`(() => {
            const sels = ['[class*="job-description"]','[class*="jobDescription"]','[class*="description"]','article','main'];
            for (const s of sels) { const el = document.querySelector(s); if (el?.innerText?.trim().length > 200) return el.innerText.trim().substring(0,6000); }
            return (document.body?.innerText||'').trim().substring(0,6000);
          })()`);
          clearTimeout(timeout); safe(text || '');
        } catch { clearTimeout(timeout); safe(''); }
      });
      jdWin.loadURL(url, { userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' }).catch(() => safe(''));
    });
  } catch { return ''; } finally {
    releaseScraperWin(poolEntry);
  }
});

// Per-company LinkedIn fallback: for companies whose own site is a hard JS SPA
// (custom GraphQL, Gem, etc.) and yields nothing, pull their recent postings from
// LinkedIn's public guest search by company name.
const normCompany = (s) => (s || '').toLowerCase().replace(/[.,]/g, '')
  .replace(/\b(inc|ltd|llc|corp|co|company|therapeutics|pharma|pharmaceuticals|biosciences|bioscience|labs|laboratories|technologies|sciences|group|the)\b/g, '')
  .replace(/\s+/g, ' ').trim();

ipcMain.handle('fetch-company-linkedin', async (event, { name }) => {
  const q = String(name || '').trim();
  if (q.length < 3) return [];
  const nq = normCompany(q);
  // Search across the user's accepted regions. Company-name matching + the geo filter
  // downstream keep only relevant, in-region roles — so a broad location just surfaces more.
  const variants = [
    `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent('Canada')}&f_TPR=r2592000&start=0`,
    `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent('United States')}&f_TPR=r2592000&start=0`,
    `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent('European Union')}&f_WT=2&f_TPR=r2592000&start=0`
  ];
  const seen = new Set();
  const out = [];
  for (const url of variants) {
    try {
      const html = await httpsGetText(url, 12000);
      for (const job of parseLinkedInGuestCards(html)) {
        // Keep only postings that actually belong to this company
        const jc = normCompany(job.companyName);
        const belongs = jc && nq && (jc === nq || jc.includes(nq) || nq.includes(jc));
        if (!belongs) continue;
        if (seen.has(job.link)) continue;
        if (isGeoExcludedNode(job.title + ' ' + job.location, job.link)) continue;
        seen.add(job.link);
        out.push({
          title: job.title,
          link: job.link,
          location: job.location,
          dateDiscovered: job.dateDiscovered.replace('LinkedIn Sweep', 'LinkedIn')
        });
      }
    } catch (e) { /* rate-limited or blocked — skip */ }
    await new Promise(r => setTimeout(r, 600));
  }
  return await enrichLinkedInDescriptions(out.slice(0, 40));
});

// Score a job against a CV — returns 0-100
ipcMain.handle('score-job-fit', async (event, { jobTitle, jobDescription, profile, engine, anthropicApiKey }) => {
  if (!profile || profile.trim().length < 20) return null;
  const host = '127.0.0.1';
  try {
    const cleanJd = (jobDescription || '').replace(/\s+/g, ' ');
    // Prefer the requirements section; give the model a generous excerpt now that
    // API-sourced descriptions are clean full-text (Haiku handles this easily,
    // and 8B local models still cope fine with ~2.5k chars)
    const reqMatch = cleanJd.match(/(?:requirements|qualifications|what you'll need|who you are|ideal candidate|about you|what we.?re looking for|skills & experience|what you will bring)[\s\S]{0,2500}/i);
    let jdSnippet = reqMatch ? reqMatch[0] : cleanJd.substring(cleanJd.length > 3000 ? cleanJd.length / 3 : 0, 2500);
    if (jdSnippet.length > 2500) jdSnippet = jdSnippet.substring(0, 2500);

    const rubric = `You are an expert technical recruiter evaluating a candidate. Score fit from 0 to 100.
CRITICAL SCORING RUBRIC:
- 0-20%: Completely unrelated field (e.g. candidate is biology, job is IT, Sales, Marketing, Mechanical Engineering, HR).
- 20-50%: Related field, but candidate lacks mandatory core technical skills or seniority level.
- 50-80%: Strong match. Candidate has the core skills. (Note: In biotech, PhD research COUNTS as years of experience. Do not penalize for lack of "industry" experience if academic experience is equivalent).
- 80-100%: Perfect match. Candidate hits all requirements perfectly.

Reply ONLY with valid JSON.`;

    const promptText = `Job: "${jobTitle}"${jdSnippet ? `\nRole excerpt: ${jdSnippet}` : ''}

Candidate profile: ${profile}

Output format:
{"score": 65, "reason": "Relevant PhD but missing one preferred skill", "match": "molecular biology"}`;

    let raw = '';
    let usageData = null;

    if (engine === 'haiku') {
      if (!anthropicApiKey) return null;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 300,
          temperature: 0,
          system: rubric,
          messages: [{ role: 'user', content: promptText }]
        }),
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) {
        const errStr = await response.text();
        console.error('Anthropic API error:', response.status, errStr);
        return null;
      }
      const data = await response.json();
      raw = data.content?.[0]?.text || '';
      // Anthropic returns usage as { input_tokens, output_tokens, ... }.
      // Normalize to { input, output } — the field names the renderer expects.
      if (data.usage) {
        usageData = {
          input: (data.usage.input_tokens || 0) + (data.usage.cache_creation_input_tokens || 0) + (data.usage.cache_read_input_tokens || 0),
          output: data.usage.output_tokens || 0
        };
      }
    } else {
      // Ollama fallback
      const model = await getCachedFastModel(host);
      if (!model) return null;
      const ollamaPrompt = rubric + '\n\n' + promptText;
      const response = await fetch(`http://${host}:11434/api/generate`, {
        method: 'POST',
        body: JSON.stringify({ model, prompt: ollamaPrompt, stream: false, options: { num_predict: 200, temperature: 0 } }),
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000)
      });
      
      if (!response.ok) {
        console.error('Ollama response not OK:', response.status);
        return null;
      }
      const data = await response.json();
      raw = (data.response || '').trim();
    }
    
    // Auto-fix if the AI forgot the closing bracket
    if (raw.includes('{') && !raw.includes('}')) raw += '\n}';
    
    const m = raw.match(/\{[\s\S]*?\}/);
    if (!m) {
      console.error('No JSON match in scoring response:', raw);
      return null;
    }
    
    try {
      const parsed = JSON.parse(m[0]);
      return {
        score: Math.min(100, Math.max(0, Math.round(Number(parsed.score) || 0))),
        reason: parsed.reason || '',
        topSkillMatch: parsed.match || '',
        usage: usageData
      };
    } catch(err) {
      console.error('JSON parse error in scoring response:', err.message, 'on', m[0]);
      return null;
    }
  } catch (e) {
    console.error('Score job fit error:', e);
    return null;
  }
});

// Export applications to CSV
ipcMain.handle('export-csv', async (event, { applications, companies }) => {
  const { dialog } = require('electron');
  const fs = require('fs');

  const result = await dialog.showSaveDialog({
    title: 'Export Applications to CSV',
    defaultPath: `newleaf_applications_${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (result.canceled || !result.filePath) return false;

  const companyMap = Object.fromEntries((companies || []).map(c => [c.id, c.name]));
  const headers = ['Company', 'Job Title', 'Date Submitted', 'Status', 'Follow Up Date', 'Followed Up', 'Why I Want This', 'Rejection Reason', 'Response', 'Notes'];

  const escape = (v) => `"${(v || '').toString().replace(/"/g, '""')}"`;

  const rows = applications.map(a => [
    escape(companyMap[a.companyId] || a.companyId),
    escape(a.jobTitle),
    escape(a.dateSubmitted),
    escape(a.status),
    escape(a.followUpDate || ''),
    escape(a.followedUp ? 'Yes' : 'No'),
    escape(a.whyIWantThis || ''),
    escape(a.rejectionReason || ''),
    escape(a.responseFromCompany || ''),
    escape(a.notes || '')
  ].join(','));

  const csv = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
  fs.writeFileSync(result.filePath, csv, 'utf-8');
  return result.filePath;
});

// --- Full-pipeline JSON backup: save/open helpers ---
ipcMain.handle('save-json-file', async (event, { defaultName, json }) => {
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog({
    title: 'Save NewLeaf Backup',
    defaultPath: defaultName || `newleaf_backup_${new Date().toISOString().split('T')[0]}.json`,
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return null;
  require('fs').writeFileSync(result.filePath, json, 'utf-8');
  return result.filePath;
});

ipcMain.handle('open-json-file', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    title: 'Open NewLeaf Backup',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  try {
    return require('fs').readFileSync(result.filePaths[0], 'utf-8');
  } catch (e) {
    return null;
  }
});

// --- Aggregator sweep: LinkedIn guest jobs API (no login required) ---
// Fetches recent postings for each query (Montreal area + remote-in-Canada),
// so the feed can surface companies outside the registry.
const httpsGetText = (reqUrl, timeoutMs = 12000) => new Promise((resolve, reject) => {
  const https = require('https');
  const req = https.get(reqUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
    },
    timeout: timeoutMs
  }, (res) => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.resume();
      return reject(new Error(`HTTP ${res.statusCode}`));
    }
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => resolve(body));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
});

const parseLinkedInGuestCards = (html) => {
  const jobs = [];
  const cards = html.split(/<li>/).slice(1);
  for (const card of cards) {
    const linkM = card.match(/base-card__full-link[^>]*href="([^"]+)"/);
    const titleM = card.match(/base-search-card__title[^>]*>\s*([\s\S]*?)\s*<\/h3>/);
    const companyM = card.match(/base-search-card__subtitle[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/);
    const locationM = card.match(/job-search-card__location[^>]*>\s*([\s\S]*?)\s*<\/span>/);
    const dateM = card.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    if (!linkM || !titleM) continue;
    // Strip tracking params so links stay stable across sweeps (used as dedupe keys)
    const link = htmlEntityDecode(linkM[1]).split('?')[0];
    jobs.push({
      title: htmlEntityDecode(titleM[1]).replace(/\s+/g, ' ').trim(),
      link,
      companyName: companyM ? htmlEntityDecode(companyM[1]).replace(/\s+/g, ' ').trim() : '',
      location: locationM ? htmlEntityDecode(locationM[1]).replace(/\s+/g, ' ').trim() : '',
      dateDiscovered: 'LinkedIn Sweep • ' + (dateM ? dateM[1] : new Date().toLocaleDateString('en-CA'))
    });
  }
  return jobs;
};

// Global limiter for LinkedIn's guest job-view page. A single "Scan for Jobs" can
// trigger description fetches from several independent places at once — the
// aggregator sweep AND up to CONCURRENCY (3) companies' per-company LinkedIn
// fallbacks all running in parallel. Each used to throttle itself locally, but
// nothing coordinated *across* them, so their combined burst regularly tripped
// LinkedIn's rate limit (measured: ~40% of requests came back 429 under that load,
// silently landing as an empty description). This queues every request from every
// caller through one shared cap instead.
let linkedInInFlight = 0;
const LINKEDIN_MAX_CONCURRENT = 2;
const LINKEDIN_MIN_GAP_MS = 350; // minimum spacing between request *starts*, not just a concurrency cap
let linkedInLastStart = 0;
const linkedInWaiters = [];
const linkedInThrottle = (fn) => new Promise((resolve, reject) => {
  const run = async () => {
    linkedInInFlight++;
    const wait = linkedInLastStart + LINKEDIN_MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    linkedInLastStart = Date.now();
    fn().then(resolve, reject).finally(() => {
      linkedInInFlight--;
      const next = linkedInWaiters.shift();
      if (next) next();
    });
  };
  if (linkedInInFlight < LINKEDIN_MAX_CONCURRENT) run(); else linkedInWaiters.push(run);
});

// The guest search cards (parseLinkedInGuestCards) only give title/company/location —
// no description — so every LinkedIn-sourced job needs this second fetch to be scorable.
// LinkedIn's guest job-view page renders the full text server-side for anonymous visitors.
// Retries a 429 up to twice with growing backoff (2s, then 5s) — measured rate-limit
// windows outlasted a single short retry.
const LINKEDIN_RETRY_DELAYS_MS = [2000, 5000];
const fetchLinkedInDescription = async (link, attempt = 0) => {
  try {
    const html = await linkedInThrottle(() => httpsGetText(link, 10000));
    // Cap what the regex scans — LinkedIn's job-view pages run 300KB+, and the
    // description block is always near the top of the document. Running a scanning
    // regex over the full page on every one of ~100+ jobs per scan is needless cost
    // for content that's never out there anyway; bounding it removes that risk.
    const searchable = html.length > 200000 ? html.slice(0, 200000) : html;
    const m = searchable.match(/description__text[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    if (!m) return '';
    return htmlEntityDecode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  } catch (e) {
    if (attempt < LINKEDIN_RETRY_DELAYS_MS.length && /HTTP 429/.test(e.message)) {
      await new Promise(r => setTimeout(r, LINKEDIN_RETRY_DELAYS_MS[attempt] + Math.random() * 500));
      return fetchLinkedInDescription(link, attempt + 1);
    }
    return '';
  }
};

// Concurrency is enforced by the shared throttle above (not locally here), so every
// caller — the sweep, each company's fallback — draws from the same budget.
const enrichLinkedInDescriptions = async (jobs) => {
  await Promise.all(jobs.map(async (j) => { j.description = await fetchLinkedInDescription(j.link); }));
  return jobs;
};

ipcMain.handle('sweep-aggregators', async (event, { queries }) => {
  const qs = (Array.isArray(queries) ? queries : []).map(q => String(q).trim()).filter(Boolean).slice(0, 6);
  if (qs.length === 0) return [];

  const seen = new Set();
  const all = [];
  // Two variants per query: on-site/hybrid around Montreal, and remote anywhere in Canada
  const variants = [
    (kw) => `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(kw)}&location=${encodeURIComponent('Montreal, Quebec, Canada')}&f_TPR=r604800&start=0`,
    (kw) => `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(kw)}&location=${encodeURIComponent('Canada')}&f_WT=2&f_TPR=r604800&start=0`
  ];

  for (const kw of qs) {
    for (const buildUrl of variants) {
      try {
        const html = await httpsGetText(buildUrl(kw));
        for (const job of parseLinkedInGuestCards(html)) {
          if (!job.title || seen.has(job.link)) continue;
          if (isGeoExcludedNode(job.title + ' ' + job.location, job.link)) continue;
          seen.add(job.link);
          all.push(job);
        }
      } catch (e) {
        // 429/timeouts are expected occasionally — skip this variant, keep sweeping
        console.error('Sweep request failed:', e.message);
      }
      // Be polite to the guest endpoint
      await new Promise(r => setTimeout(r, 700));
    }
  }
  return await enrichLinkedInDescriptions(all.slice(0, 150));
});




let answerScraperWin = null;

/**
 * Simple "Answer Search" for interview questions (Extraction-based)
 */
ipcMain.handle('search-answer', async (event, params) => {
  const { url, question } = params || {};
  console.log(`[BACKEND] search-answer started for: ${url}`);
  if (!url || !question) return { text: null, error: 'Missing URL/Question' };

  try {
    if (!answerScraperWin || answerScraperWin.isDestroyed()) {
      answerScraperWin = new BrowserWindow({
        show: false,
        webPreferences: { 
          nodeIntegration: false, 
          contextIsolation: true,
          webSecurity: false 
        }
      });
    }

    const win = answerScraperWin;
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    await win.loadURL(url, { userAgent });
    
    // Wait for page to actually load and render
    await new Promise(resolve => {
       const timeout = setTimeout(resolve, 8000); // Max 8s wait
       win.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          setTimeout(resolve, 3000); // Extra time for JS hydration
       });
    });

    const pageTitle = win.webContents.getTitle();
    
    // Use executeJavaScript for the actual scraping
    const result = await win.webContents.executeJavaScript(`
      (() => {
        const isLinkedIn = window.location.hostname.includes('linkedin.com');
        
        // 0. Detect Login Wall
        if (isLinkedIn) {
          const loginWall = document.querySelector('.main__sign-in-container, .authwall-subtitle, #public_profile_contextual-sign-in');
          if (loginWall) return "NEWLEAF_ERR_LINKEDIN_BLOCKED: LinkedIn is requesting a login or security check. Please copy-paste the job description manually into the notes.";
        }

        // 1. Scroll to trigger lazy loading
        window.scrollTo(0, document.body.scrollHeight / 2);
        
        const stopWords = ['what', 'your', 'this', 'that', 'with', 'from', 'about', 'team', 'company', 'work', 'here', 'role', 'pour', 'notre', 'votre'];
        const kws = "${question.toLowerCase().replace(/[?.,!]/g, '')}".split(' ').filter(w => w.length > 3 && !stopWords.includes(w));
        
        // Specialized Selectors
        let selectors = 'p, li, h1, h2, h3, .career-intro, section, .job-description, .about-us, article';
        if (isLinkedIn) {
          selectors += ', .description__text, .show-more-less-html__markup, .jobs-description-content__text';
        }
        
        const elements = Array.from(document.querySelectorAll(selectors));
        
        // Hide overlays
        const overlays = document.querySelectorAll('[class*="cookie"], [id*="cookie"], [class*="modal"], [id*="modal"]');
        overlays.forEach(el => el.style.display = 'none');

        // Precision Match
        const threshold = Math.max(1, Math.min(2, kws.length));
        for (const el of elements) {
          const t = el.textContent.trim();
          if (t.length < 50 || t.length > 5000) continue; // Expanded max for long JDs
          const low = t.toLowerCase();
          const matches = kws.filter(k => low.includes(k));
          if (matches.length >= threshold) return t;
        }

        // Density Fallback
        const candidates = elements
          .filter(el => el.textContent.trim().length > 150)
          .sort((a, b) => b.textContent.length - a.textContent.length);
        if (candidates.length > 0) return candidates[0].textContent.trim().substring(0, 3000);

        // Super Catch-All
        const bodyText = document.body.innerText.replace(/\\s\\s+/g, ' ').trim();
        if (bodyText.length > 200) {
            if (isLinkedIn && (bodyText.includes('Sign in') || bodyText.includes('Join LinkedIn'))) {
                return "NEWLEAF_ERR_LINKEDIN_BLOCKED: LinkedIn redirected to a sign-in page. Automated research is limited.";
            }
            return bodyText.substring(0, 3000);
        }

        return null;
      })();
    `);

    const bodyText = await win.webContents.executeJavaScript("document.body.innerText");
    const htmlLen = (await win.webContents.executeJavaScript("document.documentElement.outerHTML")).length;

    console.log(`[BACKEND] Search complete. Title: ${pageTitle}. Data found: \${result ? result.length : 0}`);

    return {
      text: result,
      debug: {
        title: pageTitle,
        bodyLength: bodyText.length,
        bodyText: bodyText, // Return the full text for fallback use
        htmlLength: htmlLen,
        url: win.getURL()
      }
    };
  } catch (e) {
    console.error("[BACKEND] search-answer failed:", e);
    return { text: null, error: e.message };
  }
});

/**
 * Raw TCP check with desktop logging
 */
ipcMain.handle('check-ollama', async () => {
  const trySocket = (host) => new Promise((resolve) => {
    const socket = net.createConnection(11434, host);
    socket.on('connect', () => { socket.destroy(); resolve({ success: true }); });
    socket.on('error', (e) => { socket.destroy(); resolve({ success: false, error: e.code }); });
    socket.setTimeout(2000, () => { socket.destroy(); resolve({ success: false, error: 'TIMEOUT' }); });
  });

  const h1 = await trySocket('127.0.0.1');
  if (h1.success) return h1;
  const h2 = await trySocket('localhost');
  if (h2.success) return h2;
  return await trySocket('::1');
});

const getBestModel = async (host) => {
  try {
    const res = await fetch(`http://${host}:11434/api/tags`);
    if (!res.ok) return 'llama3';
    const data = await res.json();
    const models = data.models || [];
    const names = models.map(m => m.name);
    if (names.includes('llama3:8b')) return 'llama3:8b';
    if (names.includes('llama3:latest')) return 'llama3:latest';
    if (names.includes('llama3')) return 'llama3';
    if (names.includes('mistral:latest')) return 'mistral:latest';
    if (names.includes('mistral')) return 'mistral';
    if (names.length > 0) return names[0]; // Use whatever they have
    return 'llama3';
  } catch (e) {
    return 'llama3';
  }
};

// Fast model selector for scoring — prefers tiny/fast models for quick JSON output
const getFastModel = async (host) => {
  try {
    const res = await fetch(`http://${host}:11434/api/tags`);
    if (!res.ok) return null;
    const names = ((await res.json()).models || []).map(m => m.name);
    // Prefer the LARGEST capable model available — fit scoring is a judgment task,
    // and sub-3B models produce near-random scores. Order: 7-8B first, tiny last.
    const preference = [
      'llama3:8b','llama3','mistral','qwen2.5:7b','gemma2:9b',
      'llama3.2:3b','phi3.5:mini','phi3:mini','gemma2:2b',
      'qwen2.5:1.5b','qwen2:1.5b','llama3.2:1b','qwen2.5:0.5b','tinyllama'
    ];
    for (const want of preference) {
      const found = names.find(n => n === want || n.startsWith(want.split(':')[0] + ':'));
      if (found) return found;
    }
    return names[0] || null;
  } catch { return null; }
};

let _fastModelCache = null;
const getCachedFastModel = async (host) => {
  if (_fastModelCache) return _fastModelCache;
  _fastModelCache = await getFastModel(host) || await getBestModel(host);
  return _fastModelCache;
};

ipcMain.handle('ask-local-llm', async (event, { prompt, engine, anthropicApiKey }) => {
  const sender = event.sender;

  // Same engine switch as score-job-fit: whichever one is selected in Settings
  // (⚙️ Scoring Engine) drives both fit scoring AND the Application Strategist —
  // one setting, not two independent choices.
  if (engine === 'haiku') {
    try {
      if (!anthropicApiKey) {
        const msg = '❌ No Anthropic API key set. Add one in Settings to use Haiku.';
        sender.send('ai-chunk', { response: msg, done: true });
        return msg;
      }
      sender.send('ai-chunk', { response: '🤖 Asking Claude...\n', done: false });
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) {
        const errStr = await response.text();
        console.error('Anthropic API error (ask-local-llm haiku path):', response.status, errStr);
        const msg = `❌ Claude API error (${response.status}). Check your API key in Settings.`;
        sender.send('ai-chunk', { response: msg, done: true });
        return msg;
      }
      const data = await response.json();
      const fullText = data.content?.[0]?.text || '';
      sender.send('ai-chunk', { response: fullText, done: false });
      sender.send('ai-chunk', { response: '', done: true });
      return fullText;
    } catch (e) {
      const msg = `❌ AI Error: ${e.message}`;
      sender.send('ai-chunk', { response: msg, done: true });
      return msg;
    }
  }

  try {
    const host = '127.0.0.1';
    sender.send('ai-chunk', { response: '🔍 Checking Ollama models...\n', done: false });
    const model = await getBestModel(host);
    sender.send('ai-chunk', { response: `🤖 Using model: ${model}\n`, done: false });

    const tryStream = async (targetHost) => {
      const contextSize = (prompt.length / 1000).toFixed(1);
      sender.send('ai-chunk', { response: `📡 Sending ${contextSize}k characters to ${model}...\n`, done: false });
      
      const response = await fetch(`http://${host}:11434/api/generate`, {
        method: 'POST',
        body: JSON.stringify({ model, prompt, stream: true }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = ""; 
      let receivedFirstToken = false;

      // Safety timeout for prompt evaluation (First Token)
      const tokenTimeout = setTimeout(() => {
        if (!receivedFirstToken) {
          sender.send('ai-chunk', { response: '\n⚠️ Still reading context. Your file might be very large for your local hardware. One moment...\n', done: false });
        }
      }, 40000);

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          clearTimeout(tokenTimeout);
          break;
        }
        
        if (!receivedFirstToken) {
          receivedFirstToken = true;
          clearTimeout(tokenTimeout);
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.response) {
              fullText += json.response;
              sender.send('ai-chunk', { response: json.response, done: false });
            }
            if (json.done) {
               sender.send('ai-chunk', { response: '', done: true });
               return fullText;
            }
          } catch (e) { }
        }
      }
      return fullText;
    };

    try { 
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      try { return await tryStream('127.0.0.1'); } 
      finally { clearTimeout(id); }
    } catch (e) { 
      if (e.name === 'AbortError') throw new Error("Connection to Ollama timed out. Is it running?");
      return await tryStream('localhost'); 
    }
  } catch (e) {
    const msg = `❌ AI Error: ${e.message}. \n\nTips:\n1. Verify Ollama is running.\n2. Run 'ollama pull llama3:8b' in Terminal.\n3. Try a smaller CV if it keeps hanging.`;
    sender.send('ai-chunk', { response: msg, done: true });
    return msg;
  }
});

let searchWebWin = null;
ipcMain.handle('search-web', async (event, query) => {
  if (!query) return null;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  
  if (!searchWebWin || searchWebWin.isDestroyed()) {
    searchWebWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false }
    });
  }

  try {
    const win = searchWebWin;
    await win.loadURL(url, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0' });
    
    // Give it a tiny moment to parse
    await new Promise(r => setTimeout(r, 600));

    const result = await win.webContents.executeJavaScript(`
      (() => {
        const item = document.querySelector('.result');
        if (!item) return null;
        const link = item.querySelector('.result__url') || item.querySelector('.result__a');
        const snippet = item.querySelector('.result__snippet');
        const title = item.querySelector('.result__title');
        
        let finalUrl = link ? link.href : '';
        if (finalUrl.includes('uddg=')) {
          const m = finalUrl.match(/uddg=([^&]+)/);
          if (m) finalUrl = decodeURIComponent(m[1]);
        }
        
        return {
          url: finalUrl,
          snippet: snippet ? snippet.textContent.trim() : '',
          title: title ? title.textContent.trim() : ''
        };
      })();
    `);
    
    return result;
  } catch (e) {
    console.error('[BACKEND] search-web error', e);
    return null;
  }
});

/**
 * Greenhouse Sync: Open a visible window for the user to log in
 */
ipcMain.handle('open-greenhouse-sync', async (event) => {
  const syncWin = new BrowserWindow({
    width: 1000,
    height: 800,
    show: true,
    title: 'Greenhouse Sync — Log in and navigate to your applications',
    webPreferences: { 
      nodeIntegration: false, 
      contextIsolation: true 
    }
  });

  syncWin.loadURL('https://my.greenhouse.io/jobs');

  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val) => {
      if (!resolved) { resolved = true; resolve(val); }
    };

    // Hard timeout after 2 minutes so the promise doesn't hang forever
    const hardTimeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (!syncWin.isDestroyed()) syncWin.close();
      safeResolve({ success: false, error: 'Timed out waiting for Greenhouse data' });
    }, 120000);

    const checkInterval = setInterval(async () => {
      if (syncWin.isDestroyed()) {
        clearInterval(checkInterval);
        clearTimeout(hardTimeout);
        safeResolve({ success: false, error: 'Window closed' });
        return;
      }

      const url = syncWin.webContents.getURL();
      if (url.includes('my.greenhouse.io')) {
        try {
          const data = await syncWin.webContents.executeJavaScript(`
            (() => {
              const jobs = [];
              // Try multiple selector patterns Greenhouse uses
              const cards = document.querySelectorAll(
                '.application-card, .job-application, [data-testid="application-row"], .candidate-row, li.job'
              );
              cards.forEach(card => {
                const titleEl = card.querySelector(
                  '.job-title, h3, h4, a[href*="/jobs/"], [data-testid="job-name"], .application-title'
                );
                const companyEl = card.querySelector(
                  '.company-name, .organization, [data-testid="company-name"]'
                );
                const statusEl = card.querySelector(
                  '.status, .current-stage, [data-testid="stage-name"], .stage-label'
                );
                if (titleEl) {
                  jobs.push({
                    jobTitle: titleEl.textContent.trim(),
                    companyName: companyEl ? companyEl.textContent.trim() : '',
                    status: statusEl ? statusEl.textContent.trim() : 'Applied',
                    dateSubmitted: new Date().toISOString().split('T')[0]
                  });
                }
              });
              return jobs;
            })();
          `);

          if (data && data.length > 0) {
            clearInterval(checkInterval);
            clearTimeout(hardTimeout);
            setTimeout(() => {
              if (!syncWin.isDestroyed()) syncWin.close();
            }, 2000);
            safeResolve({ success: true, applications: data });
          }
        } catch (e) {
          // Keep trying
        }
      }
    }, 3000);
  });
});

app.whenReady().then(() => {
  // Automatically start Ollama in the background on macOS
  if (process.platform === 'darwin') {
    const { exec } = require('child_process');
    exec('open -g -a Ollama', (err) => {
      if (err) {
        console.warn("Could not automatically start Ollama. Is it installed?", err);
      } else {
        console.log("Ollama started automatically in the background.");
      }
    });
  }

  if (!checkFailsafe()) {
    console.error("Failsafe triggered. Aborting window creation to prevent loop.");
    app.quit();
    return;
  }

  if (isDev) {
    startVite()
    // Give Vite 800ms head start before opening the window
    setTimeout(createWindow, 800)
  } else {
    createWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (viteProcess) viteProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (viteProcess) viteProcess.kill()
})
