const crypto = require('crypto');

const SAMPLE_INPUTS = {
  subject: 'Sample profile',
  messagesPerHour: 64,
  contactAttempts: 22,
  distinctAccounts: 3,
  postBlockContacts: 5,
  suspiciousLinks: 1,
  profileVisits: 11,
  escalationRate: 62,
  observationDays: 7,
  analystNotes: 'Synthetic sample data for demonstrating explainable behavioural analysis.'
};

const INPUT_LIMITS = {
  messagesPerHour: [0, 300],
  contactAttempts: [0, 500],
  distinctAccounts: [1, 30],
  postBlockContacts: [0, 500],
  suspiciousLinks: [0, 100],
  profileVisits: [0, 1000],
  escalationRate: [0, 100],
  observationDays: [1, 90]
};

function validateInputs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provide an observation dataset.');
  const subject = String(value.subject || '').trim();
  const analystNotes = String(value.analystNotes || '').trim();
  if (!subject || subject.length > 100) throw new Error('Subject/profile is required and must be under 100 characters.');
  if (analystNotes.length > 2000) throw new Error('Analyst notes must be under 2,000 characters.');

  const inputs = { subject, analystNotes };
  for (const [key, [minimum, maximum]] of Object.entries(INPUT_LIMITS)) {
    const number = Number(value[key]);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new Error(`${key} must be a number from ${minimum} to ${maximum}.`);
    }
    inputs[key] = number;
  }
  if (inputs.postBlockContacts > inputs.contactAttempts) throw new Error('Post-block contacts cannot exceed total contact attempts.');
  return inputs;
}

function analyzeObservations(value, timestamp = new Date().toISOString()) {
  const inputs = validateInputs(value);
  const indicators = [
    { key: 'messageFrequency', label: 'Message frequency', value: Math.min(100, inputs.messagesPerHour / 1.2), weight: 0.16, reason: `${inputs.messagesPerHour} messages per hour` },
    { key: 'repeatedContact', label: 'Repeated contact attempts', value: Math.min(100, inputs.contactAttempts * 2), weight: 0.20, reason: `${inputs.contactAttempts} contact attempts in ${inputs.observationDays} days` },
    { key: 'accountSwitching', label: 'Account switching', value: Math.min(100, Math.max(0, inputs.distinctAccounts - 1) * 20), weight: 0.12, reason: `${inputs.distinctAccounts} distinct accounts observed` },
    { key: 'blockEvasion', label: 'Post-block contact', value: inputs.contactAttempts ? Math.min(100, inputs.postBlockContacts / inputs.contactAttempts * 100) : 0, weight: 0.20, reason: `${inputs.postBlockContacts} contacts after a block event` },
    { key: 'suspiciousLinks', label: 'Suspicious link activity', value: Math.min(100, inputs.suspiciousLinks * 25), weight: 0.10, reason: `${inputs.suspiciousLinks} suspicious links reported` },
    { key: 'profileVisits', label: 'Repeated profile visits', value: Math.min(100, inputs.profileVisits * 4), weight: 0.07, reason: `${inputs.profileVisits} profile visits observed` },
    { key: 'escalation', label: 'Escalation rate', value: inputs.escalationRate, weight: 0.15, reason: `${inputs.escalationRate}% increase in activity intensity` }
  ].map((indicator) => ({
    ...indicator,
    value: Math.round(indicator.value),
    contribution: Math.round(indicator.value * indicator.weight)
  }));

  const score = Math.max(0, Math.min(100, Math.round(indicators.reduce((sum, item) => sum + item.value * item.weight, 0))));
  const severity = score >= 70 ? 'Critical' : score >= 40 ? 'High' : score >= 20 ? 'Medium' : 'Low';
  const populatedIndicators = indicators.filter((item) => item.value > 0).length;
  const confidence = Math.min(96, 60 + populatedIndicators * 4 + (inputs.observationDays >= 7 ? 4 : 0) + (inputs.analystNotes ? 4 : 0));
  const patterns = indicators.filter((item) => item.value >= (item.key === 'suspiciousLinks' ? 25 : 45)).map((item) => item.label);
  const contributingFactors = [...indicators].sort((a, b) => b.contribution - a.contribution).filter((item) => item.contribution > 0).slice(0, 5);
  const recommendations = [
    'Preserve original messages, timestamps, URLs, and platform notification records.',
    'Use platform blocking and account privacy controls; avoid engaging with unwanted contact.',
    'Have a trained human reviewer validate the event sequence and source evidence.'
  ];
  if (inputs.postBlockContacts > 0) recommendations.unshift('Document each post-block contact and report repeated evasion to the platform.');
  if (inputs.suspiciousLinks > 0) recommendations.unshift('Do not open suspicious links; preserve them as text and report them for safe review.');

  return {
    id: `AN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    timestamp,
    subject: inputs.subject,
    inputs,
    score,
    severity,
    confidence,
    indicators,
    patterns,
    contributingFactors,
    recommendations,
    summary: patterns.length
      ? `${patterns.join(', ')} ${patterns.length === 1 ? 'is' : 'are'} present in the supplied observations. Score ${score}/100 is ${severity.toLowerCase()}; this is a triage signal, not a finding of intent.`
      : `No indicator crossed the review threshold. Score ${score}/100 is ${severity.toLowerCase()}; continue evidence-led monitoring.`
  };
}

function makeAlert(analysis, indicator) {
  const severity = indicator.value >= 80 ? 'Critical' : indicator.value >= 60 ? 'High' : 'Medium';
  return {
    id: `AL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    analysisId: analysis.id,
    severity,
    timestamp: analysis.timestamp,
    category: indicator.label,
    description: `${indicator.reason}. Indicator score ${indicator.value}/100.`,
    status: 'new'
  };
}

function createInitialState() {
  const analysis = analyzeObservations(SAMPLE_INPUTS);
  const now = Date.now();
  const sampleEvents = [
    ['Repeated contact attempt', 'Contact attempts', 48, 'Repeated messages observed in the synthetic sample window.'],
    ['Post-block contact', 'Post-block contact', 75, 'A contact event followed a recorded block action in the synthetic sample.'],
    ['New account observed', 'Account switching', 42, 'A second account was reported during the observation period.'],
    ['Suspicious URL reported', 'Suspicious link activity', 55, 'A URL was flagged for safe, human review; it was not opened.'],
    ['Activity intensity increased', 'Escalation', 62, 'Contact frequency rose during the latter observation period.']
  ].map(([title, category, score, description], index) => ({
    id: `EV-${String(5100 + index)}`,
    timestamp: new Date(now - (index + 1) * 45 * 60 * 1000).toISOString(),
    title,
    category,
    severity: score >= 70 ? 'High' : 'Medium',
    description,
    status: 'observed'
  }));

  return {
    case: { id: 'CS-2048', subject: SAMPLE_INPUTS.subject, status: 'Open', createdAt: new Date(now - 86400000).toISOString(), notes: [] },
    analysis,
    events: sampleEvents,
    alerts: analysis.contributingFactors.map((factor) => makeAlert(analysis, factor)),
    evidence: [
      { id: 'EVD-1001', title: 'Sample contact sequence', type: 'event sequence', source: 'Synthetic dataset', description: 'Three events arranged to demonstrate repeat-contact review.', timestamp: new Date(now - 3600000).toISOString(), status: 'For review' }
    ],
    analysisCount: 1
  };
}

module.exports = { SAMPLE_INPUTS, analyzeObservations, createInitialState, makeAlert, validateInputs };