const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${url}/login.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Server did not start in time.');
}

test('API persists analysis, alerts, evidence, cases, and reports per analyst', async () => {
  const port = await availablePort();
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberstalk-test-'));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(port), CYBERSTALK_DATA_DIR: tempDirectory },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  let cookie = '';
  const testPassword = crypto.randomBytes(32).toString('hex');

  try {
    await waitForServer(base, child);
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'analyst@example.test', password: testPassword })
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get('set-cookie').split(';')[0];

    const request = (route, options = {}) => fetch(`${base}${route}`, {
      ...options,
      headers: { Cookie: cookie, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const dashboardResponse = await request('/api/dashboard');
    assert.equal(dashboardResponse.status, 200);
    const initialState = await dashboardResponse.json();
    assert.ok(initialState.analysis.score >= 0 && initialState.analysis.score <= 100);
    assert.ok(initialState.events.length > 0);

    const invalid = await request('/api/analyze', { method: 'POST', body: JSON.stringify({ inputs: { ...initialState.analysis.inputs, postBlockContacts: 50 } }) });
    assert.equal(invalid.status, 400);

    const analysisResponse = await request('/api/analyze', {
      method: 'POST', body: JSON.stringify({ inputs: {
        ...initialState.analysis.inputs,
        subject: 'Integration test profile',
        messagesPerHour: 180,
        contactAttempts: 40,
        distinctAccounts: 6,
        postBlockContacts: 20,
        suspiciousLinks: 4,
        profileVisits: 25,
        escalationRate: 90
      } })
    });
    assert.equal(analysisResponse.status, 200);
    const analyzed = await analysisResponse.json();
    assert.equal(analyzed.analysis.severity, 'Critical');
    assert.equal(analyzed.case.subject, 'Integration test profile');
    assert.ok(analyzed.alerts.length > 0);

    const alert = analyzed.alerts.find((item) => item.status === 'new');
    const reviewedResponse = await request(`/api/alerts/${alert.id}/review`, { method: 'POST' });
    assert.equal(reviewedResponse.status, 200);
    assert.equal((await reviewedResponse.json()).alert.status, 'reviewed');

    const evidenceResponse = await request('/api/evidence', {
      method: 'POST', body: JSON.stringify({ title: 'Reference record', type: 'Message', source: 'Synthetic test', description: 'An inert reference, no content uploaded.' })
    });
    assert.equal(evidenceResponse.status, 201);
    const evidenceResult = await evidenceResponse.json();
    assert.equal(evidenceResult.evidence.status, 'For review');

    const noteResponse = await request('/api/case/notes', { method: 'POST', body: JSON.stringify({ note: 'Reviewed synthetic sequence.' }) });
    assert.equal(noteResponse.status, 201);
    const statusResponse = await request('/api/case', { method: 'PATCH', body: JSON.stringify({ status: 'Monitoring' }) });
    assert.equal((await statusResponse.json()).case.status, 'Monitoring');

    const reportResponse = await request('/api/reports', {
      method: 'POST', body: JSON.stringify({ title: 'Integration report', type: 'Threat summary', status: 'ready' })
    });
    assert.equal(reportResponse.status, 201);
    const { report } = await reportResponse.json();
    assert.ok(report.snapshot.analysis.score >= 70);
    const reportRead = await request(`/api/reports/${report.id}`);
    assert.equal((await reportRead.json()).report.id, report.id);
    const reportsList = await request('/api/reports');
    assert.ok((await reportsList.json()).reports.some((item) => item.id === report.id));

    const persisted = await request('/api/dashboard');
    const persistedState = await persisted.json();
    assert.equal(persistedState.case.status, 'Monitoring');
    assert.equal(persistedState.case.notes[0].note, 'Reviewed synthetic sequence.');
    assert.ok(persistedState.evidence.some((item) => item.id === evidenceResult.evidence.id));

    const demoLogin = await fetch(`${base}/api/auth/demo`, { method: 'POST' });
    assert.equal(demoLogin.status, 200);
    const demoCookie = demoLogin.headers.get('set-cookie').split(';')[0];
    const demoSession = await fetch(`${base}/api/auth/session`, { headers: { Cookie: demoCookie } });
    assert.equal((await demoSession.json()).user.email, 'demo@cyberstalk.local');
    const reservedEmailLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@cyberstalk.local', password: testPassword })
    });
    assert.equal(reservedEmailLogin.status, 400);

    const databaseRequest = await fetch(`${base}/data/db.json`);
    assert.equal(databaseRequest.status, 404);
    const logout = await request('/api/auth/logout', { method: 'POST' });
    assert.equal(logout.status, 200);
    cookie = '';
    const unauthorized = await fetch(`${base}/api/dashboard`);
    assert.equal(unauthorized.status, 401);
  } finally {
    child.kill();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
