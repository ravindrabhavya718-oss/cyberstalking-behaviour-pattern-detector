const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const sessions = new Map();

const defaultDashboard = {
  stats: {
    totalEvents: 1284,
    suspiciousEvents: 217,
    highRiskEvents: 43,
    clusterCount: 12,
    activeCases: 7,
    confidenceLevel: 94,
    threatRisk: 87
  },
  signals: [82, 74, 68],
  activity: {
    contact: [18, 34, 29, 52, 48, 63, 56],
    block: [10, 18, 15, 26, 20, 32, 28]
  }
};

function readDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: [], reports: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: [], reports: [] };
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
    return;
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  response.writeHead(200, { 'Content-Type': `${types[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(filePath).pipe(response);
}

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || password.length < 4) return sendJson(response, 400, { error: 'Enter a valid email and a password with at least 4 characters.' });

    const db = readDb();
    let user = db.users.find((item) => item.email === email);
    if (!user) {
      user = { id: crypto.randomUUID(), email, passwordHash: hash(password), createdAt: new Date().toISOString() };
      db.users.push(user);
      writeDb(db);
    } else if (user.passwordHash !== hash(password)) {
      return sendJson(response, 401, { error: 'Incorrect email or password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: user.id, email: user.email });
    return sendJson(response, 200, { user: { id: user.id, email: user.email } }, {
      'Set-Cookie': `cyberstalk_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(request).cyberstalk_session;
    if (token) sessions.delete(token);
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'cyberstalk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  const user = currentUser(request);
  if (!user) return sendJson(response, 401, { error: 'Authentication required.' });

  if (request.method === 'GET' && url.pathname === '/api/auth/session') return sendJson(response, 200, { user });
  if (request.method === 'GET' && url.pathname === '/api/dashboard') return sendJson(response, 200, defaultDashboard);

  if (request.method === 'POST' && url.pathname === '/api/reports') {
    const body = await readBody(request);
    const report = {
      id: `R-${Date.now()}`,
      userId: user.id,
      title: String(body.title || 'Behaviour escalation summary').trim(),
      type: String(body.type || 'Behaviour risk review').trim(),
      summary: String(body.summary || '').trim(),
      createdAt: new Date().toISOString()
    };
    const db = readDb();
    db.reports.unshift(report);
    writeDb(db);
    return sendJson(response, 201, { report });
  }

  if (request.method === 'GET' && url.pathname === '/api/reports') {
    const db = readDb();
    return sendJson(response, 200, { reports: db.reports.filter((report) => report.userId === user.id) });
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
