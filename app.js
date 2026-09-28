const SAMPLE_FALLBACK = {
  subject: 'Sample profile', messagesPerHour: 64, contactAttempts: 22, distinctAccounts: 3,
  postBlockContacts: 5, suspiciousLinks: 1, profileVisits: 11, escalationRate: 62,
  observationDays: 7, analystNotes: 'Synthetic sample data for demonstrating explainable behavioural analysis.'
};

let appState = null;
let currentUser = null;
let selectedReport = null;
let activeAlertFilter = 'All';
let zoomed = false;
let reportSaving = false;

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add('show');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => toast.classList.remove('show'), 3200);
}

async function apiRequest(route, options = {}) {
  let response;
  if (window.location.protocol === 'file:' && window.cyberstalkOffline) return window.cyberstalkOffline(route, options);
  try {
    response = await fetch(route, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
  } catch (error) {
    if (window.cyberstalkOffline) return window.cyberstalkOffline(route, options);
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function storeUser(user) {
  currentUser = user;
  if (user) localStorage.setItem('cyberstalkSession', JSON.stringify({ id: user.id, email: user.email }));
  else localStorage.removeItem('cyberstalkSession');
}

async function requireSession() {
  try {
    const { user } = await apiRequest('/api/auth/session');
    storeUser(user);
    if (!user) location.replace('login.html');
    return user;
  } catch {
    storeUser(null);
    location.replace('login.html');
    return null;
  }
}

function addText(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function formatDate(value, includeTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date);
}

function makeButton(label, action, className = 'small-btn') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  return button;
}

function openDialog(title, contentNodes, actions = []) {
  const dialog = document.getElementById('detailDialog');
  if (!dialog) return;
  document.getElementById('dialogTitle').textContent = title;
  const content = document.getElementById('dialogContent');
  const actionArea = document.getElementById('dialogActions');
  content.replaceChildren(...contentNodes);
  actionArea.replaceChildren(...actions);
  if (!dialog.open) dialog.showModal();
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
}

function openAnalysisDetails() {
  if (!appState) return showToast('Analysis data is not available yet.', 'warning');
  const analysis = appState.analysis;
  const content = document.createElement('div');
  content.className = 'detail-stack';
  addText(content, 'p', `Case ${appState.case.id} · ${analysis.subject} · ${formatDate(analysis.timestamp)}`);
  addText(content, 'p', `Risk ${analysis.score}/100 · ${analysis.severity} · Confidence ${analysis.confidence}%`);
  addText(content, 'p', analysis.summary);
  addText(content, 'h3', 'Contributing indicators');
  const list = document.createElement('ul');
  analysis.contributingFactors.forEach((factor) => addText(list, 'li', `${factor.label}: ${factor.reason} (${factor.contribution} weighted points)`));
  content.appendChild(list);
  addText(content, 'h3', 'Recommended defensive actions');
  const recommendations = document.createElement('ul');
  analysis.recommendations.forEach((recommendation) => addText(recommendations, 'li', recommendation));
  content.appendChild(recommendations);
  const goTimeline = makeButton('Review timeline', 'navigate-timeline', 'small-btn primary');
  openDialog('Investigation details', [content], [goTimeline]);
}

function populateAnalysisForm(inputs) {
  const form = document.getElementById('analysisForm');
  if (!form || !inputs) return;
  Object.entries(inputs).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
  const escalation = document.getElementById('escalationInput');
  if (escalation) document.getElementById('escalationOutput').textContent = `${escalation.value}%`;
}

function renderStats() {
  const stats = appState.stats;
  for (const key of ['totalEvents', 'suspiciousEvents', 'highRiskEvents', 'clusterCount', 'activeCases', 'confidenceLevel']) {
    const element = document.getElementById(key);
    if (element) element.textContent = key === 'activeCases' ? String(stats[key]).padStart(2, '0') : `${stats[key]}${key === 'confidenceLevel' ? '%' : ''}`;
  }
  const alertCount = document.getElementById('alertCount');
  if (alertCount) alertCount.textContent = String(appState.alerts.filter((alert) => alert.status === 'new').length);
}

function renderRisk() {
  const analysis = appState.analysis;
  const score = Math.max(0, Math.min(100, Number(analysis.score) || 0));
  document.getElementById('threatRisk').textContent = String(score);
  const severityColors = { Low: 'var(--green)', Medium: 'var(--amber)', High: 'var(--red)', Critical: '#ff7895' };
  document.querySelector('.ring').style.setProperty('--risk-accent', severityColors[analysis.severity] || 'var(--blue)');
  document.querySelector('.ring').style.background = `conic-gradient(var(--risk-accent) 0 ${score}%, rgba(255,255,255,0.06) ${score}% 100%)`;
  document.querySelector('.ring').setAttribute('aria-label', `Risk score ${score} out of 100, ${analysis.severity}`);
  document.getElementById('riskBarFill').style.width = `${score}%`;
  const severity = document.getElementById('riskSeverity');
  severity.textContent = analysis.severity;
  severity.dataset.severity = analysis.severity.toLowerCase();
  document.getElementById('riskCaption').textContent = `Explainable score from ${analysis.indicators.length} weighted indicators. Confidence ${analysis.confidence}%. Human review required.`;

  const factors = document.getElementById('riskFactors');
  factors.replaceChildren();
  analysis.indicators.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'factor';
    addText(row, 'span', item.label, 'factor-name');
    addText(row, 'span', `${item.value}% · +${item.contribution}`, 'factor-value');
    const track = document.createElement('div');
    track.className = 'factor-track';
    const fill = document.createElement('span');
    fill.style.width = `${item.value}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.title = `${item.reason}; weight ${(item.weight * 100).toFixed(0)}%`;
    factors.appendChild(row);
  });

  const title = analysis.severity === 'Critical' ? 'Critical indicators require prompt review' :
    analysis.severity === 'High' ? 'Elevated behaviour indicators detected' :
    analysis.severity === 'Medium' ? 'Some behaviour indicators need review' : 'No significant indicators detected';
  document.getElementById('liveInsightTitle').textContent = title;
  document.getElementById('liveInsightText').textContent = analysis.summary;
  const list = document.getElementById('liveInsightFactors');
  list.replaceChildren();
  const insights = analysis.contributingFactors.slice(0, 3);
  if (!insights.length) addText(list, 'li', 'No weighted contributors', 'empty-row');
  insights.forEach((factor) => {
    const item = document.createElement('li');
    addText(item, 'span', factor.label);
    addText(item, 'span', `${factor.value}%`);
    list.appendChild(item);
  });
  const stamp = document.getElementById('lastAnalysisAt');
  stamp.textContent = `Last analyzed ${formatDate(analysis.timestamp)}`;
}

function renderPatterns() {
  const target = document.getElementById('patternList');
  target.replaceChildren();
  if (!appState.analysis.patterns.length) {
    addText(target, 'p', 'No behavioural pattern crossed the configured review threshold.', 'empty-state');
    return;
  }
  appState.analysis.patterns.forEach((pattern) => addText(target, 'p', `Detected: ${pattern}`, 'pattern-item'));
}

function renderAlerts() {
  const target = document.getElementById('alertList');
  const query = document.getElementById('alertSearch').value.trim().toLowerCase();
  const severity = document.getElementById('alertSeverityFilter').value;
  target.replaceChildren();
  const alerts = appState.alerts.filter((alert) => {
    const matchesSeverity = severity === 'All' || alert.severity === severity;
    const matchesSearch = `${alert.id} ${alert.category} ${alert.description} ${alert.status}`.toLowerCase().includes(query);
    return matchesSeverity && matchesSearch;
  });
  if (!alerts.length) {
    addText(target, 'p', appState.alerts.length ? 'No alerts match the selected search and severity.' : 'No alerts have been generated for this analysis.', 'empty-state');
    return;
  }
  alerts.forEach((alert) => {
    const row = document.createElement('article');
    row.className = 'alert-item';
    row.dataset.alertId = alert.id;
    addText(row, 'span', alert.severity, `alert-pill ${alert.severity.toLowerCase()}`);
    const body = document.createElement('div');
    body.className = 'alert-body';
    addText(body, 'strong', alert.category);
    addText(body, 'span', `${alert.id} · ${formatDate(alert.timestamp)} · ${alert.status}`, 'alert-meta');
    addText(body, 'p', alert.description, 'alert-description');
    row.appendChild(body);
    const actions = document.createElement('div');
    actions.className = 'alert-actions';
    actions.append(makeButton('Details', 'alert-details'));
    if (alert.status === 'new') actions.append(makeButton('Review', 'alert-review'));
    if (alert.status !== 'resolved') actions.append(makeButton('Resolve', 'alert-resolve'));
    row.appendChild(actions);
    target.appendChild(row);
  });
}

function renderTimeline() {
  const target = document.getElementById('timelineList');
  target.replaceChildren();
  if (!appState.events.length) {
    addText(target, 'p', 'No activity is recorded yet.', 'empty-state');
    return;
  }
  appState.events.forEach((event) => {
    const row = document.createElement('div');
    row.className = 'timeline-row';
    addText(row, 'span', formatDate(event.timestamp), 'time-tag');
    const node = document.createElement('div');
    node.className = 'event-node';
    node.dataset.eventId = event.id;
    addText(node, 'strong', event.title);
    addText(node, 'span', `${event.severity} · ${event.category} · ${event.status}`);
    node.appendChild(makeButton('View details', 'event-details'));
    row.appendChild(node);
    target.appendChild(row);
  });
}

function renderEvidence() {
  const target = document.getElementById('evidenceList');
  target.replaceChildren();
  if (!appState.evidence.length) {
    addText(target, 'p', 'No evidence has been added. Add source references without uploading sensitive material.', 'empty-state');
    return;
  }
  appState.evidence.forEach((evidence) => {
    const row = document.createElement('article');
    row.className = 'evidence-item';
    const details = document.createElement('div');
    addText(details, 'strong', evidence.title);
    addText(details, 'div', `${evidence.type} · ${evidence.source} · ${formatDate(evidence.timestamp)}`, 'alert-meta');
    addText(details, 'p', evidence.description, 'evidence-description');
    row.appendChild(details);
    addText(row, 'span', evidence.status, 'tag orange');
    target.appendChild(row);
  });
}

function renderCase() {
  const currentCase = appState.case;
  document.getElementById('caseSnapshotTitle').textContent = `${currentCase.id} · ${currentCase.status}`;
  document.getElementById('caseSnapshotText').textContent = `${currentCase.subject}: ${appState.analysis.summary}`;
  document.getElementById('caseIdLabel').textContent = `${currentCase.id} · ${currentCase.subject}`;
  document.getElementById('caseStatusLabel').textContent = `Status: ${currentCase.status}`;
  document.getElementById('caseUpdatedLabel').textContent = `Opened ${formatDate(currentCase.createdAt, false)}`;
  document.getElementById('caseStatusSelect').value = currentCase.status;
  const notes = document.getElementById('caseNotesList');
  notes.replaceChildren();
  if (!currentCase.notes.length) addText(notes, 'p', 'No analyst notes have been added.', 'empty-state');
  currentCase.notes.forEach((entry) => {
    const note = document.createElement('article');
    note.className = 'note-item';
    addText(note, 'p', entry.note);
    addText(note, 'span', formatDate(entry.timestamp), 'alert-meta');
    notes.appendChild(note);
  });
}

function chartSeries() {
  const range = document.getElementById('chartRangeSelect').value;
  const count = range === '24H' ? 6 : 7;
  const span = range === '24H' ? 4 * 3600000 : (range === '30D' ? 30 : 7) * 86400000 / count;
  const now = Date.now();
  const labels = [];
  const contacts = Array(count).fill(0);
  const blocks = Array(count).fill(0);
  for (let index = 0; index < count; index += 1) {
    const start = now - span * (count - index);
    const date = new Date(start + span / 2);
    labels.push(range === '24H' ? `${date.getHours().toString().padStart(2, '0')}:00` : date.toLocaleDateString(undefined, { weekday: 'short' }));
  }
  appState.events.forEach((event) => {
    const age = now - new Date(event.timestamp).getTime();
    if (age < 0 || age > span * count) return;
    const index = Math.min(count - 1, Math.floor((span * count - age) / span));
    const category = `${event.category} ${event.title}`.toLowerCase();
    if (category.includes('block')) blocks[index] += 1;
    else if (category.includes('contact') || category.includes('message')) contacts[index] += 1;
  });
  return { labels, contacts, blocks };
}

function drawActivityChart() {
  const canvas = document.getElementById('activityChart');
  if (!canvas || !appState) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const { labels, contacts, blocks } = chartSeries();
  const pad = { top: 18, right: 18, bottom: 30, left: 34 };
  const width = rect.width - pad.left - pad.right;
  const height = rect.height - pad.top - pad.bottom;
  const maximum = Math.max(4, ...contacts, ...blocks);
  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(120, 146, 165, 0.2)';
  ctx.fillStyle = '#86a6b6';
  for (let line = 0; line <= 4; line += 1) {
    const y = pad.top + (height / 4) * line;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(rect.width - pad.right, y); ctx.stroke();
    ctx.fillText(String(Math.round(maximum * (4 - line) / 4)), 4, y);
  }
  function plot(values, color) {
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = pad.left + (width / values.length) * (index + 0.5);
      const y = pad.top + height - (value / maximum) * height;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke();
    values.forEach((value, index) => {
      const x = pad.left + (width / values.length) * (index + 0.5);
      const y = pad.top + height - (value / maximum) * height;
      ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
  }
  plot(contacts, '#5dc9ff'); plot(blocks, '#ff5e7d');
  ctx.fillStyle = '#86a6b6'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  labels.forEach((label, index) => ctx.fillText(label, pad.left + (width / labels.length) * (index + 0.5), rect.height - 7));
  ctx.textAlign = 'start';
  if (!contacts.some(Boolean) && !blocks.some(Boolean)) {
    ctx.fillStyle = '#edf9ff'; ctx.textAlign = 'center';
    ctx.fillText('No events in this time window', rect.width / 2, rect.height / 2);
    ctx.textAlign = 'start';
  }
}

function drawSeverityChart() {
  const canvas = document.getElementById('severityChart');
  if (!canvas || !appState) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const severities = ['Critical', 'High', 'Medium', 'Low'];
  const colors = ['#ff5e7d', '#ff9f59', '#ffbf5a', '#64ffb4'];
  const counts = severities.map((severity) => appState.alerts.filter((alert) => alert.severity === severity && alert.status !== 'resolved').length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const centerX = Math.min(100, rect.width * 0.25); const centerY = rect.height / 2; const radius = Math.min(66, rect.height * 0.34);
  let start = -Math.PI / 2;
  if (!total) {
    ctx.beginPath(); ctx.strokeStyle = 'rgba(134,166,182,0.3)'; ctx.lineWidth = 16; ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.stroke();
  } else counts.forEach((count, index) => {
    if (!count) return;
    const end = start + count / total * Math.PI * 2;
    ctx.beginPath(); ctx.strokeStyle = colors[index]; ctx.lineWidth = 16; ctx.arc(centerX, centerY, radius, start, end); ctx.stroke(); start = end;
  });
  ctx.fillStyle = '#edf9ff'; ctx.font = '700 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(total), centerX, centerY + 6);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#86a6b6'; ctx.fillText('ACTIVE', centerX, centerY + 23);
  ctx.textAlign = 'left';
  severities.forEach((severity, index) => {
    const y = 32 + index * 30;
    ctx.fillStyle = colors[index]; ctx.fillRect(centerX + radius + 24, y - 7, 8, 8);
    ctx.fillStyle = '#edf9ff'; ctx.fillText(`${severity} · ${counts[index]}`, centerX + radius + 40, y);
  });
}

function renderDashboard() {
  if (!appState) return;
  populateAnalysisForm(appState.analysis.inputs);
  renderStats(); renderRisk(); renderPatterns(); renderAlerts(); renderTimeline(); renderEvidence(); renderCase();
  drawActivityChart(); drawSeverityChart();
}

function downloadFile(name, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getAnalysisInputs() {
  const form = document.getElementById('analysisForm');
  if (!form.reportValidity()) throw new Error('Complete the required observation fields first.');
  const data = new FormData(form);
  const result = {};
  for (const key of ['subject', 'analystNotes']) result[key] = String(data.get(key) || '').trim();
  for (const key of ['messagesPerHour', 'contactAttempts', 'distinctAccounts', 'postBlockContacts', 'suspiciousLinks', 'profileVisits', 'escalationRate', 'observationDays']) result[key] = Number(data.get(key));
  if (result.postBlockContacts > result.contactAttempts) throw new Error('Post-block contacts cannot exceed total contact attempts.');
  return result;
}

async function runAnalysis() {
  const button = document.getElementById('analyzeBtn');
  try {
    const inputs = getAnalysisInputs();
    button.disabled = true; button.textContent = 'Analyzing...';
    appState = await apiRequest('/api/analyze', { method: 'POST', body: JSON.stringify({ inputs }) });
    renderDashboard();
    showToast(`Analysis complete: ${appState.analysis.score}/100 · ${appState.analysis.severity}.`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false; button.textContent = 'Run analysis';
  }
}

async function loadDashboard() {
  const user = await requireSession();
  if (!user) return;
  try {
    appState = await apiRequest('/api/dashboard');
    renderDashboard();
  } catch (error) {
    showToast(`Dashboard unavailable: ${error.message}`, 'error');
  }
}

async function updateAlert(alertElement, action) {
  const alertId = alertElement.dataset.alertId;
  alertElement.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  try {
    const result = await apiRequest(`/api/alerts/${encodeURIComponent(alertId)}/${action}`, { method: 'POST' });
    appState = result.state;
    renderDashboard();
    showToast(action === 'review' ? 'Alert marked reviewed.' : 'Alert resolved.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
  finally { alertElement.querySelectorAll('button').forEach((button) => { button.disabled = false; }); }
}

function renderAlertDetails(alert) {
  const content = document.createElement('div'); content.className = 'detail-stack';
  addText(content, 'p', `${alert.id} · ${alert.severity} · ${alert.status}`);
  addText(content, 'p', `${alert.category} · ${formatDate(alert.timestamp)}`);
  addText(content, 'p', alert.description);
  addText(content, 'p', 'Treat this alert as a review lead. Verify context and source evidence before taking action.');
  openDialog('Alert details', [content]);
}

async function loadReport(reportId) {
  try {
    const { report } = await apiRequest(`/api/reports/${encodeURIComponent(reportId)}`);
    selectedReport = report;
    renderReportPreview(report);
  } catch (error) { showToast(error.message, 'error'); }
}

function renderReportPreview(report) {
  const target = document.getElementById('reportPreview');
  if (!target) return;
  target.replaceChildren();
  const snapshot = report.snapshot;
  const analysis = snapshot.analysis;
  addText(target, 'p', `Report ID ${report.id} · Created ${formatDate(report.createdAt)} · ${report.status.toUpperCase()}`, 'report-meta');
  addText(target, 'h3', 'CYBERSTALKING BEHAVIOUR ANALYSIS REPORT');
  addText(target, 'h4', report.title);
  addText(target, 'p', `Case ${snapshot.case.id} · ${snapshot.case.status} · Subject/profile: ${analysis.subject}`);
  addText(target, 'p', `Risk score ${analysis.score}/100 · Severity ${analysis.severity} · Confidence ${analysis.confidence}%`);
  addText(target, 'p', report.summary || analysis.summary);
  const sections = [
    ['Behavioural indicators', analysis.indicators.map((item) => `${item.label}: ${item.value}% (${item.reason}; weighted contribution ${item.contribution})`)],
    ['Detected patterns', analysis.patterns.length ? analysis.patterns : ['No pattern crossed the review threshold.']],
    ['Activity summary', [`${snapshot.events.length} events recorded; ${snapshot.alerts.length} alerts; ${snapshot.evidence.length} evidence items.`]],
    ['Evidence summary', snapshot.evidence.map((item) => `${item.title} (${item.type}, ${item.source}; ${item.status})`)],
    ['Recommended defensive actions', analysis.recommendations],
    ['Analyst notes', [analysis.inputs.analystNotes || 'No analyst notes provided.']]
  ];
  sections.forEach(([heading, entries]) => {
    const section = document.createElement('section'); section.className = 'report-section';
    addText(section, 'h4', heading);
    const list = document.createElement('ul');
    entries.forEach((entry) => addText(list, 'li', entry));
    section.appendChild(list); target.appendChild(section);
  });
  const eventsSection = document.createElement('section'); eventsSection.className = 'report-section';
  addText(eventsSection, 'h4', 'Timeline');
  const eventList = document.createElement('ul');
  snapshot.events.slice(0, 20).forEach((event) => addText(eventList, 'li', `${formatDate(event.timestamp)} · ${event.severity} · ${event.title}: ${event.description}`));
  eventsSection.appendChild(eventList); target.appendChild(eventsSection);
  document.getElementById('viewReportBtn').disabled = false;
  document.getElementById('downloadReportBtn').disabled = false;
  document.getElementById('printReportBtn').disabled = false;
}

async function loadSavedReports() {
  const target = document.getElementById('savedReportList');
  if (!target) return;
  try {
    const { reports } = await apiRequest('/api/reports');
    target.replaceChildren();
    if (!reports.length) return addText(target, 'p', 'No saved reports yet.', 'empty-state');
    reports.forEach((report) => {
      const row = document.createElement('article'); row.className = 'saved-report-row';
      const info = document.createElement('div');
      addText(info, 'strong', report.title);
      addText(info, 'span', `${report.id} · ${formatDate(report.createdAt)} · ${report.status}`, 'alert-meta');
      row.appendChild(info);
      row.appendChild(makeButton('View', 'view-saved-report'));
      row.dataset.reportId = report.id;
      target.appendChild(row);
    });
  } catch (error) { target.replaceChildren(); addText(target, 'p', `Could not load reports: ${error.message}`, 'empty-state'); }
}

async function saveReport(status) {
  if (reportSaving) return;
  const form = document.getElementById('reportForm');
  if (!form.reportValidity()) throw new Error('Enter a report title before saving.');
  const title = document.getElementById('reportTitle').value.trim();
  const summary = document.getElementById('reportSummary').value.trim();
  const type = document.getElementById('reportType').value;
  reportSaving = true;
  const buttons = form.querySelectorAll('button');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const { report } = await apiRequest('/api/reports', { method: 'POST', body: JSON.stringify({ title, summary, type, status }) });
    selectedReport = report;
    renderReportPreview(report);
    await loadSavedReports();
    showToast(status === 'draft' ? 'Report draft saved.' : 'Report generated and saved.', 'success');
  } finally {
    reportSaving = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function loadReportsPage() {
  const user = await requireSession();
  if (!user) return;
  await loadSavedReports();
  const params = new URLSearchParams(location.search);
  if (params.has('report')) await loadReport(params.get('report'));
}

function bindLogin() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const { user } = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        remember: document.getElementById('rememberMe').checked
      }) });
      storeUser(user);
      showToast('Authenticated. Loading workspace...', 'success');
      location.assign('dashboard.html');
    } catch (error) { showToast(error.message, 'error'); }
    finally { submit.disabled = false; }
  });
  document.getElementById('demoAccessBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try {
      const { user } = await apiRequest('/api/auth/demo', { method: 'POST' });
      storeUser(user); location.assign('dashboard.html');
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; }
  });
  apiRequest('/api/auth/session').then(({ user }) => {
    storeUser(user);
    if (user) location.replace('dashboard.html');
  }).catch(() => storeUser(null));
}

function bindNavigation() {
  document.querySelectorAll('.nav-btn[data-target]').forEach((button) => button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    if (!target) return showToast('That dashboard section is unavailable.', 'error');
    document.querySelectorAll('.nav-btn').forEach((item) => item.classList.toggle('active', item === button));
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const title = button.textContent.trim().replace(/\s+\d+$/, '');
    document.querySelector('.crumb strong').textContent = title;
  }));
  document.querySelectorAll('.nav-btn[data-route]').forEach((button) => button.addEventListener('click', () => location.assign(button.dataset.route)));
  document.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
    const content = document.createElement('div'); content.className = 'detail-stack';
    addText(content, 'p', `Signed in as ${currentUser?.email || 'analyst'}.`);
    addText(content, 'p', 'This local workspace stores synthetic analysis, evidence references, notes, reports, and review states in its local JSON database.');
    addText(content, 'p', 'Behavioural scores are triage aids only. Confirm context and evidence with a qualified human reviewer.');
    const compact = document.createElement('button'); compact.type = 'button'; compact.className = 'small-btn primary'; compact.textContent = document.body.classList.contains('compact-mode') ? 'Use standard density' : 'Use compact density';
    compact.addEventListener('click', () => {
      document.body.classList.toggle('compact-mode');
      localStorage.setItem('cyberstalkCompactMode', document.body.classList.contains('compact-mode') ? 'true' : 'false');
      compact.textContent = document.body.classList.contains('compact-mode') ? 'Use standard density' : 'Use compact density';
    });
    openDialog('Workspace settings', [content], [compact]);
  });
}

function bindDashboard() {
  document.getElementById('analysisForm')?.addEventListener('submit', (event) => { event.preventDefault(); runAnalysis(); });
  document.getElementById('loadSampleBtn')?.addEventListener('click', async () => {
    try {
      const { inputs } = await apiRequest('/api/sample');
      populateAnalysisForm(inputs);
      showToast('Sample dataset restored to the form. Run analysis to save it.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
  document.getElementById('clearInputsBtn')?.addEventListener('click', () => {
    if (!window.confirm('Clear the unsaved observation form? The saved analysis and case data will remain unchanged.')) return;
    document.getElementById('analysisForm').reset();
    document.getElementById('escalationOutput').textContent = '0%';
    showToast('Unsaved form inputs cleared. Saved analysis was not changed.', 'info');
  });
  document.getElementById('escalationInput')?.addEventListener('input', (event) => { document.getElementById('escalationOutput').textContent = `${event.target.value}%`; });
  document.getElementById('runSimulationBtn')?.addEventListener('click', () => document.getElementById('analysisForm').requestSubmit());
  document.querySelector('[data-action="run-analysis"]')?.addEventListener('click', () => document.getElementById('analysisForm').requestSubmit());
  document.querySelectorAll('[data-action="investigate"], #investigateBtn').forEach((button) => button.addEventListener('click', openAnalysisDetails));
  document.querySelectorAll('[data-action="add-evidence"], #addEvidenceBtn').forEach((button) => button.addEventListener('click', () => document.getElementById('evidenceDialog').showModal()));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', closeDialogs));
  document.getElementById('detailDialog')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  document.getElementById('evidenceDialog')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeDialogs(); if (zoomed) toggleZoom(false); } });
  document.getElementById('evidenceForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    const payload = {
      title: document.getElementById('evidenceTitleInput').value.trim(),
      type: document.getElementById('evidenceTypeInput').value,
      source: document.getElementById('evidenceSourceInput').value.trim(),
      description: document.getElementById('evidenceDescriptionInput').value.trim()
    };
    submitButton.disabled = true;
    try {
      const { state } = await apiRequest('/api/evidence', { method: 'POST', body: JSON.stringify(payload) });
      appState = state; renderDashboard(); form.reset(); document.getElementById('evidenceDialog').close();
      showToast('Evidence reference added to the case.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
    finally { submitButton.disabled = false; }
  });
  document.getElementById('caseNoteForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const field = document.getElementById('caseNoteInput');
    try {
      await apiRequest('/api/case/notes', { method: 'POST', body: JSON.stringify({ note: field.value.trim() }) });
      field.value = ''; appState = await apiRequest('/api/dashboard'); renderDashboard(); showToast('Analyst note added to the case.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
  document.getElementById('saveCaseStatusBtn')?.addEventListener('click', async () => {
    try {
      const result = await apiRequest('/api/case', { method: 'PATCH', body: JSON.stringify({ status: document.getElementById('caseStatusSelect').value }) });
      appState = result.state; renderDashboard(); showToast('Case status updated.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
  document.getElementById('refreshDashboardBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { appState = await apiRequest('/api/dashboard'); renderDashboard(); showToast('Dashboard refreshed from saved case data.', 'success'); }
    catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; }
  });
  document.getElementById('dashboardReportBtn')?.addEventListener('click', () => location.assign('report.html'));
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); }
    catch (error) { showToast(error.message, 'warning'); }
    finally { storeUser(null); location.assign('login.html'); }
  });
  document.getElementById('alertSearch')?.addEventListener('input', renderAlerts);
  document.getElementById('alertSeverityFilter')?.addEventListener('change', renderAlerts);
  document.getElementById('alertList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('.alert-item');
    if (button.dataset.action === 'alert-details') return renderAlertDetails(appState.alerts.find((alert) => alert.id === row.dataset.alertId));
    if (button.dataset.action === 'alert-review') return updateAlert(row, 'review');
    if (button.dataset.action === 'alert-resolve') return updateAlert(row, 'resolve');
  });
  document.getElementById('timelineList')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="event-details"]'); if (!button) return;
    const eventData = appState.events.find((item) => item.id === button.closest('[data-event-id]').dataset.eventId);
    if (!eventData) return showToast('Event details are no longer available.', 'warning');
    const content = document.createElement('div'); content.className = 'detail-stack';
    addText(content, 'p', `${eventData.id} · ${formatDate(eventData.timestamp)} · ${eventData.severity}`);
    addText(content, 'h3', eventData.title); addText(content, 'p', eventData.description); addText(content, 'p', `Category: ${eventData.category} · Status: ${eventData.status}`);
    openDialog('Timeline event', [content]);
  });
  document.getElementById('exportTimelineBtn')?.addEventListener('click', () => downloadFile('cyberstalk-timeline.json', JSON.stringify(appState.events, null, 2), 'application/json'));
  document.getElementById('exportCaseBtn')?.addEventListener('click', () => downloadFile(`${appState.case.id.toLowerCase()}-case.json`, JSON.stringify({ case: appState.case, analysis: appState.analysis, events: appState.events, alerts: appState.alerts, evidence: appState.evidence }, null, 2), 'application/json'));
  document.getElementById('zoomChartBtn')?.addEventListener('click', () => toggleZoom(!zoomed));
  document.getElementById('resetChartBtn')?.addEventListener('click', () => { toggleZoom(false); document.getElementById('chartRangeSelect').value = '7D'; drawActivityChart(); showToast('Chart view reset to the seven-day window.', 'info'); });
  document.getElementById('chartRangeSelect')?.addEventListener('change', drawActivityChart);
  document.body.classList.toggle('compact-mode', localStorage.getItem('cyberstalkCompactMode') === 'true');
  bindNavigation();
}

function toggleZoom(value) {
  zoomed = value;
  const chart = document.getElementById('activityChart')?.closest('.chart-wrap');
  chart?.classList.toggle('chart-expanded', zoomed);
  const button = document.getElementById('zoomChartBtn');
  if (button) button.textContent = zoomed ? 'Close zoom' : 'Zoom';
  drawActivityChart();
}

function bindReportPage() {
  const form = document.getElementById('reportForm');
  if (!form) return;
  bindNavigation();
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); }
    catch (error) { showToast(error.message, 'warning'); }
    finally { storeUser(null); location.assign('login.html'); }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault(); saveReport('ready').catch((error) => showToast(error.message, 'error'));
  });
  document.getElementById('saveDraftBtn').addEventListener('click', () => saveReport('draft').catch((error) => showToast(error.message, 'error')));
  document.getElementById('viewReportBtn').addEventListener('click', () => document.getElementById('reportPreview').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.getElementById('downloadReportBtn').addEventListener('click', () => {
    if (!selectedReport) return showToast('Generate or select a saved report first.', 'warning');
    downloadFile(`${selectedReport.id.toLowerCase()}.json`, JSON.stringify(selectedReport, null, 2), 'application/json');
    showToast('Report JSON downloaded.', 'success');
  });
  document.getElementById('printReportBtn').addEventListener('click', () => {
    if (!selectedReport) return showToast('Generate or select a saved report first.', 'warning');
    window.print();
  });
  document.getElementById('savedReportList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="view-saved-report"]');
    if (button) loadReport(button.closest('[data-report-id]').dataset.reportId);
  });
  loadReportsPage();
}

function registerGlobalDialogActions() {
  document.getElementById('dialogActions')?.addEventListener('click', (event) => {
    if (event.target.dataset.action === 'navigate-timeline') {
      closeDialogs(); document.getElementById('timelineSection')?.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindLogin();
  if (document.querySelector('.dashboard-grid')) { bindDashboard(); loadDashboard(); }
  if (document.getElementById('reportForm')) bindReportPage();
  registerGlobalDialogActions();
  window.addEventListener('resize', () => { drawActivityChart(); drawSeverityChart(); });
});
