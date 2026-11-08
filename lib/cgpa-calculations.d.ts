export type Grade = 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D+' | 'D' | 'F';

export type CgpaCourse = {
  creditHours: number | '';
  gradeEarned: Grade;
};

export type CgpaPlan = {
  semesters: Array<{ courses: CgpaCourse[] }>;
  scenarioCourses: CgpaCourse[];
  target: {
    targetCgpa: number | '';
    graduationCredits: number | '';
    remainingSemesters: number | '';
  };
};

export type CgpaMetrics = {
  totalCreditsEarned: number;
  totalQualityPoints: number;
  currentCumulativeGpa: number | null;
  scenarioCredits: number;
  scenarioQualityPoints: number;
  projectedCredits: number;
  projectedQualityPoints: number;
  predictedCgpa: number | null;
  goal: number;
  graduationCredits: number;
  remainingSemesters: number;
  targetTotalQualityPoints: number;
  remainingCreditsToGraduation: number;
  remainingCreditsAfterScenario: number;
  averageCreditsPerRemainingSemester: number | null;
  requiredFutureGpa: number | null;
  targetValid: boolean;
  graduationCreditsValid: boolean;
};

export const CGPA_GRADES: readonly Grade[];
export const CGPA_GRADE_POINTS: Readonly<Record<Grade, number>>;
export function calculateCgpaMetrics(plan: CgpaPlan): CgpaMetrics;
