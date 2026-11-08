import {
  calculateCgpaMetrics,
  CGPA_GRADE_POINTS,
  CGPA_GRADES,
} from '../../../lib/cgpa-calculations.js';

export type Grade = 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D+' | 'D' | 'F';
export type Course = { id: string; name: string; creditHours: number | ''; gradeEarned: Grade };
export type Semester = { id: string; name: string; courses: Course[] };
export type Plan = {
  semesters: Semester[];
  scenarioCourses: Course[];
  target: { targetCgpa: number | ''; graduationCredits: number | ''; remainingSemesters: number | '' };
};

export const GRADES: Grade[] = [...CGPA_GRADES];
export const POINTS: Record<Grade, number> = { ...CGPA_GRADE_POINTS };

export function calculate(plan: Plan) {
  const metrics = calculateCgpaMetrics(plan);
  const { requiredFutureGpa, remainingCreditsToGraduation, remainingCreditsAfterScenario } = metrics;
  const status = !metrics.graduationCreditsValid
      ? { label: 'Degree credits needed', tone: 'warning' as const }
      : remainingCreditsToGraduation < 0
        ? { label: 'Check degree credits', tone: 'warning' as const }
        : metrics.scenarioExceedsRemainingCredits
          ? { label: 'Scenario exceeds remaining credits', tone: 'warning' as const }
          : !metrics.targetValid || requiredFutureGpa === null
            ? { label: 'Target needed', tone: 'warning' as const }
            : requiredFutureGpa > 4
              ? { label: 'Out of reach', tone: 'danger' as const }
              : requiredFutureGpa < 2
                ? { label: 'Easily achievable', tone: 'success' as const }
                : remainingCreditsAfterScenario === 0
                  ? { label: 'Goal met at graduation', tone: 'success' as const }
                  : requiredFutureGpa >= 3.7
                    ? { label: 'Needs a strong finish', tone: 'warning' as const }
                    : { label: 'Within reach', tone: 'success' as const };

  return {
    credits: metrics.totalCreditsEarned,
    quality: metrics.totalQualityPoints,
    scenarioCredits: metrics.scenarioCredits,
    scenarioQuality: metrics.scenarioQualityPoints,
    current: metrics.currentCumulativeGpa,
    projected: metrics.predictedCgpa,
    remaining: metrics.remainingCreditsAfterScenario,
    scenarioExceedsRemainingCredits: metrics.scenarioExceedsRemainingCredits,
    scenarioCreditOverage: metrics.scenarioCreditOverage,
    needed: requiredFutureGpa,
    status,
  };
}
