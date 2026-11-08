export type Grade = 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D+' | 'D' | 'F';
export type Course = { id: string; name: string; creditHours: number | ''; gradeEarned: Grade };
export type Semester = { id: string; name: string; courses: Course[] };
export type Plan = {
  semesters: Semester[];
  scenarioCourses: Course[];
  target: { targetCgpa: number | ''; graduationCredits: number | ''; remainingSemesters: number | '' };
};

export const GRADES: Grade[] = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'];
export const POINTS: Record<Grade, number> = {
  A: 4,
  'B+': 3.5,
  B: 3,
  'C+': 2.5,
  C: 2,
  'D+': 1.5,
  D: 1,
  F: 0,
};

export function calculate(plan: Plan) {
  const completed = plan.semesters.flatMap((term) => term.courses);
  const credits = completed.reduce((sum, course) => sum + (Number(course.creditHours) || 0), 0);
  const quality = completed.reduce((sum, course) => sum + (Number(course.creditHours) || 0) * POINTS[course.gradeEarned], 0);
  const scenarioCredits = plan.scenarioCourses.reduce((sum, course) => sum + (Number(course.creditHours) || 0), 0);
  const scenarioQuality = plan.scenarioCourses.reduce((sum, course) => sum + (Number(course.creditHours) || 0) * POINTS[course.gradeEarned], 0);
  const target = Number(plan.target.targetCgpa) || 0;
  const graduationCredits = Number(plan.target.graduationCredits) || 0;
  const remaining = graduationCredits - credits - scenarioCredits;
  const needed = remaining > 0
    ? (target * graduationCredits - quality - scenarioQuality) / remaining
    : quality + scenarioQuality >= target * graduationCredits ? 0 : Infinity;
  const current = credits > 0 ? quality / credits : null;
  const projected = credits + scenarioCredits > 0
    ? (quality + scenarioQuality) / (credits + scenarioCredits)
    : null;
  const status = credits > graduationCredits
    ? { label: 'Check degree credits', tone: 'warning' as const }
    : needed > 4
      ? { label: 'Out of reach', tone: 'danger' as const }
      : needed < 2
        ? { label: 'Easily achievable', tone: 'success' as const }
        : needed >= 3.7
          ? { label: 'Needs a strong finish', tone: 'warning' as const }
          : { label: 'Within reach', tone: 'success' as const };
  return { credits, quality, scenarioCredits, scenarioQuality, current, projected, remaining, needed, status };
}
