const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SAMPLE_INPUTS, analyzeObservations, createInitialState, makeAlert } = require('./analysis');

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const DATA_DIR = process.env.CYBERSTALK_DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const sessions = new Map();

function readDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: [], reports: [], states: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: [], reports: [], states: {} };
  }
}

function writeDb(db) {
  const temporaryFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(db, null, 2));
  fs.renameSync(temporaryFile, DB_FILE);
}

function hashPassword(value, salt = crypto.randomBytes(16).toString('hex')) {
  const digest = crypto.scryptSync(value, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(value, stored) {
  if (!stored || !stored.includes(':')) return stored === crypto.createHash('sha256').update(value).digest('hex');
  const [salt, digest] = stored.split(':');
  const candidate = Buffer.from(crypto.scryptSync(value, salt, 64).toString('hex'), 'hex');
  const expected = Buffer.from(digest, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

function currentUser(request) {
  const token = parseCookies(request).cyberstalk_session;
  return token ? sessions.get(token) : null;
}

function getUserState(db, user) {
  db.states ||= {};
  if (!db.states[user.id]) db.states[user.id] = createInitialState();
  return db.states[user.id];
}

function dashboardPayload(state) {
  const analysis = state.analysis;
  return {
    ...state,
    stats: {
      totalEvents: state.events.length,
      suspiciousEvents: state.events.filter((event) => ['Medium', 'High', 'Critical'].includes(event.severity)).length,
      highRiskEvents: state.alerts.filter((alert) => ['High', 'Critical'].includes(alert.severity) && alert.status !== 'resolved').length,
      clusterCount: analysis.patterns.length,
      activeCases: state.case.status === 'Closed' ? 0 : 1,
      confidenceLevel: analysis.confidence,
      threatRisk: analysis.score
    }
  };
}

function addAnalysisEvents(state, analysis) {
  const inputs = analysis.inputs;
  const observations = [
    inputs.contactAttempts > 0 && ['Contact activity recorded', 'Repeated contact attempts', `${inputs.contactAttempts} contact attempts during a ${inputs.observationDays}-day observation window.`],
    inputs.postBlockContacts > 0 && ['Post-block activity recorded', 'Post-block contact', `${inputs.postBlockContacts} contact attempts followed a block event.`],
    inputs.distinctAccounts > 1 && ['Multiple accounts observed', 'Account switching', `${inputs.distinctAccounts} accounts were included in the supplied observations.`],
    inputs.suspiciousLinks > 0 && ['Link activity flagged for review', 'Suspicious link activity', `${inputs.suspiciousLinks} links were reported; none were opened by this analysis.`],
    inputs.profileVisits > 0 && ['Profile visit activity recorded', 'Repeated profile visits', `${inputs.profileVisits} profile visits were included in the observation set.`],
    inputs.escalationRate > 0 && ['Activity intensity change recorded', 'Escalation', `Reported activity intensity change: ${inputs.escalationRate}%.`]
  ].filter(Boolean);

  const events = observations.map(([title, category, description], index) => ({
    id: `EV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    timestamp: new Date(new Date(analysis.timestamp).getTime() - index * 60_000).toISOString(),
    title,
    category,
    severity: analysis.severity,
    description,
    status: 'observed'
  }));
  state.events = [...events, ...state.events].slice(0, 100);
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy();
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function serveStatic(request, response) {
  const requested = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const filePath = path.resolve(ROOT, requested === '/' ? 'login.html' : `.${requested}`);
  const relativePath = path.relative(ROOT, filePath);
  const firstPathSegment = relativePath.split(path.sep)[0];
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath) || firstPathSegment === 'data' || firstPathSegment === '.git' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
    return;
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  response.writeHead(200, { 'Content-Type': `${types[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(filePath).pipe(response);
}

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/auth/demo') {
    const db = readDb();
    const email = 'demo@cyberstalk.local';
    let user = db.users.find((item) => item.email === email);
    if (!user) {
      user = { id: crypto.randomUUID(), email, passwordHash: hashPassword(crypto.randomBytes(48).toString('hex')), createdAt: new Date().toISOString() };
      db.users.push(user);
    }
    getUserState(db, user);
    writeDb(db);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: user.id, email: user.email });
    return sendJson(response, 200, { user: { id: user.id, email: user.email } }, {
      'Set-Cookie': `cyberstalk_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return sendJson(response, 400, { error: 'Enter a valid email and a password with at least 8 characters.' });
    if (email === 'demo@cyberstalk.local') return sendJson(response, 400, { error: 'Use Demo access for the local demonstration account.' });

    const db = readDb();
    let user = db.users.find((item) => item.email === email);
    if (!user) {
      user = { id: crypto.randomUUID(), email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
      db.users.push(user);
      getUserState(db, user);
      writeDb(db);
    } else if (!verifyPassword(password, user.passwordHash)) {
      return sendJson(response, 401, { error: 'Incorrect email or password.' });
    } else if (!user.passwordHash.includes(':')) {
      user.passwordHash = hashPassword(password);
      writeDb(db);
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: user.id, email: user.email });
    const maxAge = body.remember ? 30 * 86400 : 86400;
    return sendJson(response, 200, { user: { id: user.id, email: user.email } }, {
      'Set-Cookie': `cyberstalk_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(request).cyberstalk_session;
    if (token) sessions.delete(token);
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'cyberstalk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/session') return sendJson(response, 200, { user: currentUser(request) || null });

  const user = currentUser(request);
  if (!user) return sendJson(response, 401, { error: 'Authentication required.' });

  if (request.method === 'GET' && url.pathname === '/api/sample') return sendJson(response, 200, { inputs: SAMPLE_INPUTS });
  if (request.method === 'GET' && url.pathname === '/api/dashboard') {
    const db = readDb();
    const state = getUserState(db, user);
    writeDb(db);
    return sendJson(response, 200, dashboardPayload(state));
  }

  if (request.method === 'POST' && url.pathname === '/api/analyze') {
    const body = await readBody(request);
    const db = readDb();
    const state = getUserState(db, user);
    let analysis;
    try { analysis = analyzeObservations(body.inputs); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
    state.analysis = analysis;
    state.case.subject = analysis.subject;
    state.analysisCount += 1;
    addAnalysisEvents(state, analysis);
    const activeCategories = new Set(state.alerts.filter((alert) => alert.status !== 'resolved').map((alert) => alert.category));
    const newAlerts = analysis.contributingFactors
      .filter((factor) => factor.value >= 45 && !activeCategories.has(factor.label))
      .map((factor) => makeAlert(analysis, factor));
    state.alerts = [...newAlerts, ...state.alerts].slice(0, 100);
    writeDb(db);
    return sendJson(response, 200, dashboardPayload(state));
  }

  if (request.method === 'POST' && url.pathname === '/api/evidence') {
    const body = await readBody(request);
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const source = String(body.source || '').trim();
    if (!title || !description || !source) return sendJson(response, 400, { error: 'Evidence title, source, and description are required.' });
    if (title.length > 120 || description.length > 2000 || source.length > 120) return sendJson(response, 400, { error: 'Evidence fields exceed their maximum length.' });
    const db = readDb();
    const state = getUserState(db, user);
    const evidence = {
      id: `EVD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      title,
      type: String(body.type || 'Other').trim(),
      source,
      description,
      timestamp: new Date().toISOString(),
      status: 'For review'
    };
    state.evidence.unshift(evidence);
    state.events.unshift({ id: evidence.id, timestamp: evidence.timestamp, title: `Evidence added: ${title}`, category: 'Evidence', severity: 'Low', description, status: 'observed' });
    writeDb(db);
    return sendJson(response, 201, { evidence, state: dashboardPayload(state) });
  }

  const alertAction = url.pathname.match(/^\/api\/alerts\/([^/]+)\/(review|resolve)$/);
  if (request.method === 'POST' && alertAction) {
    const db = readDb();
    const state = getUserState(db, user);
    const alert = state.alerts.find((item) => item.id === alertAction[1]);
    if (!alert) return sendJson(response, 404, { error: 'Alert not found.' });
    if (alert.status === 'resolved') return sendJson(response, 409, { error: 'This alert is already resolved.' });
    alert.status = alertAction[2] === 'review' ? 'reviewed' : 'resolved';
    alert.updatedAt = new Date().toISOString();
    writeDb(db);
    return sendJson(response, 200, { alert, state: dashboardPayload(state) });
  }

  if (request.method === 'POST' && url.pathname === '/api/case/notes') {
    const body = await readBody(request);
    const note = String(body.note || '').trim();
    if (!note || note.length > 2000) return sendJson(response, 400, { error: 'Enter a case note up to 2,000 characters.' });
    const db = readDb();
    const state = getUserState(db, user);
    state.case.notes.unshift({ id: `NOTE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, note, timestamp: new Date().toISOString() });
    writeDb(db);
    return sendJson(response, 201, { case: state.case });
  }

  if (request.method === 'PATCH' && url.pathname === '/api/case') {
    const body = await readBody(request);
    if (!['Open', 'Monitoring', 'Closed'].includes(body.status)) return sendJson(response, 400, { error: 'Choose Open, Monitoring, or Closed.' });
    const db = readDb();
    const state = getUserState(db, user);
    state.case.status = body.status;
    if (body.subject) state.case.subject = String(body.subject).trim().slice(0, 100);
    writeDb(db);
    return sendJson(response, 200, { case: state.case, state: dashboardPayload(state) });
  }

  if (request.method === 'POST' && url.pathname === '/api/reports') {
    const body = await readBody(request);
    const db = readDb();
    const state = getUserState(db, user);
    const title = String(body.title || '').trim();
    if (!title || title.length > 120) return sendJson(response, 400, { error: 'Enter a report title under 120 characters.' });
    const report = {
      id: `R-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      userId: user.id,
      title,
      type: String(body.type || 'Behaviour risk review').trim(),
      status: body.status === 'draft' ? 'draft' : 'ready',
      summary: String(body.summary || state.analysis.summary).trim(),
      createdAt: new Date().toISOString(),
      snapshot: {
        case: state.case,
        analysis: state.analysis,
        events: state.events.slice(0, 50),
        alerts: state.alerts,
        evidence: state.evidence,
        analystNotes: state.analysis.inputs.analystNotes
      }
    };
    db.reports.unshift(report);
    writeDb(db);
    return sendJson(response, 201, { report });
  }

  if (request.method === 'GET' && url.pathname === '/api/reports') {
    const db = readDb();
    return sendJson(response, 200, { reports: db.reports.filter((report) => report.userId === user.id) });
  }

  const reportRoute = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (request.method === 'GET' && reportRoute) {
    const db = readDb();
    const report = db.reports.find((item) => item.id === reportRoute[1] && item.userId === user.id);
    return report ? sendJson(response, 200, { report }) : sendJson(response, 404, { error: 'Report not found.' });
  }

  return sendJson(response, 404, { error: 'API route not found.' });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else if (request.method === 'GET') serveStatic(request, response);
    else sendJson(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Server error.' });
  }
});

server.listen(PORT, () => console.log(`Cyberstalk server running at http://localhost:${PORT}`));
