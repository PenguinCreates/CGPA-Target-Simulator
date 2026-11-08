import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, POINTS } from '../lib/cgpa-calculations.ts';

function course(id, creditHours, gradeEarned) {
  return { id, name: id, creditHours, gradeEarned };
}

function plan({ completed = [], scenarios = [], targetCgpa = 3.6, graduationCredits = 120 } = {}) {
  return {
    semesters: [{ id: 'term-1', name: 'Semester 1', courses: completed }],
    scenarioCourses: scenarios,
    target: { targetCgpa, graduationCredits, remainingSemesters: 4 },
  };
}

test('grade points and credit-weighted current GPA use the expected arithmetic', () => {
  assert.deepEqual(POINTS, { A: 4, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, 'D+': 1.5, D: 1, F: 0 });

  const result = calculate(plan({
    completed: [course('three-credit-A', 3, 'A'), course('one-credit-F', 1, 'F')],
  }));
  assert.equal(result.credits, 4);
  assert.equal(result.quality, 12);
  assert.equal(result.current, 3);
});

test('zero-credit courses do not create a current or projected GPA', () => {
  const result = calculate(plan({ completed: [course('zero-credit', 0, 'A')] }));
  assert.equal(result.credits, 0);
  assert.equal(result.quality, 0);
  assert.equal(result.current, null);
  assert.equal(result.projected, null);
  assert.equal(result.needed, 3.6);
});

test('zero degree credits have no GPA requirement when no credits are earned', () => {
  const result = calculate(plan({ targetCgpa: 4, graduationCredits: 0 }));
  assert.equal(result.remaining, 0);
  assert.equal(result.needed, 0);
});

test('remaining GPA is weighted across completed and unearned degree credits', () => {
  const result = calculate(plan({
    completed: [course('completed', 30, 'B')],
    targetCgpa: 3.5,
  }));
  assert.equal(result.remaining, 90);
  assert.equal(result.needed, 3.6666666666666665);
});

test('a perfect 4.0 target is exactly achievable with straight A grades', () => {
  const result = calculate(plan({
    completed: [course('completed', 60, 'A')],
    targetCgpa: 4,
  }));
  assert.equal(result.remaining, 60);
  assert.equal(result.needed, 4);
  assert.notEqual(result.status.label, 'Out of reach');
});

test('a required GPA above 4.0 is out of reach', () => {
  const result = calculate(plan({
    completed: [course('completed', 60, 'B')],
    targetCgpa: 4,
  }));
  assert.equal(result.needed, 5);
  assert.deepEqual(result.status, { label: 'Out of reach', tone: 'danger' });
});

test('at zero remaining credits, meeting the target needs no additional GPA', () => {
  const result = calculate(plan({
    completed: [course('completed', 120, 'A')],
    targetCgpa: 4,
  }));
  assert.equal(result.remaining, 0);
  assert.equal(result.needed, 0);
});

test('at zero remaining credits, a missed target is represented as impossible', () => {
  const result = calculate(plan({
    completed: [course('completed', 120, 'B')],
    targetCgpa: 4,
  }));
  assert.equal(result.remaining, 0);
  assert.equal(result.needed, Infinity);
  assert.deepEqual(result.status, { label: 'Out of reach', tone: 'danger' });
});

test('scenario courses change projected GPA and reduce remaining credits', () => {
  const result = calculate(plan({
    completed: [course('completed', 30, 'B')],
    scenarios: [course('planned', 30, 'A')],
    targetCgpa: 3.6,
  }));
  assert.equal(result.scenarioCredits, 30);
  assert.equal(result.scenarioQuality, 120);
  assert.equal(result.projected, 3.5);
  assert.equal(result.remaining, 60);
  assert.equal(result.needed, 3.7);
});
