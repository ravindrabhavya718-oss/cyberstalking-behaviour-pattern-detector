(function () {
  const STORAGE_KEY = 'cyberstalkOfflineData';
  const SAMPLE_INPUTS = {
    subject: 'Sample profile', messagesPerHour: 64, contactAttempts: 22, distinctAccounts: 3,
    postBlockContacts: 5, suspiciousLinks: 1, profileVisits: 11, escalationRate: 62,
    observationDays: 7, analystNotes: 'Synthetic sample data for demonstrating explainable behavioural analysis.'
  };

  function id(prefix) {
    const value = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);
    return `${prefix}-${value.slice(0, 8).toUpperCase()}`;
  }

  function read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { users: [], states: {}, reports: [] }; }
    catch { return { users: [], states: {}, reports: [] }; }
  }

  function write(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

  function analyze(inputs) {
    const values = {
      subject: String(inputs.subject || '').trim(), analystNotes: String(inputs.analystNotes || '').trim(),
      messagesPerHour: Number(inputs.messagesPerHour), contactAttempts: Number(inputs.contactAttempts),
      distinctAccounts: Number(inputs.distinctAccounts), postBlockContacts: Number(inputs.postBlockContacts),
      suspiciousLinks: Number(inputs.suspiciousLinks), profileVisits: Number(inputs.profileVisits),
      escalationRate: Number(inputs.escalationRate), observationDays: Number(inputs.observationDays)
    };
    if (!values.subject || values.subject.length > 100) throw new Error('Subject/profile is required and must be under 100 characters.');
    if (values.analystNotes.length > 2000) throw new Error('Analyst notes must be under 2,000 characters.');
    const limits = { messagesPerHour: [0, 300], contactAttempts: [0, 500], distinctAccounts: [1, 30], postBlockContacts: [0, 500], suspiciousLinks: [0, 100], profileVisits: [0, 1000], escalationRate: [0, 100], observationDays: [1, 90] };
    Object.entries(limits).forEach(([key, [min, max]]) => {
      if (!Number.isFinite(values[key]) || values[key] < min || values[key] > max) throw new Error(`${key} must be a number from ${min} to ${max}.`);
    });
    if (values.postBlockContacts > values.contactAttempts) throw new Error('Post-block contacts cannot exceed total contact attempts.');
    const definitions = [
      ['messageFrequency', 'Message frequency', Math.min(100, values.messagesPerHour / 1.2), .16, `${values.messagesPerHour} messages per hour`],
      ['repeatedContact', 'Repeated contact attempts', Math.min(100, values.contactAttempts * 2), .20, `${values.contactAttempts} contact attempts in ${values.observationDays} days`],
      ['accountSwitching', 'Account switching', Math.min(100, Math.max(0, values.distinctAccounts - 1) * 20), .12, `${values.distinctAccounts} distinct accounts observed`],
      ['blockEvasion', 'Post-block contact', values.contactAttempts ? Math.min(100, values.postBlockContacts / values.contactAttempts * 100) : 0, .20, `${values.postBlockContacts} contacts after a block event`],
      ['suspiciousLinks', 'Suspicious link activity', Math.min(100, values.suspiciousLinks * 25), .10, `${values.suspiciousLinks} suspicious links reported`],
      ['profileVisits', 'Repeated profile visits', Math.min(100, values.profileVisits * 4), .07, `${values.profileVisits} profile visits observed`],
      ['escalation', 'Escalation rate', values.escalationRate, .15, `${values.escalationRate}% increase in activity intensity`]
    ];
    const indicators = definitions.map(([key, label, rawValue, weight, reason]) => {
      const value = Math.round(rawValue);
      return { key, label, value, weight, reason, contribution: Math.round(value * weight) };
    });
    const score = Math.max(0, Math.min(100, Math.round(indicators.reduce((sum, item) => sum + item.value * item.weight, 0))));
    const severity = score >= 70 ? 'Critical' : score >= 40 ? 'High' : score >= 20 ? 'Medium' : 'Low';
    const patterns = indicators.filter((item) => item.value >= (item.key === 'suspiciousLinks' ? 25 : 45)).map((item) => item.label);
    const contributingFactors = [...indicators].sort((a, b) => b.contribution - a.contribution).filter((item) => item.contribution > 0).slice(0, 5);
    return {
      id: id('AN'), timestamp: new Date().toISOString(), subject: values.subject, inputs: values, score, severity,
      confidence: Math.min(96, 60 + indicators.filter((item) => item.value > 0).length * 4 + (values.observationDays >= 7 ? 4 : 0) + (values.analystNotes ? 4 : 0)),
      indicators, patterns, contributingFactors,
      recommendations: ['Preserve original messages, timestamps, URLs, and platform notification records.', 'Use platform blocking and account privacy controls; avoid engaging with unwanted contact.', 'Have a trained human reviewer validate the event sequence and source evidence.'],
      summary: patterns.length ? `${patterns.join(', ')} ${patterns.length === 1 ? 'is' : 'are'} present in the supplied observations. Score ${score}/100 is ${severity.toLowerCase()}; this is a triage signal, not a finding of intent.` : `No indicator crossed the review threshold. Score ${score}/100 is ${severity.toLowerCase()}; continue evidence-led monitoring.`
    };
  }

  function alertFor(analysis, factor) {
    return { id: id('AL'), analysisId: analysis.id, severity: factor.value >= 80 ? 'Critical' : factor.value >= 60 ? 'High' : 'Medium', timestamp: analysis.timestamp, category: factor.label, description: `${factor.reason}. Indicator score ${factor.value}/100.`, status: 'new' };
  }

  function initialState() {
    const analysis = analyze(SAMPLE_INPUTS);
    return {
      case: { id: 'CS-OFFLINE', subject: SAMPLE_INPUTS.subject, status: 'Open', createdAt: new Date().toISOString(), notes: [] },
      analysis, events: [{ id: id('EV'), timestamp: analysis.timestamp, title: 'Synthetic sample loaded', category: 'Observation', severity: analysis.severity, description: 'Offline workspace sample data is ready for review.', status: 'observed' }],
      alerts: analysis.contributingFactors.map((factor) => alertFor(analysis, factor)),
      evidence: [{ id: id('EVD'), title: 'Sample contact sequence', type: 'event sequence', source: 'Synthetic dataset', description: 'Three events arranged to demonstrate repeat-contact review.', timestamp: analysis.timestamp, status: 'For review' }], analysisCount: 1
    };
  }

  function stateFor(data, user) { data.states[user.id] ||= initialState(); return data.states[user.id]; }
  function payload(state) {
    return { ...state, stats: { totalEvents: state.events.length, suspiciousEvents: state.events.filter((event) => ['Medium', 'High', 'Critical'].includes(event.severity)).length, highRiskEvents: state.alerts.filter((alert) => ['High', 'Critical'].includes(alert.severity) && alert.status !== 'resolved').length, clusterCount: state.analysis.patterns.length, activeCases: state.case.status === 'Closed' ? 0 : 1, confidenceLevel: state.analysis.confidence, threatRisk: state.analysis.score } };
  }
  function body(options) { try { return options.body ? JSON.parse(options.body) : {}; } catch { return {}; } }
  function session() { try { return JSON.parse(localStorage.getItem('cyberstalkOfflineSession')) || null; } catch { return null; } }
  function setSession(user) { if (user) localStorage.setItem('cyberstalkOfflineSession', JSON.stringify(user)); else localStorage.removeItem('cyberstalkOfflineSession'); }

  window.cyberstalkOffline = async function (route, options = {}) {
    const data = read(); const requestBody = body(options); const method = options.method || 'GET';
    if (route === '/api/auth/session') return { user: session() };
    if (route === '/api/auth/logout') { setSession(null); return { ok: true }; }
    if (route === '/api/auth/demo' && method === 'POST') {
      const user = { id: 'offline-demo', email: 'demo@cyberstalk.local' }; data.users = data.users.filter((item) => item.id !== user.id); data.users.push(user); stateFor(data, user); write(data); setSession(user); return { user };
    }
    if (route === '/api/auth/login' && method === 'POST') {
      const email = String(requestBody.email || '').trim().toLowerCase(); const password = String(requestBody.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) throw new Error('Enter a valid email and a password with at least 8 characters.');
      let user = data.users.find((item) => item.email === email);
      if (user && user.password !== password) throw new Error('Incorrect email or password.');
      if (!user) { user = { id: id('USER'), email, password }; data.users.push(user); }
      stateFor(data, user); write(data); setSession({ id: user.id, email: user.email }); return { user: { id: user.id, email: user.email } };
    }
    const user = session(); if (!user) throw new Error('Authentication required.');
    const state = stateFor(data, user);
    if (route === '/api/sample') return { inputs: SAMPLE_INPUTS };
    if (route === '/api/dashboard') { write(data); return payload(state); }
    if (route === '/api/analyze' && method === 'POST') { state.analysis = analyze(requestBody.inputs); state.case.subject = state.analysis.subject; state.analysisCount += 1; state.alerts = state.analysis.contributingFactors.map((factor) => alertFor(state.analysis, factor)); write(data); return payload(state); }
    const alertMatch = route.match(/^\/api\/alerts\/([^/]+)\/(review|resolve)$/);
    if (alertMatch && method === 'POST') { const alert = state.alerts.find((item) => item.id === alertMatch[1]); if (!alert) throw new Error('Alert not found.'); alert.status = alertMatch[2] === 'review' ? 'reviewed' : 'resolved'; write(data); return { alert, state: payload(state) }; }
    if (route === '/api/evidence' && method === 'POST') { const value = requestBody; const evidence = { id: id('EVD'), title: String(value.title || '').trim(), type: String(value.type || 'Other'), source: String(value.source || '').trim(), description: String(value.description || '').trim(), timestamp: new Date().toISOString(), status: 'For review' }; if (!evidence.title || !evidence.source || !evidence.description) throw new Error('Evidence title, source, and description are required.'); state.evidence.unshift(evidence); write(data); return { evidence, state: payload(state) }; }
    if (route === '/api/case/notes' && method === 'POST') { const note = String(requestBody.note || '').trim(); if (!note) throw new Error('Enter a case note up to 2,000 characters.'); state.case.notes.unshift({ id: id('NOTE'), note, timestamp: new Date().toISOString() }); write(data); return { case: state.case }; }
    if (route === '/api/case' && method === 'PATCH') { if (!['Open', 'Monitoring', 'Closed'].includes(requestBody.status)) throw new Error('Choose Open, Monitoring, or Closed.'); state.case.status = requestBody.status; write(data); return { case: state.case, state: payload(state) }; }
    if (route === '/api/reports' && method === 'GET') return { reports: data.reports.filter((report) => report.userId === user.id) };
    const reportMatch = route.match(/^\/api\/reports\/([^/]+)$/);
    if (reportMatch && method === 'GET') { const report = data.reports.find((item) => item.id === reportMatch[1] && item.userId === user.id); if (!report) throw new Error('Report not found.'); return { report }; }
    if (route === '/api/reports' && method === 'POST') { const report = { id: id('R'), userId: user.id, title: String(requestBody.title || '').trim(), type: String(requestBody.type || 'Behaviour risk review'), status: requestBody.status === 'draft' ? 'draft' : 'ready', summary: String(requestBody.summary || state.analysis.summary).trim(), createdAt: new Date().toISOString(), snapshot: { case: state.case, analysis: state.analysis, events: state.events, alerts: state.alerts, evidence: state.evidence, analystNotes: state.analysis.inputs.analystNotes } }; if (!report.title) throw new Error('Enter a report title under 120 characters.'); data.reports.unshift(report); write(data); return { report }; }
    throw new Error('Offline route is unavailable.');
  };
}());
