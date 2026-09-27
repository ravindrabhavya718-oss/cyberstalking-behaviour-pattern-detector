const test = require('node:test');
const assert = require('node:assert/strict');
const { SAMPLE_INPUTS, analyzeObservations, validateInputs } = require('./analysis');

test('analysis is deterministic for identical observations', () => {
  const first = analyzeObservations(SAMPLE_INPUTS, '2026-09-27T12:00:00.000Z');
  const second = analyzeObservations(SAMPLE_INPUTS, '2026-09-27T12:00:00.000Z');
  assert.equal(first.score, second.score);
  assert.equal(first.severity, second.severity);
  assert.deepEqual(first.indicators, second.indicators);
  assert.ok(first.patterns.length > 0);
});

test('lower observations produce a lower risk score', () => {
  const low = analyzeObservations({
    ...SAMPLE_INPUTS,
    messagesPerHour: 2,
    contactAttempts: 1,
    distinctAccounts: 1,
    postBlockContacts: 0,
    suspiciousLinks: 0,
    profileVisits: 1,
    escalationRate: 0
  });
  const high = analyzeObservations({
    ...SAMPLE_INPUTS,
    messagesPerHour: 180,
    contactAttempts: 40,
    distinctAccounts: 6,
    postBlockContacts: 20,
    suspiciousLinks: 4,
    profileVisits: 25,
    escalationRate: 90
  });
  assert.ok(low.score < high.score);
  assert.ok(low.confidence < high.confidence);
  assert.equal(high.severity, 'Critical');
});

test('invalid ranges and impossible counts are rejected', () => {
  assert.throws(() => validateInputs({ ...SAMPLE_INPUTS, messagesPerHour: 301 }), /messagesPerHour/);
  assert.throws(() => validateInputs({ ...SAMPLE_INPUTS, postBlockContacts: 23 }), /cannot exceed/);
});