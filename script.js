function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => toast.classList.remove('show'), 2200);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function setSession(user) {
  if (user) localStorage.setItem('cyberstalkSession', JSON.stringify(user));
  else localStorage.removeItem('cyberstalkSession');
}

async function loadDashboardData() {
  const data = await apiRequest('/api/dashboard');
  Object.entries(data.stats).forEach(([key, value]) => {
    const element = document.getElementById(key);
    if (element) element.textContent = key === 'activeCases' ? String(value).padStart(2, '0') : `${value}${key === 'confidenceLevel' ? '%' : ''}`;
  });
  const riskBar = document.getElementById('riskBarFill');
  if (riskBar) riskBar.style.width = `${data.stats.threatRisk}%`;
  document.querySelectorAll('.signal-score').forEach((element, index) => {
    const value = data.signals[index];
    if (value !== undefined) {
      element.textContent = `${value}%`;
      const meter = element.closest('.signal-card')?.querySelector('.signal-meter span');
      if (meter) meter.style.width = `${value}%`;
    }
  });
}

function initDashboard() {
  const svg = document.getElementById('networkSvg');
  if (!svg) return;

  const nodes = [
    { name: 'USER', x: 78, y: 132, color: '#64ffb4' },
    { name: 'ACCOUNT', x: 160, y: 70, color: '#5dc9ff' },
    { name: 'MESSAGE', x: 224, y: 165, color: '#ffbd59' },
    { name: 'DEVICE', x: 304, y: 88, color: '#5dc9ff' },
    { name: 'IP', x: 376, y: 136, color: '#ff5e7d' },
    { name: 'TIMESTAMP', x: 448, y: 210, color: '#64ffb4' },
    { name: 'PLATFORM', x: 400, y: 300, color: '#5dc9ff' },
    { name: 'LOCATION', x: 220, y: 290, color: '#ffbd59' },
    { name: 'EVENT', x: 120, y: 270, color: '#ff5e7d' }
  ];

  svg.innerHTML = '';
  const connections = [[0,1],[1,3],[1,2],[2,5],[3,4],[4,5],[5,6],[6,7],[7,8],[8,0],[2,7],[1,8],[3,7],[4,8]];

  connections.forEach(([a, b], index) => {
    const from = nodes[a];
    const to = nodes[b];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);
    line.setAttribute('stroke', index % 3 === 0 ? '#64ffb4' : index % 3 === 1 ? '#5dc9ff' : '#ffbd59');
    line.setAttribute('stroke-width', '1.3');
    line.setAttribute('opacity', '0.8');
    line.setAttribute('filter', 'url(#glowBlue)');
    svg.appendChild(line);
  });

  nodes.forEach((node, index) => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', node.x);
    circle.setAttribute('cy', node.y);
    circle.setAttribute('r', index % 2 === 0 ? '20' : '17');
    circle.setAttribute('fill', node.color + '22');
    circle.setAttribute('stroke', node.color);
    circle.setAttribute('stroke-width', '1.4');
    circle.setAttribute('filter', 'url(#glowBlue)');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', node.x);
    label.setAttribute('y', node.y + 4);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#eaf9ff');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-weight', '700');
    label.setAttribute('letter-spacing', '1.6');
    label.textContent = node.name;

    group.appendChild(circle);
    group.appendChild(label);
    svg.appendChild(group);
  });
}

function drawActivityChart() {
  const canvas = document.getElementById('activityChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const pad = { top: 18, right: 18, bottom: 28, left: 28 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  const xStep = graphWidth / 7;
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  ctx.strokeStyle = 'rgba(120, 146, 165, 0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (graphHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  const contact = [18, 34, 29, 52, 48, 63, 56];
  const block = [10, 18, 15, 26, 20, 32, 28];

  function plot(points, color, lineWidth) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = pad.left + xStep * index + xStep / 2;
      const y = pad.top + graphHeight - (point / 80) * (graphHeight - 18);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;

    points.forEach((point, index) => {
      const x = pad.left + xStep * index + xStep / 2;
      const y = pad.top + graphHeight - (point / 80) * (graphHeight - 18);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 3.3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  plot(contact, '#5dc9ff', 2.4);
  plot(block, '#ff5e7d', 2.2);

  ctx.fillStyle = '#86a4b2';
  ctx.font = '11px sans-serif';
  labels.forEach((label, index) => {
    const x = pad.left + xStep * index + xStep / 2;
    ctx.fillText(label, x - 10, height - 8);
  });
}

function setDashboardInteractions() {
  const scoreEls = document.querySelectorAll('.signal-score');
  if (scoreEls.length) {
    let pulse = 0;
    const values = [82, 74, 68, 86, 79, 71, 76];
    setInterval(() => {
      scoreEls.forEach((el, index) => {
        const base = values[(index + pulse) % values.length];
        const offset = Math.floor(Math.random() * 7) - 2;
        const value = Math.min(98, Math.max(52, base + offset));
        el.textContent = `${value}%`;
        const meter = el.closest('.signal-card')?.querySelector('.signal-meter span');
        if (meter) meter.style.width = `${value}%`;
      });
      pulse += 1;
    }, 2200);
  }
}

initDashboard();
drawActivityChart();
setDashboardInteractions();
window.addEventListener('resize', drawActivityChart);

if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      .then(({ user }) => {
        setSession(user);
        showToast('Authentication successful. Redirecting...');
        setTimeout(() => location.href = 'dashboard.html', 700);
      })
      .catch((error) => showToast(error.message));
  });
}

const session = localStorage.getItem('cyberstalkSession');
if ((location.pathname.endsWith('dashboard.html') || location.pathname.endsWith('report.html')) && !session) location.href = 'login.html';
if (location.pathname.endsWith('login.html') && session) location.href = 'dashboard.html';
if (document.querySelector('.dashboard-grid')) loadDashboardData().catch(() => showToast('Dashboard data unavailable.'));

if (document.getElementById('launchPlatformBtn')) {
  const launchBtn = document.getElementById('launchPlatformBtn');
  launchBtn.addEventListener('click', function () {
    const hasSession = !!localStorage.getItem('cyberstalkSession');
    launchBtn.textContent = hasSession ? 'Open dashboard' : 'Secure Access';
    location.href = hasSession ? 'dashboard.html' : 'login.html';
  });
}

if (document.getElementById('dashboardReportBtn')) {
  document.getElementById('dashboardReportBtn').addEventListener('click', function () {
    location.href = 'report.html';
  });
}

if (document.getElementById('generatePdfBtn')) {
  document.getElementById('generatePdfBtn').addEventListener('click', function () {
    const payload = {
      title: document.getElementById('reportTitle')?.value || 'Behaviour escalation summary',
      type: document.getElementById('reportType')?.value,
      summary: document.getElementById('reportSummary')?.value
    };
    apiRequest('/api/reports', { method: 'POST', body: JSON.stringify(payload) })
      .then(({ report }) => showToast(`${report.title} saved to the report vault.`))
      .catch((error) => showToast(error.message));
  });
}

if (document.getElementById('logoutBtn')) {
  document.getElementById('logoutBtn').addEventListener('click', function () {
    apiRequest('/api/auth/logout', { method: 'POST' }).finally(() => {
      setSession(null);
      location.href = 'login.html';
    });
  });
}

function bindUtilityButtons() {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const label = (button.textContent || '').replace(/\d+/, '').trim();
      document.querySelectorAll('.nav-btn').forEach((item) => item.classList.toggle('active', item === button));

      if (label === 'Command Center' || label === 'CYBERSTALK') {
        location.href = 'dashboard.html';
        return;
      }

      if (label === 'Reports') {
        location.href = 'report.html';
        return;
      }

      showToast(`${label || 'View'} selected.`);
    });
  });

  document.querySelectorAll('button').forEach((button) => {
    if (button.id === 'logoutBtn' || button.id === 'dashboardReportBtn' || button.id === 'generatePdfBtn' || button.id === 'exportJsonBtn' || button.id === 'launchPlatformBtn' || button.id === 'loginForm' || button.type === 'submit') {
      return;
    }

    const text = (button.textContent || '').trim();
    if (!text) return;

    const actionMap = {
      'Run simulation': () => location.href = 'report.html',
      'Generate report': () => location.href = 'report.html',
      'Generate Security Report': () => location.href = 'report.html',
      'Add Evidence': () => showToast('Evidence panel opened.'),
      'Investigate': () => showToast('Investigation panel opened.'),
      'View': () => showToast('Alert details opened.'),
      'Review': () => showToast('Review queued for analyst.'),
      'Reset': () => showToast('Timeline reset.'),
      'Zoom': () => showToast('Zoom level adjusted.'),
      'Save draft': () => showToast('Draft saved.'),
      'Demo access': () => location.href = 'index.html',
      'Sign in': () => showToast('Signing in...')
    };

    if (!button.dataset.bound) {
      button.addEventListener('click', () => {
        const handler = actionMap[text];
        if (handler) {
          handler();
          return;
        }
        showToast(`${text} selected.`);
      });
      button.dataset.bound = 'true';
    }
  });
}

bindUtilityButtons();
