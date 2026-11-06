export type Grade = 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D+' | 'D' | 'F';

export type Course = {
  id: string;
  name: string;
  creditHours: number | '';
  gradeEarned: Grade;
};

export type Semester = {
  id: string;
  name: string;
  courses: Course[];
};

export type SimulatorState = {
  semesters: Semester[];
  scenarioCourses: Course[];
  target: {
    targetCgpa: number | '';
    graduationCredits: number | '';
    remainingSemesters: number | '';
  };
};

export type SimulatorMetrics = {
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

export function sampleState(): SimulatorState;
export function derive(state: SimulatorState): SimulatorMetrics;
export function statusFor(data: SimulatorMetrics): {
  kind: 'warning' | 'success' | 'unreachable';
  label: string;
  copy: string;
};
export function mountSimulator(root: HTMLElement): () => void;
