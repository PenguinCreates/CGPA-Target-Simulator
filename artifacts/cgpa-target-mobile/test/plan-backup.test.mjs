import assert from 'node:assert/strict';
import test from 'node:test';
import { getBackupPreviewCounts, MAX_BACKUP_SIZE, parsePlanBackup } from '../lib/plan-backup.ts';

function validBackup() {
  return {
    semesters: [{
      id: 'semester-1',
      name: 'Semester 1',
      courses: [
        { id: 'course-1', name: 'Biology', creditHours: 3, gradeEarned: 'A' },
        { id: 'course-2', name: 'Writing', creditHours: 2, gradeEarned: 'B+' },
      ],
    }],
    scenarioCourses: [{ id: 'planned-1', name: 'Statistics', creditHours: 3, gradeEarned: 'B' }],
    target: { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 },
  };
}

function rawBackup(value) {
  return JSON.stringify(value);
}

test('valid exports parse and report semester and course preview counts', () => {
  const plan = parsePlanBackup(rawBackup(validBackup()));
  assert.deepEqual(getBackupPreviewCounts(plan), {
    semesters: 1,
    completedCourses: 2,
    plannedCourses: 1,
  });
  assert.deepEqual(plan.target, { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 });
});

test('malformed JSON and missing plan sections are rejected', () => {
  assert.throws(() => parsePlanBackup('{'), /valid JSON/);
  assert.throws(() => parsePlanBackup('{"semesters":[]}'), /required plan sections/);
});

test('unsupported grades are rejected', () => {
  const backup = validBackup();
  backup.semesters[0].courses[0].gradeEarned = 'A+';
  assert.throws(() => parsePlanBackup(rawBackup(backup)), /unsupported grade/);
});

test('negative, non-finite, and out-of-range numbers are rejected', () => {
  for (const [field, value] of [
    ['creditHours', -1],
    ['creditHours', 1001],
    ['targetCgpa', 4.1],
    ['graduationCredits', 1001],
    ['remainingSemesters', 21],
  ]) {
    const backup = validBackup();
    if (field === 'creditHours') backup.semesters[0].courses[0][field] = value;
    else backup.target[field] = value;
    assert.throws(() => parsePlanBackup(rawBackup(backup)), /must be between/);
  }

  const infiniteTarget = rawBackup(validBackup()).replace('"targetCgpa":3.6', '"targetCgpa":1e999');
  assert.throws(() => parsePlanBackup(infiniteTarget), /must be between/);
});

test('duplicate IDs across semesters and courses are rejected', () => {
  const backup = validBackup();
  backup.scenarioCourses[0].id = 'course-1';
  assert.throws(() => parsePlanBackup(rawBackup(backup)), /duplicate ID/);
});

test('backups larger than one megabyte are rejected by UTF-8 byte size', () => {
  const padded = `${'é'.repeat(Math.ceil((MAX_BACKUP_SIZE + 1) / 2))}`;
  const raw = JSON.stringify({ ...validBackup(), note: padded });
  assert.ok(raw.length < MAX_BACKUP_SIZE);
  assert.throws(() => parsePlanBackup(raw), /too large/);
});

test('more than 2,000 courses across the entire backup are rejected', () => {
  const backup = validBackup();
  backup.semesters = Array.from({ length: 2 }, (_, semesterIndex) => ({
    id: `semester-${semesterIndex}`,
    name: `Semester ${semesterIndex}`,
    courses: Array.from({ length: 1000 }, (_, courseIndex) => ({
      id: `course-${semesterIndex}-${courseIndex}`,
      name: 'Course',
      creditHours: 1,
      gradeEarned: 'A',
    })),
  }));
  backup.scenarioCourses = [{
    id: 'planned-too-many',
    name: 'Extra',
    creditHours: 1,
    gradeEarned: 'A',
  }];
  assert.throws(() => parsePlanBackup(rawBackup(backup)), /too many courses/);
});
