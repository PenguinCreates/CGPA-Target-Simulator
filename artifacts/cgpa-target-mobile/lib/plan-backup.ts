import { GRADES } from './cgpa-calculations.ts';
import type { Course, Grade, Plan, Semester } from './cgpa-calculations.ts';

export const MAX_BACKUP_SIZE = 1024 * 1024;
const MAX_SEMESTERS = 100;
const MAX_COURSES = 2000;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function parsePlanBackup(raw: string): Plan {
  if (utf8ByteLength(raw) > MAX_BACKUP_SIZE) {
    throw new Error('Backup is too large. Choose a JSON file under 1 MB.');
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("This isn't valid JSON. Select or paste a Studyline backup.");
  }

  const fail = (detail: string): never => {
    throw new Error(`This JSON isn't a valid Studyline backup: ${detail}`);
  };
  const isRecord = (item: unknown): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null && !Array.isArray(item);
  if (!isRecord(value) || !Array.isArray(value.semesters) || !Array.isArray(value.scenarioCourses) || !isRecord(value.target)) {
    return fail('required plan sections are missing.');
  }

  const usedIds = new Set<string>();
  const readId = (item: Record<string, unknown>, field: string): string => {
    const id = item[field];
    if (typeof id !== 'string' || !id.trim() || id.length > 120 || usedIds.has(id)) {
      return fail('an item has a missing or duplicate ID.');
    }
    usedIds.add(id);
    return id;
  };
  const readName = (item: Record<string, unknown>, field: string, label: string): string => {
    const name = item[field];
    if (typeof name !== 'string' || name.length > 200) return fail(`${label} names must be text up to 200 characters.`);
    return name;
  };
  const readNumber = (item: Record<string, unknown>, field: string, label: string, max: number): number | '' => {
    const number = item[field];
    if (number === '') return '';
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > max) {
      return fail(`${label} must be between 0 and ${max}.`);
    }
    return number;
  };
  let courseCount = 0;
  const readCourse = (item: unknown): Course => {
    if (!isRecord(item)) return fail('a course entry is invalid.');
    const grade = item.gradeEarned;
    if (typeof grade !== 'string' || !GRADES.includes(grade as Grade)) {
      return fail('a course has an unsupported grade.');
    }
    courseCount += 1;
    if (courseCount > MAX_COURSES) return fail('the backup contains too many courses.');
    return {
      id: readId(item, 'id'),
      name: readName(item, 'name', 'Course'),
      creditHours: readNumber(item, 'creditHours', 'Course credits', 1000),
      gradeEarned: grade as Grade,
    };
  };
  const readCourses = (items: unknown[]): Course[] => items.map(readCourse);
  if (value.semesters.length > MAX_SEMESTERS) return fail('the backup contains too many semesters.');

  const semesters: Semester[] = value.semesters.map((item) => {
    if (!isRecord(item) || !Array.isArray(item.courses)) return fail('a semester entry is invalid.');
    return {
      id: readId(item, 'id'),
      name: readName(item, 'name', 'Semester'),
      courses: readCourses(item.courses),
    };
  });

  const target = value.target;
  const targetCgpa = readNumber(target, 'targetCgpa', 'Target CGPA', 4);
  const graduationCredits = readNumber(target, 'graduationCredits', 'Degree credits', 1000);
  const remainingSemesters = readNumber(target, 'remainingSemesters', 'Semesters left', 20);

  return {
    semesters,
    scenarioCourses: readCourses(value.scenarioCourses),
    target: { targetCgpa, graduationCredits, remainingSemesters },
  };
}

export function getBackupPreviewCounts(plan: Plan) {
  return {
    semesters: plan.semesters.length,
    completedCourses: plan.semesters.reduce((sum, semester) => sum + semester.courses.length, 0),
    plannedCourses: plan.scenarioCourses.length,
  };
}
