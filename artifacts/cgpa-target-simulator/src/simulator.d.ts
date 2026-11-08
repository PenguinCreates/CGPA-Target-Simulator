import type { CgpaMetrics } from '../../../lib/cgpa-calculations.js';

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

export type SimulatorMetrics = CgpaMetrics;

export function sampleState(): SimulatorState;
export function derive(state: SimulatorState): SimulatorMetrics;
export function statusFor(data: SimulatorMetrics): {
  kind: 'warning' | 'success' | 'unreachable';
  label: string;
  copy: string;
};
export function mountSimulator(root: HTMLElement): () => void;
