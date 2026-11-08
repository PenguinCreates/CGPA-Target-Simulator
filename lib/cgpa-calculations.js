export const CGPA_GRADES = Object.freeze(['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F']);

export const CGPA_GRADE_POINTS = Object.freeze({
  A: 4,
  'B+': 3.5,
  B: 3,
  'C+': 2.5,
  C: 2,
  'D+': 1.5,
  D: 1,
  F: 0,
});

function numeric(value, min = 0, max = Infinity) {
  if (value === '' || value == null) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
}

function hasFiniteValue(value) {
  return value !== '' && value != null && Number.isFinite(Number(value));
}

function gradePointsFor(gradeScale) {
  return Object.fromEntries(CGPA_GRADES.map((grade) => {
    const points = gradeScale?.[grade];
    return [
      grade,
      Number.isFinite(points) && points >= 0 && points <= 4
        ? points
        : CGPA_GRADE_POINTS[grade],
    ];
  }));
}

function courseTotals(courses = [], gradePoints = CGPA_GRADE_POINTS) {
  let credits = 0;
  let qualityPoints = 0;

  for (const course of courses) {
    const courseCredits = numeric(course.creditHours);
    const points = gradePoints[course.gradeEarned];
    if (courseCredits > 0 && points !== undefined) {
      credits += courseCredits;
      qualityPoints += courseCredits * points;
    }
  }

  return { credits, qualityPoints };
}

export function calculateCgpaMetrics(plan) {
  const gradePoints = gradePointsFor(plan.gradeScale);
  const completed = courseTotals((plan.semesters ?? []).flatMap((term) => term.courses ?? []), gradePoints);
  const scenario = courseTotals(plan.scenarioCourses ?? [], gradePoints);
  const maxGradePoint = Math.max(...Object.values(gradePoints));
  const currentCumulativeGpa = completed.credits > 0
    ? completed.qualityPoints / completed.credits
    : null;
  const projectedCredits = completed.credits + scenario.credits;
  const projectedQualityPoints = completed.qualityPoints + scenario.qualityPoints;
  const predictedCgpa = projectedCredits > 0
    ? projectedQualityPoints / projectedCredits
    : null;
  const targetValue = plan.target?.targetCgpa;
  const graduationValue = plan.target?.graduationCredits;
  const targetValid = hasFiniteValue(targetValue)
    && Number(targetValue) >= 0
    && Number(targetValue) <= 4;
  const graduationCreditsValid = hasFiniteValue(graduationValue)
    && Number(graduationValue) > 0;
  const goal = numeric(targetValue, 0, 4);
  const graduationCredits = numeric(graduationValue, 0, 1000);
  const remainingSemesters = numeric(plan.target?.remainingSemesters, 0, 20);
  const targetTotalQualityPoints = goal * graduationCredits;
  const remainingCreditsToGraduation = graduationCredits - completed.credits;
  const remainingCreditsAfterScenario = graduationCredits - projectedCredits;
  const scenarioExceedsRemainingCredits = graduationCreditsValid
    && remainingCreditsToGraduation >= 0
    && remainingCreditsAfterScenario < 0;
  const scenarioCreditOverage = scenarioExceedsRemainingCredits
    ? -remainingCreditsAfterScenario
    : 0;
  const averageCreditsPerRemainingSemester = remainingSemesters > 0
    && remainingCreditsAfterScenario >= 0
    ? remainingCreditsAfterScenario / remainingSemesters
    : null;
  const requiredFutureGpa = !targetValid || !graduationCreditsValid
    ? null
    : remainingCreditsAfterScenario > 0
      ? (targetTotalQualityPoints - projectedQualityPoints) / remainingCreditsAfterScenario
      : projectedQualityPoints >= targetTotalQualityPoints ? 0 : Infinity;

  return {
    totalCreditsEarned: completed.credits,
    totalQualityPoints: completed.qualityPoints,
    currentCumulativeGpa,
    maxGradePoint,
    scenarioCredits: scenario.credits,
    scenarioQualityPoints: scenario.qualityPoints,
    projectedCredits,
    projectedQualityPoints,
    predictedCgpa,
    goal,
    graduationCredits,
    remainingSemesters,
    targetTotalQualityPoints,
    remainingCreditsToGraduation,
    remainingCreditsAfterScenario,
    scenarioExceedsRemainingCredits,
    scenarioCreditOverage,
    averageCreditsPerRemainingSemester,
    requiredFutureGpa,
    targetValid,
    graduationCreditsValid,
  };
}
