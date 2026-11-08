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

const { derive, statusFor } = await import('../src/simulator.js');
const storage = await import('../src/storage.js');

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
