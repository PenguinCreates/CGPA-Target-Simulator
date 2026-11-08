import assert from 'node:assert/strict';
import { test } from 'node:test';

await import('fake-indexeddb/auto');

globalThis.localStorage = (() => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
})();

const { derive, parseImportedState, statusFor, summarizeSemester } = await import('../src/simulator.js');
const storage = await import('../src/storage.js');
const { calculate: calculateMobile } = await import('../../cgpa-target-mobile/lib/cgpa-calculations.ts');

function sharedPlan({
  completed = [],
  scenarios = [],
  targetCgpa = 3.6,
  graduationCredits = 120,
  remainingSemesters = 4,
} = {}) {
  const semesters = [{ id: 'term-1', name: 'Semester 1', courses: completed }];
  const scenarioCourses = scenarios;
  return {
    semesters,
    scenarioCourses,
    target: { targetCgpa, graduationCredits, remainingSemesters },
  };
}

function assertProductsMatch(plan) {
  const simulator = derive(plan);
  const mobile = calculateMobile(plan);
  assert.deepEqual({
    credits: mobile.credits,
    quality: mobile.quality,
    scenarioCredits: mobile.scenarioCredits,
    scenarioQuality: mobile.scenarioQuality,
    current: mobile.current,
    projected: mobile.projected,
    remaining: mobile.remaining,
    scenarioExceedsRemainingCredits: mobile.scenarioExceedsRemainingCredits,
    scenarioCreditOverage: mobile.scenarioCreditOverage,
    needed: mobile.needed,
  }, {
    credits: simulator.totalCreditsEarned,
    quality: simulator.totalQualityPoints,
    scenarioCredits: simulator.scenarioCredits,
    scenarioQuality: simulator.scenarioQualityPoints,
    current: simulator.currentCumulativeGpa,
    projected: simulator.predictedCgpa,
    remaining: simulator.remainingCreditsAfterScenario,
    scenarioExceedsRemainingCredits: simulator.scenarioExceedsRemainingCredits,
    scenarioCreditOverage: simulator.scenarioCreditOverage,
    needed: simulator.requiredFutureGpa,
  });
}

test('calculates weighted CGPA and future GPA from course credits', () => {
  const state = {
    semesters: [{ id: 's1', name: 'Semester 1', courses: [
      { id: 'a', name: 'A course', creditHours: 3, gradeEarned: 'A' },
      { id: 'f', name: 'F course', creditHours: 1, gradeEarned: 'F' },
    ] }],
    scenarioCourses: [{ id: 'b+', name: 'Scenario', creditHours: 2, gradeEarned: 'B+' }],
    target: { targetCgpa: 3, graduationCredits: 8, remainingSemesters: 1 },
  };
  const metrics = derive(state);
  assert.equal(metrics.totalCreditsEarned, 4);
  assert.equal(metrics.totalQualityPoints, 12);
  assert.equal(metrics.currentCumulativeGpa, 3);
  assert.equal(metrics.predictedCgpa, 19 / 6);
  assert.equal(metrics.remainingCreditsAfterScenario, 2);
  assert.equal(metrics.requiredFutureGpa, 2.5);
});

test('semester credit totals and GPA follow course credit and contents changes', () => {
  const term = {
    id: 'term-1',
    name: 'Semester 1',
    courses: [
      { id: 'a', name: 'A course', creditHours: 3, gradeEarned: 'A' },
      { id: 'b', name: 'B course', creditHours: 2, gradeEarned: 'B' },
    ],
  };

  assert.deepEqual(summarizeSemester(term), {
    credits: 5,
    gpa: 3.6,
    label: '5.0 completed credits · 3.60 GPA',
  });

  term.courses[0].creditHours = 4;
  assert.deepEqual(summarizeSemester(term), {
    credits: 6,
    gpa: 11 / 3,
    label: '6.0 completed credits · 3.67 GPA',
  });

  term.courses.pop();
  assert.deepEqual(summarizeSemester(term), {
    credits: 4,
    gpa: 4,
    label: '4.0 completed credits · 4.00 GPA',
  });
});

test('flags targets that require more than a 4.0 average', () => {
  const metrics = derive({
    semesters: [{ id: 's1', name: 'Semester 1', courses: [
      { id: 'a', name: 'A course', creditHours: 3, gradeEarned: 'A' },
      { id: 'b', name: 'B course', creditHours: 1, gradeEarned: 'B' },
    ] }],
    scenarioCourses: [],
    target: { targetCgpa: 4, graduationCredits: 8, remainingSemesters: 1 },
  });
  assert.equal(metrics.requiredFutureGpa, 4.25);
  assert.equal(statusFor(metrics).kind, 'unreachable');
});

test('imports an exported plan and normalizes it for the tracker', () => {
  const exported = sharedPlan({
    completed: [{ id: 'course-a', name: 'Calculus', creditHours: 3, gradeEarned: 'A' }],
    scenarios: [{ id: 'future-a', name: 'Physics', creditHours: 4, gradeEarned: 'B+' }],
    targetCgpa: 3.4,
    graduationCredits: 124,
    remainingSemesters: 5,
  });
  assert.deepEqual(parseImportedState(JSON.parse(JSON.stringify(exported))), exported);
});

test('rejects malformed or oversized plan exports instead of replacing saved work', () => {
  assert.throws(() => parseImportedState({ target: {} }), /valid Studyline plan export/);
  assert.throws(() => parseImportedState({ semesters: Array(101).fill({ courses: [] }), target: {} }), /too many semesters/);
});

test('mobile and simulator use the same credit weighting across every supported grade', () => {
  const grades = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'];
  const completed = grades.map((gradeEarned, index) => ({
    id: `grade-${gradeEarned}`,
    name: gradeEarned,
    creditHours: index + 0.5,
    gradeEarned,
  }));
  const plan = sharedPlan({ completed, targetCgpa: 3.25, graduationCredits: 50 });
  assertProductsMatch(plan);
  assert.equal(derive(plan).totalQualityPoints, completed.reduce(
    (sum, course) => sum + course.creditHours * ({ A: 4, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, 'D+': 1.5, D: 1, F: 0 })[course.gradeEarned],
    0,
  ));
});

test('mobile and simulator agree at degree-credit boundaries and with invalid degree totals', () => {
  const alreadyAtDegree = sharedPlan({
    completed: [{ id: 'at-degree', name: 'Completed', creditHours: 120, gradeEarned: 'A' }],
    targetCgpa: 4,
    graduationCredits: 120,
  });
  assertProductsMatch(alreadyAtDegree);
  assert.equal(derive(alreadyAtDegree).requiredFutureGpa, 0);

  const missedAtDegree = sharedPlan({
    completed: [{ id: 'at-degree-below-target', name: 'Completed', creditHours: 120, gradeEarned: 'B' }],
    targetCgpa: 4,
    graduationCredits: 120,
  });
  assertProductsMatch(missedAtDegree);
  assert.equal(derive(missedAtDegree).requiredFutureGpa, Infinity);

  const zeroDegree = sharedPlan({ targetCgpa: 4, graduationCredits: 0 });
  assertProductsMatch(zeroDegree);
  assert.equal(derive(zeroDegree).requiredFutureGpa, null);
});

test('mobile and simulator leave GPA undefined when all course credits are zero', () => {
  const noCredits = sharedPlan({
    completed: [{ id: 'zero-credit', name: 'Uncredited course', creditHours: 0, gradeEarned: 'A' }],
  });
  assertProductsMatch(noCredits);
  assert.equal(derive(noCredits).currentCumulativeGpa, null);
  assert.equal(derive(noCredits).predictedCgpa, null);
});

test('mobile and simulator agree when scenario courses fill or exceed degree credits', () => {
  const fillsDegree = sharedPlan({
    completed: [{ id: 'completed', name: 'Completed', creditHours: 3, gradeEarned: 'B' }],
    scenarios: [{ id: 'scenario', name: 'Scenario', creditHours: 3, gradeEarned: 'A' }],
    targetCgpa: 3.5,
    graduationCredits: 6,
  });
  assertProductsMatch(fillsDegree);
  assert.equal(derive(fillsDegree).predictedCgpa, 3.5);
  assert.equal(derive(fillsDegree).requiredFutureGpa, 0);

  const exceedsDegree = sharedPlan({
    completed: [{ id: 'completed', name: 'Completed', creditHours: 3, gradeEarned: 'B' }],
    scenarios: [{ id: 'scenario', name: 'Scenario', creditHours: 4, gradeEarned: 'A' }],
    graduationCredits: 6,
  });
  assertProductsMatch(exceedsDegree);
  assert.equal(derive(exceedsDegree).requiredFutureGpa, 0);
  assert.equal(derive(exceedsDegree).scenarioExceedsRemainingCredits, true);
  assert.equal(derive(exceedsDegree).scenarioCreditOverage, 1);
  assert.equal(statusFor(derive(exceedsDegree)).label, 'Scenario exceeds remaining credits');

  exceedsDegree.scenarioCourses[0].creditHours = 3;
  assert.equal(derive(exceedsDegree).scenarioExceedsRemainingCredits, false);
  assert.equal(derive(exceedsDegree).scenarioCreditOverage, 0);
  assert.notEqual(statusFor(derive(exceedsDegree)).label, 'Scenario exceeds remaining credits');
});

test('scenario overage remains visible when the target GPA is missing', () => {
  const plan = sharedPlan({
    completed: [{ id: 'completed', name: 'Completed', creditHours: 3, gradeEarned: 'B' }],
    scenarios: [{ id: 'scenario', name: 'Scenario', creditHours: 4, gradeEarned: 'A' }],
    targetCgpa: '',
    graduationCredits: 6,
  });
  const metrics = derive(plan);
  assert.equal(metrics.scenarioExceedsRemainingCredits, true);
  assert.equal(statusFor(metrics).label, 'Scenario exceeds remaining credits');
  assert.equal(calculateMobile(plan).status.label, 'Scenario exceeds remaining credits');
});

test('migrates the previous localStorage state into IndexedDB', async () => {
  const legacyState = {
    semesters: [],
    scenarioCourses: [],
    target: { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 },
  };
  localStorage.setItem('studyline.cgpa-simulator.v1', JSON.stringify(legacyState));
  const loaded = await storage.readSavedState();
  assert.equal(loaded.source, 'localStorage');
  assert.deepEqual(loaded.value, legacyState);
  assert.equal(await storage.saveAppState(loaded.value), 'indexeddb');
  assert.equal(localStorage.getItem('studyline.cgpa-simulator.v1'), null);
  assert.equal((await storage.readSavedState()).source, 'indexeddb');
});
