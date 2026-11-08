import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../lib/cgpa-calculations.ts';

const course = (id, creditHours, gradeEarned = 'B') => ({ id, name: id, creditHours, gradeEarned });
const plan = (scenarioCredits) => ({
  semesters: [{ id: 'term-1', name: 'Semester 1', courses: [course('done', 3)] }],
  scenarioCourses: [course('planned', scenarioCredits, 'A')],
  target: { targetCgpa: 3.6, graduationCredits: 6, remainingSemesters: 1 },
});

test('planned courses warn when over degree credits and clear after an adjustment', () => {
  const overfilled = calculate(plan(4));
  assert.equal(overfilled.scenarioExceedsRemainingCredits, true);
  assert.equal(overfilled.scenarioCreditOverage, 1);
  assert.equal(overfilled.status.label, 'Scenario exceeds remaining credits');

  const adjusted = calculate(plan(3));
  assert.equal(adjusted.scenarioExceedsRemainingCredits, false);
  assert.equal(adjusted.scenarioCreditOverage, 0);
  assert.notEqual(adjusted.status.label, 'Scenario exceeds remaining credits');
});
