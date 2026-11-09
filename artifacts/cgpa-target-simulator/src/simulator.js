import { readSavedState, readThemePreference, saveAppState, saveThemePreference } from './storage.js';
import { calculateCgpaMetrics, CGPA_GRADE_POINTS, CGPA_GRADES } from '../../../lib/cgpa-calculations.js';

const GRADE_POINTS = CGPA_GRADE_POINTS;
const GRADES = CGPA_GRADES;
let nextId = 1;
const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${nextId++}`;
const course = (name = 'New course', grade = 'B', creditHours = 3) => ({ id: id('course'), name, creditHours, gradeEarned: grade });
const semester = (name) => ({ id: id('semester'), name, courses: [] });

export function sampleState() {
  const semesterGrades = [
    [['Foundations of Biology', 'A'], ['Academic Writing', 'A'], ['Intro to Statistics', 'B+'], ['World History', 'B+'], ['Research Methods', 'B'], ['Environmental Studies', 'C+']],
    [['Cell Biology', 'A'], ['Writing & Rhetoric', 'A'], ['Data Analysis', 'B+'], ['Modern History', 'B+'], ['Lab Practice', 'B'], ['Ethics in Science', 'C+']],
  ];
  return {
    semesters: semesterGrades.map((items, index) => ({
      id: id('semester'), name: `Semester ${index + 1}`,
      courses: items.map(([name, grade]) => ({ id: id('course'), name, creditHours: 3, gradeEarned: grade })),
    })),
    scenarioCourses: [],
    gradeScale: { ...GRADE_POINTS },
    target: { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 },
  };
}

function emptyState() {
  return {
    semesters: [],
    scenarioCourses: [],
    gradeScale: { ...GRADE_POINTS },
    target: { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 },
  };
}

function sampleCsState() {
  const sample = [
    [['Programming Fundamentals', 'A'], ['Discrete Mathematics', 'B+'], ['Computer Systems', 'B'], ['Calculus I', 'B+'], ['Academic Writing', 'A'], ['Digital Logic', 'B']],
    [['Data Structures', 'A'], ['Object-Oriented Programming', 'A'], ['Database Systems', 'B+'], ['Computer Architecture', 'B'], ['Statistics for Computing', 'B+'], ['Technical Communication', 'A']],
  ];
  return {
    semesters: sample.map((items, index) => ({
      id: id('semester'),
      name: `Semester ${index + 1}`,
      courses: items.map(([name, grade]) => ({ id: id('course'), name, creditHours: 3, gradeEarned: grade })),
    })),
    scenarioCourses: [],
    gradeScale: { ...GRADE_POINTS },
    target: { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 },
  };
}

const numeric = (value, min = 0, max = Infinity) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
};
const escaped = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const format = (value, places = 2) => Number.isFinite(value) ? value.toFixed(places) : '—';

function normalizeState(saved) {
  try {
    if (!saved || !Array.isArray(saved.semesters) || !saved.target) return sampleState();
    const gradeScale = Object.fromEntries(GRADES.map((grade) => {
      const point = saved.gradeScale?.[grade];
      return [grade, point !== '' && point != null && Number.isFinite(Number(point))
        ? numeric(point, 0, 4)
        : GRADE_POINTS[grade]];
    }));
    const semesters = saved.semesters.map((item) => ({
      id: String(item.id || id('semester')),
      name: String(item.name ?? ''),
      courses: Array.isArray(item.courses) ? item.courses.map((c) => ({
        id: String(c.id || id('course')), name: String(c.name ?? ''),
        creditHours: c.creditHours === '' || c.creditHours == null ? '' : numeric(c.creditHours, 0, 1000),
        gradeEarned: GRADE_POINTS[c.gradeEarned] !== undefined ? c.gradeEarned : 'B',
      })) : [],
    }));
    const scenarioCourses = Array.isArray(saved.scenarioCourses) ? saved.scenarioCourses.map((c) => ({
      id: String(c.id || id('scenario')),
      name: String(c.name ?? ''),
      creditHours: c.creditHours === '' || c.creditHours == null ? '' : numeric(c.creditHours, 0, 1000),
      gradeEarned: GRADE_POINTS[c.gradeEarned] !== undefined ? c.gradeEarned : 'B',
    })) : [];
    const target = saved.target;
    return { semesters, scenarioCourses, gradeScale, target: {
      targetCgpa: target.targetCgpa === '' || target.targetCgpa == null ? '' : numeric(target.targetCgpa, 0, 4),
      graduationCredits: target.graduationCredits === '' ? '' : numeric(target.graduationCredits ?? 120, 0, 1000),
      remainingSemesters: target.remainingSemesters === '' || target.remainingSemesters == null ? '' : numeric(target.remainingSemesters, 0, 20),
    } };
  } catch {
    return sampleState();
  }
}

export function parseImportedState(value) {
  const invalid = () => new Error('This file is not a valid Studyline plan export.');
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray(value.semesters) || !value.target || typeof value.target !== 'object' || Array.isArray(value.target)) {
    throw invalid();
  }
  if (value.semesters.length > 100) throw new Error('This plan has too many semesters to import.');
  let courseCount = 0;
  for (const term of value.semesters) {
    if (!term || typeof term !== 'object' || !Array.isArray(term.courses)) throw invalid();
    courseCount += term.courses.length;
    if (term.courses.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) throw invalid();
  }
  if (value.scenarioCourses !== undefined && !Array.isArray(value.scenarioCourses)) throw invalid();
  if (value.scenarioCourses?.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) throw invalid();
  courseCount += value.scenarioCourses?.length ?? 0;
  if (courseCount > 1000) throw new Error('This plan has too many courses to import.');
  return normalizeState(value);
}

async function loadState() {
  const stored = await readSavedState();
  return { state: normalizeState(stored.value), source: stored.source };
}

export function derive(state) {
  return calculateCgpaMetrics(state);
}

function semesterTotals(term, gradeScale = GRADE_POINTS) {
  return term.courses.reduce((totals, item) => {
    const courseCredits = numeric(item.creditHours);
    totals.credits += courseCredits;
    totals.qualityPoints += courseCredits * (gradeScale[item.gradeEarned] ?? 0);
    return totals;
  }, { credits: 0, qualityPoints: 0 });
}

export function summarizeSemester(term, gradeScale = GRADE_POINTS) {
  const { credits, qualityPoints } = semesterTotals(term, gradeScale);
  const gpa = credits ? qualityPoints / credits : 0;
  return {
    credits,
    gpa,
    label: `${format(credits, 1)} completed credits · ${format(gpa, 2)} GPA`,
  };
}

export function summarizeCumulativeSemesters(semesters, gradeScale = GRADE_POINTS) {
  let credits = 0;
  let qualityPoints = 0;
  return semesters.map((term, index) => {
    const totals = semesterTotals(term, gradeScale);
    credits += totals.credits;
    qualityPoints += totals.qualityPoints;
    const cgpa = credits ? qualityPoints / credits : null;
    const name = term.name || `Semester ${index + 1}`;
    return {
      id: term.id,
      name,
      cgpa,
      label: `Cumulative CGPA after ${name}: ${cgpa === null ? 'No graded credits yet' : format(cgpa)}`,
    };
  });
}

export function statusFor(data) {
  const { requiredFutureGpa, remainingCreditsAfterScenario, projectedQualityPoints, targetTotalQualityPoints, maxGradePoint = 4 } = data;
  if (!data.graduationCreditsValid) return { kind: 'warning', label: 'Graduation credits needed', copy: 'Enter the total credit hours required for your degree.' };
  if (data.remainingCreditsToGraduation < 0) return { kind: 'warning', label: 'Credits exceed degree total', copy: 'Your completed credits are higher than the graduation-credit setting. Check that total before using the projection.' };
  if (data.scenarioExceedsRemainingCredits) return { kind: 'warning', label: 'Scenario exceeds remaining credits', copy: 'These hypothetical courses exceed the credits still needed for graduation. Adjust the scenario or degree total.' };
  if (!data.targetValid) return { kind: 'warning', label: 'Target needed', copy: 'Enter a target from 0.00 to 4.00 to see your projection.' };
  if (requiredFutureGpa > maxGradePoint) return { kind: 'unreachable', label: 'Mathematically Impossible', copy: `This target would require more than a ${format(maxGradePoint, 2)} average in the remaining graduation credits.` };
  if (requiredFutureGpa < 2) return { kind: 'success', label: 'Easily Achievable', copy: 'The remaining average needed is below 2.0. The what-if courses are included in this calculation.' };
  if (data.remainingCreditsAfterScenario === 0 && projectedQualityPoints >= targetTotalQualityPoints) return { kind: 'success', label: 'Goal met at graduation', copy: 'Your completed record and what-if courses meet the target quality points for the graduation-credit total.' };
  if (requiredFutureGpa >= 3.7) return { kind: 'warning', label: 'A focused stretch', copy: 'This is possible on a 4.0 scale, but it calls for a consistently strong average in your remaining credits.' };
  return { kind: 'success', label: 'Within reach', copy: 'This average across your remaining graduation credits would bring you to your goal.' };
}

const formatRequired = (value) => value === Infinity ? '∞' : value === null ? '—' : format(value);

function gradeOptions(selected) {
  return GRADES.map((grade) => `<option value="${grade}" ${grade === selected ? 'selected' : ''}>${grade}</option>`).join('');
}

function gradeScaleMarkup(gradeScale) {
  return GRADES.map((grade) => `<div class="setting-control grade-scale-control">
    <label class="input-label" for="grade-scale-${grade}">${grade} points</label>
    <input id="grade-scale-${grade}" class="setting-input" data-kind="grade-scale" data-grade="${grade}" data-testid="input-grade-scale-${grade}" type="number" min="0" max="4" step="0.01" value="${escaped(gradeScale[grade])}" aria-label="${grade} grade point value">
  </div>`).join('');
}

function semesterMarkup(term, index, collapsedSemesters = new Set(), cumulativeSummary) {
  const courses = term.courses.map((c) => `
    <div class="course-row">
      <label class="sr-only" for="course-name-${c.id}">Course name</label>
      <input id="course-name-${c.id}" class="field" data-kind="course-name" data-semester="${escaped(term.id)}" data-course="${escaped(c.id)}" data-testid="input-course-name-${escaped(c.id)}" aria-label="Course name" value="${escaped(c.name)}" placeholder="Course name">
      <label class="sr-only" for="course-credits-${c.id}">Credit hours</label>
      <input id="course-credits-${c.id}" class="field numeric" data-kind="course-credits" data-semester="${escaped(term.id)}" data-course="${escaped(c.id)}" data-testid="input-course-credits-${escaped(c.id)}" aria-label="Credit hours" type="number" min="0" max="1000" step="0.5" value="${escaped(c.creditHours)}" placeholder="0">
      <label class="sr-only" for="course-grade-${c.id}">Grade earned</label>
      <select id="course-grade-${c.id}" class="field grade" data-kind="course-grade" data-semester="${escaped(term.id)}" data-course="${escaped(c.id)}" data-testid="select-course-grade-${escaped(c.id)}" aria-label="Grade earned">${gradeOptions(c.gradeEarned)}</select>
      <button type="button" class="button-icon" data-action="remove-course" data-semester="${escaped(term.id)}" data-course="${escaped(c.id)}" data-testid="button-remove-course-${escaped(c.id)}" aria-label="Remove ${escaped(c.name || 'course')}">×</button>
    </div>`).join('');
  const summary = summarizeSemester(term);
  const collapsed = collapsedSemesters.has(term.id);
  return `<article class="semester-card" data-semester-card="${escaped(term.id)}">
    <div class="semester-head">
      <button type="button" class="accordion-toggle" data-action="toggle-semester" data-semester="${escaped(term.id)}" aria-expanded="${!collapsed}" aria-controls="semester-content-${escaped(term.id)}" aria-label="${collapsed ? 'Expand' : 'Collapse'} ${escaped(term.name || `semester ${index + 1}`)}">
        <span class="semester-index">${String(index + 1).padStart(2, '0')}</span><span class="accordion-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="semester-label">
        <label class="sr-only" for="semester-name-${term.id}">Semester name</label>
        <input id="semester-name-${term.id}" class="semester-name" data-kind="semester-name" data-semester="${escaped(term.id)}" data-testid="input-semester-name-${escaped(term.id)}" aria-label="Semester name" value="${escaped(term.name)}">
      </div>
      <span class="semester-summary" data-term-summary="${escaped(term.id)}" aria-label="${escaped(summary.label)}">${escaped(summary.label)}</span>
    </div>
    <div class="semester-cumulative" data-cumulative-summary="${escaped(term.id)}" role="status" aria-label="${escaped(cumulativeSummary.label)}">
      <span data-cumulative-label>Cumulative CGPA after ${escaped(cumulativeSummary.name)}</span>
      <strong data-cumulative-value>${cumulativeSummary.cgpa === null ? '—' : format(cumulativeSummary.cgpa)}</strong>
    </div>
    <div id="semester-content-${escaped(term.id)}" class="semester-content" ${collapsed ? 'hidden' : ''}>
      <div class="course-table-head" aria-hidden="true"><span>Course</span><span style="text-align:right">Credits</span><span style="text-align:center">Grade</span><span></span></div>
      ${courses || '<p class="semester-empty">No courses in this semester yet. Add one to include it in your projection.</p>'}
      <div class="semester-actions">
        <button type="button" class="link-action" data-action="add-course" data-semester="${escaped(term.id)}" data-testid="button-add-course-${escaped(term.id)}">＋ Add course</button>
        <button type="button" class="text-button semester-remove" data-action="remove-semester" data-semester="${escaped(term.id)}" data-testid="button-remove-semester-${escaped(term.id)}" aria-label="Remove ${escaped(term.name || `semester ${index + 1}`)}">Remove semester</button>
      </div>
    </div>
  </article>`;
}

function scenarioCourseMarkup(c) {
  return `<div class="course-row scenario-row" data-scenario-row="${escaped(c.id)}">
    <label class="sr-only" for="scenario-name-${escaped(c.id)}">Hypothetical course name</label>
    <input id="scenario-name-${escaped(c.id)}" class="field" data-kind="scenario-name" data-course="${escaped(c.id)}" data-testid="input-scenario-name-${escaped(c.id)}" aria-label="Hypothetical course name" value="${escaped(c.name)}" placeholder="Course name">
    <label class="sr-only" for="scenario-credits-${escaped(c.id)}">Credit hours</label>
    <input id="scenario-credits-${escaped(c.id)}" class="field numeric" data-kind="scenario-credits" data-course="${escaped(c.id)}" data-testid="input-scenario-credits-${escaped(c.id)}" aria-label="Hypothetical course credit hours" type="number" min="0" max="1000" step="0.5" value="${escaped(c.creditHours)}" placeholder="0">
    <label class="sr-only" for="scenario-grade-${escaped(c.id)}">Projected grade</label>
    <select id="scenario-grade-${escaped(c.id)}" class="field grade" data-kind="scenario-grade" data-course="${escaped(c.id)}" data-testid="select-scenario-grade-${escaped(c.id)}" aria-label="Projected grade">${gradeOptions(c.gradeEarned)}</select>
    <button type="button" class="button-icon" data-action="remove-scenario-course" data-course="${escaped(c.id)}" data-testid="button-remove-scenario-course-${escaped(c.id)}" aria-label="Remove ${escaped(c.name || 'hypothetical course')}">×</button>
  </div>`;
}

function render(root, state, saved = true, collapsedSemesters = new Set(), gradeScaleExpanded = true) {
  const data = derive(state);
  const cumulativeSummaries = summarizeCumulativeSemesters(state.semesters, state.gradeScale);
  const currentGpa = data.currentCumulativeGpa;
  const predictedGpa = data.predictedCgpa;
  const status = statusFor(data);
  const required = data.requiredFutureGpa;
  const targetInputValue = state.target.targetCgpa === '' ? '' : Number(state.target.targetCgpa).toFixed(2);
  root.innerHTML = `
    <div class="app-shell dashboard-shell min-h-screen w-full">
      <header class="topbar mx-auto flex max-w-7xl items-center justify-between">
        <a class="brand" href="/" aria-label="Studyline home" data-testid="link-home"><span class="brand-mark" aria-hidden="true">s.</span><span class="brand-name">studyline <span class="brand-context">ACADEMIC PLANNER</span></span></a>
        <div class="top-meta">
          <span class="save-indicator" role="status" data-testid="status-save"><i class="save-dot"></i><span class="save-copy">${typeof saved === 'string' ? saved : saved ? 'Saved offline on this device' : 'Saving…'}</span></span>
          <button type="button" class="install-button" data-action="install-app" data-testid="button-install-app">＋ Add app</button>
          <button type="button" class="theme-toggle" data-action="toggle-theme" data-testid="button-theme-toggle" aria-label="Switch color theme" aria-pressed="false"><span class="theme-icon" aria-hidden="true">◐</span><span data-theme-label>Dark mode</span></button>
        </div>
      </header>
      <main class="main-content mx-auto w-full max-w-7xl">
        <section class="dashboard-intro" aria-labelledby="page-title">
          <div><div class="eyebrow">YOUR DEGREE, IN FOCUS</div><h1 id="page-title">CGPA target simulator</h1>
            <p class="intro-copy">Track your progress, adjust your goal, and see the grades you’ll need to get there.</p>
          </div>
          <div class="academic-note"><span class="academic-note-mark" aria-hidden="true">↗</span><span><strong>Plan with confidence</strong><small>Every grade updates your outlook instantly.</small></span></div>
        </section>
        <nav class="action-toolbar" aria-label="Plan actions">
          <button type="button" class="button button-soft" data-action="export-json" data-testid="button-export-json"><span aria-hidden="true">↓</span> Export JSON</button>
          <button type="button" class="button button-soft" data-action="print-summary" data-testid="button-print-summary"><span aria-hidden="true">▤</span> Print summary</button>
          <details class="load-menu" data-testid="details-load-plan">
            <summary class="button button-soft load-menu-trigger" data-testid="button-load-plan" aria-label="Choose a plan to load">Load plan <span aria-hidden="true">⌄</span></summary>
            <div class="load-menu-options">
              <button type="button" class="load-menu-option" data-action="load-cs-sample" data-testid="button-load-cs-sample">Load sample CS degree data</button>
              <button type="button" class="load-menu-option" data-action="select-import-json" data-testid="button-import-json">Import exported JSON</button>
            </div>
          </details>
          <button type="button" class="button button-danger-soft" data-action="clear-data" data-testid="button-clear-data">Clear All Data</button>
        </nav>
        <input type="file" accept=".json,application/json" hidden data-testid="input-import-json">
        <p class="import-feedback" data-testid="import-feedback" role="alert" hidden></p>
        <div class="print-heading" aria-hidden="true"><strong>CGPA Target Simulator</strong><span>Personal study plan summary</span></div>
        <section class="metric-grid" aria-label="CGPA summary">
          <article class="metric-card metric-current"><span class="metric-label">Current CGPA</span><strong class="metric-value" data-testid="text-current-cgpa">${currentGpa === null ? '—' : format(currentGpa)}</strong><span class="metric-foot">${format(data.totalCreditsEarned, 0)} credits completed</span></article>
          <article class="metric-card metric-target">
            <div class="metric-label-row"><label class="metric-label" for="target-cgpa">Target CGPA</label><span class="metric-scale">OUT OF 4.0</span></div>
            <div class="target-input-line"><input id="target-cgpa" class="goal-input" data-kind="target" data-key="targetCgpa" data-testid="input-target-cgpa" type="number" min="0" max="4" step="0.01" value="${escaped(targetInputValue)}" aria-label="Target CGPA" aria-describedby="goal-hint"><span>/ 4.0</span></div>
            <input class="target-slider" data-kind="target" data-key="targetCgpa" data-testid="slider-target-cgpa" type="range" min="0" max="4" step="0.01" value="${escaped(targetInputValue)}" aria-label="Adjust target CGPA">
            <span class="metric-foot" id="goal-hint">Drag to adjust your goal</span>
          </article>
          <article class="metric-card metric-required"><div class="metric-label-row"><span class="metric-label">Required remaining GPA</span><span class="status-badge ${status.kind}" data-testid="status-summary"><i></i>${status.kind === 'unreachable' ? 'Out of Reach' : status.kind === 'warning' ? 'Needs Push' : 'On Track'}</span></div><strong class="metric-value" data-testid="text-required-gpa">${formatRequired(required)}</strong><span class="metric-foot">Across remaining degree credits</span></article>
        </section>
        <section class="dashboard-grid grid grid-cols-1 items-start gap-3 min-[701px]:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)] min-[901px]:grid-cols-[minmax(0,1.48fr)_minmax(310px,.82fr)] min-[901px]:gap-[18px]" aria-label="Academic record and graduation plan">
          <section class="panel course-panel" aria-labelledby="courses-title">
            <div class="panel-heading"><div><div class="eyebrow">Your academic record</div><h2 class="panel-title" id="courses-title">Completed semesters</h2><p class="panel-kicker">Edit courses to reflect your transcript.</p></div>
              <span class="eyebrow" data-testid="text-semester-count">${state.semesters.length} ${state.semesters.length === 1 ? 'semester' : 'semesters'}</span>
            </div>
            <div class="semester-list" data-testid="list-semesters">
              ${state.semesters.length ? state.semesters.map((term, index) => semesterMarkup(term, index, collapsedSemesters, cumulativeSummaries[index])).join('') : `<div class="semester-card"><p class="semester-empty">No semesters added. Start with your completed coursework to build an accurate projection.</p></div>`}
            </div>
            <div class="course-footer"><button type="button" class="button button-soft" data-action="add-semester" data-testid="button-add-semester">＋ Add semester</button><span class="hint">Only completed courses count toward your current CGPA.</span></div>
          </section>
          <aside class="panel assumptions" aria-labelledby="plan-title">
            <div class="eyebrow">Graduation plan</div><h2 class="panel-title" id="plan-title" style="margin-top:6px">Degree assumptions</h2>
            <div class="settings-grid">
              <div class="setting-control"><label class="input-label" for="graduation-credits">Total degree credits</label><input id="graduation-credits" class="setting-input" data-kind="target" data-key="graduationCredits" data-testid="input-graduation-credits" type="number" min="1" max="1000" step="1" value="${escaped(state.target.graduationCredits)}" aria-describedby="graduation-credits-hint"><p class="hint" id="graduation-credits-hint">Credits required to graduate; default 120.</p></div>
              <div class="setting-control"><label class="input-label" for="remaining-semesters">Semesters left</label><input id="remaining-semesters" class="setting-input" data-kind="target" data-key="remainingSemesters" data-testid="input-remaining-semesters" type="number" min="0" max="20" step="1" value="${escaped(state.target.remainingSemesters)}" aria-describedby="semesters-hint"><p class="hint" id="semesters-hint">Used to estimate credits per term.</p></div>
            </div>
            <section class="grade-scale-settings" aria-labelledby="grade-scale-title">
              <h3 class="breakdown-title grade-scale-title" id="grade-scale-title">
                <button type="button" class="grade-scale-toggle" data-action="toggle-grade-scale" data-testid="button-toggle-grade-scale" aria-expanded="${gradeScaleExpanded}" aria-controls="grade-scale-content">
                  <span>University grade scale</span><span class="grade-scale-chevron" aria-hidden="true">⌄</span>
                </button>
              </h3>
              <div id="grade-scale-content" class="grade-scale-content" ${gradeScaleExpanded ? '' : 'hidden'}>
                <p class="hint">Set the point value used for each letter grade (0–4.00).</p>
                <div class="grade-scale-grid">${gradeScaleMarkup(state.gradeScale)}</div>
              </div>
            </section>
            <section class="projection-box" aria-live="polite" aria-atomic="true">
              <div class="projection-label">Required GPA for remaining credits</div>
              <div class="projection-value ${status.kind === 'unreachable' ? 'is-unreachable' : ''}" data-testid="text-required-gpa-detail">${formatRequired(required)}</div>
              <p class="projection-copy" data-testid="text-projection-message">${status.copy}</p>
              <span class="status-pill ${status.kind}" data-testid="status-reachability"><span aria-hidden="true">${status.kind === 'success' ? '✓' : status.kind === 'warning' ? '!' : '×'}</span>${status.label}</span>
            </section>
            <div class="breakdown"><h3 class="breakdown-title">How the projection works</h3>
              <div class="stat-row"><span>Current CGPA</span><strong data-testid="text-current-cgpa">${currentGpa === null ? '—' : format(currentGpa)}</strong></div>
              <div class="stat-row"><span>Target quality points needed</span><strong data-testid="text-target-quality-points">${format(data.targetTotalQualityPoints, 1)} pts</strong></div>
              <div class="stat-row"><span>Credits still needed</span><strong data-testid="text-credits-to-graduation">${format(Math.max(0, data.remainingCreditsToGraduation), 1)} cr</strong></div>
              <div class="stat-row"><span>Credits after this scenario</span><strong data-testid="text-remaining-after-scenario">${format(Math.max(0, data.remainingCreditsAfterScenario), 1)} cr</strong></div>
              <div class="stat-row"><span>Average credits per remaining term</span><strong data-testid="text-average-credits-per-term">${format(data.averageCreditsPerRemainingSemester, 1)} cr</strong></div>
            </div>
            <div class="scale-note"><span class="note-mark" aria-hidden="true">i</span><span>Target points = target CGPA × degree credits. What-if courses add their projected quality points and credits before the remaining GPA is calculated.</span></div>
            <p class="assumption-foot">A plan is a guide, not a promise. Check your university’s official repeat, rounding, and degree-credit rules.</p>
          </aside>
        </section>
        <section class="panel chart-panel" aria-labelledby="trajectory-title">
          <div class="panel-heading"><div><div class="eyebrow">Your progress</div><h2 class="panel-title" id="trajectory-title">Semester GPA trajectory</h2><p class="panel-kicker">Compare each completed semester with your target.</p></div><span class="chart-legend"><i></i> Semester GPA <i class="legend-target"></i> Target</span></div>
          <div class="chart-wrap"><canvas id="trajectory-chart" role="img" aria-label="Line chart showing semester GPA and target GPA"></canvas><p class="chart-fallback" hidden>Chart is unavailable. Your semester grades are still included in the calculation.</p></div>
        </section>
        <section class="panel scenario-panel" aria-labelledby="scenario-title">
          <div class="scenario-header">
            <div><div class="eyebrow">What-if simulation</div><h2 class="panel-title" id="scenario-title">Try upcoming courses</h2><p class="panel-kicker">Add possible courses and grades to see their effect without changing your completed record.</p></div>
            <div class="scenario-score" aria-live="polite"><span>Predicted CGPA</span><strong data-testid="text-predicted-cgpa">${predictedGpa === null ? '—' : format(predictedGpa)}</strong><small data-testid="text-scenario-summary">${format(data.scenarioCredits, 1)} hypothetical credits · ${format(data.scenarioQualityPoints, 1)} quality points</small></div>
          </div>
          <p class="scenario-credit-warning" data-testid="warning-scenario-credit-overage" role="alert" aria-live="polite" ${data.scenarioExceedsRemainingCredits ? '' : 'hidden'}>Planned courses exceed your remaining degree credits by <strong>${format(data.scenarioCreditOverage, 1)} cr</strong>. Reduce course credits or remove a what-if course.</p>
          <div class="course-table-head scenario-table-head" aria-hidden="true"><span>Hypothetical course</span><span style="text-align:right">Credits</span><span style="text-align:center">Projected grade</span><span></span></div>
          <div class="scenario-list" data-testid="list-scenario-courses">
            ${state.scenarioCourses.length ? state.scenarioCourses.map(scenarioCourseMarkup).join('') : '<p class="scenario-empty">No hypothetical courses yet. Add one to test how a future grade could change your predicted CGPA.</p>'}
          </div>
          <div class="scenario-actions"><button type="button" class="button button-soft" data-action="add-scenario-course" data-testid="button-add-scenario-course">＋ Add hypothetical course</button><span class="hint">Scenario grades count in the forecast only; your completed semesters stay unchanged.</span></div>
        </section>
        <footer class="bottom-note"><span><strong>Your edits stay on this device.</strong> Nothing is sent to a server.</span><span data-testid="text-grade-scale-summary">${GRADES.map((grade) => `${grade} ${format(state.gradeScale[grade], 2)}`).join(' · ')}</span></footer>
      </main>
      <div class="creator-footer">
        <details class="creator-details" data-testid="details-creator-contact">
          <summary class="creator-trigger">Made by Prince Jerome Miah</summary>
          <div class="creator-popover" role="group" aria-label="Prince Jerome Miah contact details">
            <div class="creator-popover-heading">
              <img class="creator-avatar" src="/prince-jerome-miah.jpeg" alt="Portrait of Prince Jerome Miah" width="60" height="60" loading="lazy" decoding="async">
              <div class="creator-person-copy"><strong>Prince Jerome Miah</strong><span>Studyline creator</span></div>
              <button type="button" class="creator-close" data-action="close-creator-contact" aria-label="Close contact details">×</button>
            </div>
            <a class="creator-contact-row" href="mailto:miahprincejerome50@gmail.com"><span>Email</span><span>miahprincejerome50@gmail.com</span></a>
            <a class="creator-contact-row" href="tel:0534254487"><span>Phone</span><span>0534254487</span></a>
            <a class="creator-contact-row creator-linkedin-row" href="https://www.linkedin.com/in/prince-jerome-miah-b9331740a?utm_source=share_via&utm_content=profile&utm_medium=member_ios" target="_blank" rel="noopener noreferrer"><span>LinkedIn</span><span>https://www.linkedin.com/in/prince-jerome-miah-b9331740a?utm_source=share_via&utm_content=profile&utm_medium=member_ios</span></a>
          </div>
        </details>
      </div>
      <dialog class="confirm-dialog" data-testid="dialog-confirmation" aria-labelledby="confirm-title" aria-describedby="confirm-copy">
        <div class="confirm-dialog-content">
          <span class="eyebrow">Please confirm</span>
          <h2 id="confirm-title">Clear saved coursework?</h2>
          <p id="confirm-copy">This removes saved semesters and hypothetical courses from this browser. Target and degree assumptions return to their defaults.</p>
          <div class="confirm-actions">
            <button type="button" class="button button-soft" data-action="cancel-confirmation" autofocus>Cancel</button>
            <button type="button" class="button button-danger" data-action="confirm-action">Clear coursework</button>
          </div>
        </div>
      </dialog>
      <dialog class="confirm-dialog install-dialog" data-testid="dialog-install" aria-labelledby="install-title" aria-describedby="install-copy">
        <div class="confirm-dialog-content">
          <span class="eyebrow">Use Studyline like an app</span>
          <h2 id="install-title">Add Studyline to your Home Screen</h2>
          <p id="install-copy"><strong>On iPhone or iPad:</strong> open this page in Safari, tap Share, choose “Add to Home Screen,” then tap Add. <br><br><strong>On other devices:</strong> choose “Install app” or “Add to Home screen” from your browser menu.</p>
          <div class="confirm-actions"><button type="button" class="button button-primary" data-action="close-install">Got it</button></div>
        </div>
      </dialog>
    </div>`;
}

function refreshOutputs(root, state, saved) {
  const data = derive(state), status = statusFor(data), required = data.requiredFutureGpa;
  const set = (testid, value) => root.querySelectorAll(`[data-testid="${testid}"]`).forEach((node) => { node.textContent = value; });
  set('text-required-gpa', formatRequired(required));
  set('text-required-gpa-detail', formatRequired(required));
  set('text-projection-message', status.copy);
  const reach = root.querySelector('[data-testid="status-reachability"]');
  if (reach) { reach.className = `status-pill ${status.kind}`; reach.innerHTML = `<span aria-hidden="true">${status.kind === 'success' ? '✓' : status.kind === 'warning' ? '!' : '×'}</span>${status.label}`; }
  const projected = root.querySelector('[data-testid="text-required-gpa"]');
  if (projected) projected.classList.toggle('is-unreachable', status.kind === 'unreachable');
  const summaryStatus = root.querySelector('[data-testid="status-summary"]');
  if (summaryStatus) {
    summaryStatus.className = `status-badge ${status.kind}`;
    summaryStatus.innerHTML = `<i></i>${status.kind === 'unreachable' ? 'Out of Reach' : status.kind === 'warning' ? 'Needs Push' : 'On Track'}`;
  }
  const goalValue = state.target.targetCgpa === '' ? '' : Number(state.target.targetCgpa).toFixed(2);
  for (const selector of ['[data-testid="input-target-cgpa"]', '[data-testid="slider-target-cgpa"]']) {
    const control = root.querySelector(selector);
    if (control && control !== document.activeElement) control.value = goalValue;
  }
  set('text-current-cgpa', data.currentCumulativeGpa === null ? '—' : format(data.currentCumulativeGpa));
  set('text-target-quality-points', `${format(data.targetTotalQualityPoints, 1)} pts`);
  set('text-credits-to-graduation', `${format(Math.max(0, data.remainingCreditsToGraduation), 1)} cr`);
  set('text-remaining-after-scenario', `${format(Math.max(0, data.remainingCreditsAfterScenario), 1)} cr`);
  set('text-average-credits-per-term', `${format(data.averageCreditsPerRemainingSemester, 1)} cr`);
  set('text-grade-scale-summary', GRADES.map((grade) => `${grade} ${format(state.gradeScale[grade], 2)}`).join(' · '));
  set('text-predicted-cgpa', data.predictedCgpa === null ? '—' : format(data.predictedCgpa));
  set('text-scenario-summary', `${format(data.scenarioCredits, 1)} hypothetical credits · ${format(data.scenarioQualityPoints, 1)} quality points`);
  const scenarioWarning = root.querySelector('[data-testid="warning-scenario-credit-overage"]');
  if (scenarioWarning) {
    scenarioWarning.hidden = !data.scenarioExceedsRemainingCredits;
    scenarioWarning.innerHTML = data.scenarioExceedsRemainingCredits
      ? `Planned courses exceed your remaining degree credits by <strong>${format(data.scenarioCreditOverage, 1)} cr</strong>. Reduce course credits or remove a what-if course.`
      : '';
  }
  set('text-credits-earned', `${format(data.totalCreditsEarned, 1)} credits`);
  set('text-quality-points', `${format(data.totalQualityPoints, 1)} points`);
  set('text-summary-cgpa', `${data.currentCumulativeGpa === null ? '—' : format(data.currentCumulativeGpa)} out of 4.0`);
  for (const term of state.semesters) {
    const node = root.querySelector(`[data-term-summary="${term.id}"]`);
    if (!node) continue;
    const summary = summarizeSemester(term, state.gradeScale);
    node.textContent = summary.label;
    node.setAttribute('aria-label', summary.label);
  }
  const cumulativeNodes = new Map([...root.querySelectorAll('[data-cumulative-summary]')]
    .map((node) => [node.dataset.cumulativeSummary, node]));
  for (const summary of summarizeCumulativeSemesters(state.semesters, state.gradeScale)) {
    const node = cumulativeNodes.get(String(summary.id));
    if (!node) continue;
    node.setAttribute('aria-label', summary.label);
    const label = node.querySelector('[data-cumulative-label]');
    if (label) label.textContent = `Cumulative CGPA after ${summary.name}`;
    const value = node.querySelector('[data-cumulative-value]');
    if (value) value.textContent = summary.cgpa === null ? '—' : format(summary.cgpa);
  }
  const save = root.querySelector('[data-testid="status-save"] .save-copy');
  if (save) save.textContent = typeof saved === 'string' ? saved : saved ? 'Saved offline on this device' : 'Saving…';
}

export function mountSimulator(root) {
  let state = sampleState();
  let chart = null;
  let chartCanvas = null;
  let ChartConstructor = null;
  let chartLoadPromise = null;
  let chartVisible = false;
  let chartObserver = null;
  let chartIdleHandle = null;
  let chartIdleUsesTimeout = false;
  let pendingConfirmation = null;
  let pendingImportState = null;
  let lastDialogTrigger = null;
  let ready = false;
  let destroyed = false;
  let saveRevision = 0;
  let pendingSave = false;
  let saveInFlight = false;
  let saveTimer = null;
  let gradeScaleAutoCollapseTimer = null;
  let gradeScaleExpanded = true;
  let gradeScaleUserToggled = false;
  let deferredInstallPrompt = null;
  const collapsedSemesters = new Set();
  const drawChart = () => {
    const canvas = root.querySelector('#trajectory-chart');
    const fallback = root.querySelector('.chart-fallback');
    if (!canvas || !ChartConstructor || destroyed) return;
    if (chart && chartCanvas !== canvas) {
      chart.destroy();
      chart = null;
    }
    if (fallback) fallback.hidden = true;
    canvas.hidden = false;
    const labels = state.semesters.map((term, index) => term.name || `Semester ${index + 1}`);
    const values = state.semesters.map((term) => {
      const { credits, gpa } = summarizeSemester(term, state.gradeScale);
      return credits ? Number(gpa.toFixed(3)) : null;
    });
    const target = numeric(state.target.targetCgpa, 0, 4);
    const computed = getComputedStyle(document.documentElement);
    const primary = computed.getPropertyValue('--primary').trim();
    const foreground = computed.getPropertyValue('--foreground').trim();
    const border = computed.getPropertyValue('--border').trim();
    if (!chart) {
      chart = new ChartConstructor(canvas, {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Semester GPA', data: values, borderColor: `hsl(${primary})`, backgroundColor: `hsl(${primary} / .12)`, pointBackgroundColor: `hsl(${primary})`, pointRadius: 4, pointHoverRadius: 6, borderWidth: 3, tension: .32, spanGaps: false },
          { label: 'Target CGPA', data: labels.map(() => target), borderColor: '#d39b37', pointRadius: 0, borderWidth: 2, borderDash: [6, 6], tension: 0, fill: false },
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${Number(context.parsed.y).toFixed(2)}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: `hsl(${foreground})`, maxRotation: 0, autoSkip: true }, border: { display: false } },
            y: { min: 0, max: 4, ticks: { stepSize: 1, color: `hsl(${foreground})` }, grid: { color: `hsl(${border} / .7)` }, border: { display: false } },
          },
        },
      });
      chartCanvas = canvas;
      return;
    }
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].borderColor = `hsl(${primary})`;
    chart.data.datasets[0].backgroundColor = `hsl(${primary} / .12)`;
    chart.data.datasets[0].pointBackgroundColor = `hsl(${primary})`;
    chart.data.datasets[1].data = labels.map(() => target);
    chart.options.scales.x.ticks.color = `hsl(${foreground})`;
    chart.options.scales.y.ticks.color = `hsl(${foreground})`;
    chart.options.scales.y.grid.color = `hsl(${border} / .7)`;
    chart.update('none');
  };
  const loadChartModule = () => {
    if (!chartLoadPromise) {
      chartLoadPromise = import('chart.js/auto')
        .then((module) => { ChartConstructor = module.default; })
        .catch(() => {
          const fallback = root.querySelector('.chart-fallback');
          if (fallback) {
            fallback.hidden = false;
            fallback.textContent = 'Chart is unavailable. Your semester grades are still included in the calculation.';
          }
        })
        .finally(() => { chartLoadPromise = null; });
    }
    return chartLoadPromise;
  };
  const updateChart = () => {
    if (!chartVisible) return;
    if (ChartConstructor) {
      drawChart();
      return;
    }
    const fallback = root.querySelector('.chart-fallback');
    if (fallback && !chartLoadPromise) {
      fallback.hidden = false;
      fallback.textContent = 'Loading chart…';
    }
    void loadChartModule().then(() => {
      if (ChartConstructor && chartVisible) drawChart();
    });
  };
  const observeChart = () => {
    if (chartVisible) return;
    const canvas = root.querySelector('#trajectory-chart');
    if (!canvas) return;
    if ('IntersectionObserver' in window) {
      chartObserver?.disconnect();
      chartObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        chartVisible = true;
        chartObserver?.disconnect();
        updateChart();
      }, { rootMargin: '180px' });
      chartObserver.observe(canvas);
      return;
    }
    chartVisible = true;
    updateChart();
  };
  const refresh = (saved = false) => { refreshOutputs(root, state, saved); updateChart(); };
  const setTheme = (dark, persistPreference = false) => {
    document.documentElement.classList.toggle('dark', dark);
    if (persistPreference) void saveThemePreference(dark ? 'dark' : 'light');
    const button = root.querySelector('[data-testid="button-theme-toggle"]');
    if (button) {
      button.setAttribute('aria-pressed', String(dark));
      const label = button.querySelector('[data-theme-label]');
      if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
      const icon = button.querySelector('.theme-icon');
      if (icon) icon.textContent = dark ? '☼' : '◐';
    }
    updateChart();
  };
  setTheme(false);
  const flushSave = async () => {
    if (saveInFlight || !pendingSave) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
    saveInFlight = true;
    pendingSave = false;
    const revision = saveRevision;
    const result = await saveAppState(state);
    saveInFlight = false;
    if (!destroyed && revision === saveRevision) {
      const message = result === 'indexeddb'
        ? 'Saved offline on this device'
        : result === 'localStorage'
          ? 'Saved on this device; IndexedDB unavailable'
          : 'Could not save on this device';
      refreshOutputs(root, state, message);
    }
    if (pendingSave) void flushSave();
  };
  const persist = (immediate = false) => {
    pendingSave = true;
    saveRevision += 1;
    const indicator = root.querySelector('[data-testid="status-save"] .save-copy');
    if (indicator) indicator.textContent = 'Saving…';
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    if (immediate) return flushSave();
    saveTimer = window.setTimeout(() => { void flushSave(); }, 180);
  };
  const paint = (saved = true) => { render(root, state, saved, collapsedSemesters, gradeScaleExpanded); refresh(saved); observeChart(); };
  const setGradeScaleExpanded = (expanded) => {
    gradeScaleExpanded = expanded;
    const toggle = root.querySelector('[data-testid="button-toggle-grade-scale"]');
    const content = root.querySelector('#grade-scale-content');
    if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
    if (content) content.hidden = !expanded;
  };
  render(root, state, 'Loading saved plan…', collapsedSemesters, gradeScaleExpanded);
  observeChart();
  root.setAttribute('aria-busy', 'true');
  root.inert = true;
  void (async () => {
    const saved = await loadState();
    if (destroyed) return;
    state = saved.state;
    const theme = await readThemePreference();
    if (destroyed) return;
    if (theme) {
      setTheme(theme === 'dark');
      void saveThemePreference(theme);
    }
    ready = true;
    root.inert = false;
    root.setAttribute('aria-busy', 'false');
    paint(saved.source === 'indexeddb');
    gradeScaleAutoCollapseTimer = window.setTimeout(() => {
      if (!gradeScaleUserToggled && !destroyed) setGradeScaleExpanded(false);
    }, 26000);
    if (saved.source !== 'indexeddb') await persist(true);
  })();
  const findCourse = (termId, courseId) => state.semesters.find((term) => term.id === termId)?.courses.find((item) => item.id === courseId);
  const dialog = () => root.querySelector('[data-testid="dialog-confirmation"]');
  const openConfirmation = (action, trigger) => {
    const modal = dialog();
    if (!modal || typeof modal.showModal !== 'function') return;
    pendingConfirmation = action;
    lastDialogTrigger = trigger;
    const sample = action === 'sample';
    const importing = action === 'import';
    modal.querySelector('#confirm-title').textContent = sample
      ? 'Load sample CS degree data?'
      : importing ? 'Import this exported plan?' : 'Clear saved coursework?';
    modal.querySelector('#confirm-copy').textContent = sample
      ? 'This replaces your current semesters and hypothetical courses with sample computer science coursework and resets the target assumptions.'
      : importing
        ? 'This replaces the plan currently saved on this device with the selected JSON file.'
        : 'This removes saved semesters and hypothetical courses from this browser. Target and degree assumptions return to their defaults.';
    const confirmButton = modal.querySelector('[data-action="confirm-action"]');
    confirmButton.textContent = sample ? 'Load sample data' : importing ? 'Import plan' : 'Clear coursework';
    modal.showModal();
  };
  root.addEventListener('close', (event) => {
    if (event.target !== dialog()) return;
    pendingConfirmation = null;
    pendingImportState = null;
    lastDialogTrigger?.focus();
    lastDialogTrigger = null;
  }, true);
  const captureInstallPrompt = (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  };
  const clearInstallPrompt = () => {
    deferredInstallPrompt = null;
    const button = root.querySelector('[data-testid="button-install-app"]');
    if (button) {
      button.textContent = 'Added';
      button.setAttribute('aria-label', 'Studyline is installed');
    }
  };
  window.addEventListener('beforeinstallprompt', captureInstallPrompt);
  window.addEventListener('appinstalled', clearInstallPrompt);

  root.addEventListener('input', (event) => {
    if (!ready) return;
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || !el.dataset.kind) return;
    if (el.dataset.kind === 'target') {
      const value = el.value === '' ? '' : Number(el.value);
      state.target[el.dataset.key] = Number.isFinite(value) ? value : '';
    } else if (el.dataset.kind === 'semester-name') {
      const term = state.semesters.find((item) => item.id === el.dataset.semester);
      if (term) term.name = el.value;
    } else if (el.dataset.kind === 'course-name' || el.dataset.kind === 'course-credits') {
      const item = findCourse(el.dataset.semester, el.dataset.course);
      if (item) item[el.dataset.kind === 'course-name' ? 'name' : 'creditHours'] = el.dataset.kind === 'course-name' ? el.value : (el.value === '' ? '' : Number(el.value));
    } else if (el.dataset.kind === 'scenario-name' || el.dataset.kind === 'scenario-credits') {
      const item = state.scenarioCourses.find((courseItem) => courseItem.id === el.dataset.course);
      if (item) item[el.dataset.kind === 'scenario-name' ? 'name' : 'creditHours'] = el.dataset.kind === 'scenario-name' ? el.value : (el.value === '' ? '' : Number(el.value));
    } else if (el.dataset.kind === 'grade-scale' && el.value !== '') {
      const point = Number(el.value);
      if (Number.isFinite(point)) state.gradeScale[el.dataset.grade] = Math.min(4, Math.max(0, point));
    }
    refresh(false);
    persist();
  });
  root.addEventListener('change', (event) => {
    if (!ready) return;
    const el = event.target;
    if (el instanceof HTMLInputElement && el.matches('[data-testid="input-import-json"]')) {
      const file = el.files?.[0];
      el.value = '';
      if (!file) return;
      const feedback = root.querySelector('[data-testid="import-feedback"]');
      if (file.size > 2 * 1024 * 1024) {
        feedback.textContent = 'That file is too large. Choose a Studyline JSON export under 2 MB.';
        feedback.hidden = false;
        return;
      }
      void file.text().then((text) => {
        const importedState = parseImportedState(JSON.parse(text));
        pendingImportState = importedState;
        if (feedback) feedback.hidden = true;
        const trigger = root.querySelector('[data-testid="button-load-plan"]');
        openConfirmation('import', trigger);
      }).catch((error) => {
        if (feedback) {
          feedback.textContent = error instanceof SyntaxError
            ? 'The selected file is not valid JSON. Choose a Studyline JSON export.'
            : error instanceof Error ? error.message : 'The selected plan could not be imported.';
          feedback.hidden = false;
        }
      });
      return;
    }
    if (el instanceof HTMLSelectElement && el.dataset.kind === 'course-grade') {
      const item = findCourse(el.dataset.semester, el.dataset.course);
      if (item) item.gradeEarned = GRADE_POINTS[el.value] !== undefined ? el.value : 'B';
      refresh(false);
      persist(true);
    } else if (el instanceof HTMLSelectElement && el.dataset.kind === 'scenario-grade') {
      const item = state.scenarioCourses.find((courseItem) => courseItem.id === el.dataset.course);
      if (item) item.gradeEarned = GRADE_POINTS[el.value] !== undefined ? el.value : 'B';
      refresh(false);
      persist(true);
    }
  });
  root.addEventListener('focusout', (event) => {
    if (!ready) return;
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'number') return;
    if (el.value === '') {
      if (el.dataset.kind === 'grade-scale') el.value = String(state.gradeScale[el.dataset.grade]);
      return;
    }
    const bounds = el.dataset.kind === 'grade-scale'
      ? [0, 4]
      : el.dataset.key === 'targetCgpa' || el.id === 'target-cgpa'
      ? [0, 4]
      : el.dataset.key === 'graduationCredits' || el.id === 'graduation-credits'
        ? [1, 1000]
      : el.dataset.key === 'remainingSemesters' || el.id === 'remaining-semesters'
        ? [0, 20]
        : [0, 1000];
    const normalized = Math.min(bounds[1], Math.max(bounds[0], Number(el.value)));
    if (Number.isFinite(normalized)) {
      el.value = String(normalized);
      if (el.dataset.kind === 'target') state.target[el.dataset.key] = normalized;
      else if (el.dataset.kind === 'grade-scale') state.gradeScale[el.dataset.grade] = normalized;
      else if (el.dataset.kind === 'course-credits') {
        const item = findCourse(el.dataset.semester, el.dataset.course);
        if (item) item.creditHours = normalized;
      } else if (el.dataset.kind === 'scenario-credits') {
        const item = state.scenarioCourses.find((courseItem) => courseItem.id === el.dataset.course);
        if (item) item.creditHours = normalized;
      }
      refresh(false);
      persist(true);
    }
  });
  root.addEventListener('click', (event) => {
    if (!ready) return;
    const creatorDetails = root.querySelector('[data-testid="details-creator-contact"]');
    if (creatorDetails?.open && event.target instanceof Node && !creatorDetails.contains(event.target)) {
      creatorDetails.open = false;
    }
    const button = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!button) return;
    const { action, semester: termId, course: courseId } = button.dataset;
    if (action === 'close-creator-contact') {
      creatorDetails?.removeAttribute('open');
      root.querySelector('.creator-trigger')?.focus();
      return;
    }
    if (action === 'toggle-theme') {
      setTheme(!document.documentElement.classList.contains('dark'), true);
      return;
    }
    if (action === 'toggle-grade-scale') {
      gradeScaleUserToggled = true;
      if (gradeScaleAutoCollapseTimer !== null) {
        window.clearTimeout(gradeScaleAutoCollapseTimer);
        gradeScaleAutoCollapseTimer = null;
      }
      setGradeScaleExpanded(!gradeScaleExpanded);
      return;
    }
    if (action === 'install-app') {
      if (deferredInstallPrompt) {
        const installPrompt = deferredInstallPrompt;
        deferredInstallPrompt = null;
        void installPrompt.prompt();
      } else {
        const installDialog = root.querySelector('[data-testid="dialog-install"]');
        if (installDialog && !installDialog.open) installDialog.showModal();
      }
      return;
    }
    if (action === 'close-install') {
      root.querySelector('[data-testid="dialog-install"]')?.close();
      return;
    }
    if (action === 'toggle-semester') {
      if (collapsedSemesters.has(termId)) collapsedSemesters.delete(termId);
      else collapsedSemesters.add(termId);
      paint();
      return;
    }
    if (action === 'export-json') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cgpa-plan-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (action === 'print-summary') {
      window.print();
      return;
    }
    if (action === 'clear-data') {
      openConfirmation('clear', button);
      return;
    }
    if (action === 'load-cs-sample') {
      root.querySelector('[data-testid="details-load-plan"]').open = false;
      openConfirmation('sample', root.querySelector('[data-testid="button-load-plan"]'));
      return;
    }
    if (action === 'select-import-json') {
      root.querySelector('[data-testid="details-load-plan"]').open = false;
      root.querySelector('[data-testid="input-import-json"]').click();
      return;
    }
    if (action === 'cancel-confirmation') {
      dialog()?.close();
      return;
    }
    if (action === 'confirm-action') {
      const confirmedAction = pendingConfirmation;
      const importedState = pendingImportState;
      dialog()?.close();
      if (confirmedAction === 'clear') state = emptyState();
      else if (confirmedAction === 'sample') state = sampleCsState();
      else if (confirmedAction === 'import' && importedState) state = importedState;
      else return;
      collapsedSemesters.clear();
      paint();
      persist(true);
      root.querySelector('[data-testid="button-load-plan"]')?.focus();
      return;
    }
    if (action === 'add-semester') state.semesters.push(semester(`Semester ${state.semesters.length + 1}`));
    if (action === 'remove-semester') state.semesters = state.semesters.filter((term) => term.id !== termId);
    if (action === 'add-course') {
      const term = state.semesters.find((item) => item.id === termId);
      if (term) term.courses.push(course());
    }
    if (action === 'remove-course') {
      const term = state.semesters.find((item) => item.id === termId);
      if (term) term.courses = term.courses.filter((item) => item.id !== courseId);
    }
    if (action === 'add-scenario-course') state.scenarioCourses.push(course('Projected course', 'B', 3));
    if (action === 'remove-scenario-course') state.scenarioCourses = state.scenarioCourses.filter((item) => item.id !== courseId);
    paint();
    persist(true);
    if (action === 'add-course') {
      const inputs = root.querySelectorAll(`[data-kind="course-name"][data-semester="${termId}"]`);
      inputs[inputs.length - 1]?.focus();
    }
    if (action === 'add-scenario-course') {
      const inputs = root.querySelectorAll('[data-kind="scenario-name"]');
      inputs[inputs.length - 1]?.focus();
    }
  });
  const warmChart = () => {
    chartVisible = true;
    chartObserver?.disconnect();
    void loadChartModule().then(() => {
      if (ChartConstructor) drawChart();
    });
  };
  let idleScrollTimer = null;
  let autoScrollPauseTimer = null;
  let autoScrollFrame = null;
  let autoScrollActive = false;
  let previousScrollBehavior = '';
  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const clearAutoScrollTimers = () => {
    if (idleScrollTimer !== null) window.clearTimeout(idleScrollTimer);
    if (autoScrollPauseTimer !== null) window.clearTimeout(autoScrollPauseTimer);
    if (autoScrollFrame !== null) window.cancelAnimationFrame(autoScrollFrame);
    idleScrollTimer = null;
    autoScrollPauseTimer = null;
    autoScrollFrame = null;
  };
  const stopAutoScroll = () => {
    clearAutoScrollTimers();
    if (autoScrollActive) document.documentElement.style.scrollBehavior = previousScrollBehavior;
    autoScrollActive = false;
  };
  const scheduleIdleAutoScroll = () => {
    if (idleScrollTimer !== null) window.clearTimeout(idleScrollTimer);
    idleScrollTimer = null;
    if (destroyed || prefersReducedMotion() || document.visibilityState === 'hidden') return;
    idleScrollTimer = window.setTimeout(() => {
      idleScrollTimer = null;
      startAutoScroll();
    }, 20000);
  };
  const startAutoScroll = () => {
    if (autoScrollActive || destroyed || prefersReducedMotion() || document.visibilityState === 'hidden') return;
    if (idleScrollTimer !== null) window.clearTimeout(idleScrollTimer);
    idleScrollTimer = null;
    autoScrollActive = true;
    previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';

    const pauseThen = (callback) => {
      if (!autoScrollActive) return;
      autoScrollPauseTimer = window.setTimeout(() => {
        autoScrollPauseTimer = null;
        callback();
      }, 4000);
    };
    const animateTo = (destination, done) => {
      if (!autoScrollActive) return;
      const start = window.scrollY;
      const distance = destination - start;
      if (Math.abs(distance) < 2) {
        done();
        return;
      }
      const duration = Math.min(30000, Math.max(9000, Math.abs(distance) / 0.19));
      const segments = Math.max(1, Math.ceil(Math.abs(distance) / 650));
      const segmentDuration = duration / segments;
      const runSegment = (segmentIndex) => {
        if (!autoScrollActive) return;
        const segmentStart = window.scrollY;
        const segmentEnd = segmentIndex === segments - 1
          ? destination
          : start + distance * ((segmentIndex + 1) / segments);
        let startedAt = null;
        const frame = (now) => {
          if (!autoScrollActive) return;
          if (startedAt === null) startedAt = now;
          const progress = Math.min(1, (now - startedAt) / segmentDuration);
          const eased = 0.5 - Math.cos(Math.PI * progress) / 2;
          window.scrollTo(0, segmentStart + (segmentEnd - segmentStart) * eased);
          if (progress < 1) {
            autoScrollFrame = window.requestAnimationFrame(frame);
            return;
          }
          autoScrollFrame = null;
          if (segmentIndex < segments - 1) {
            autoScrollPauseTimer = window.setTimeout(() => {
              autoScrollPauseTimer = null;
              runSegment(segmentIndex + 1);
            }, 180);
          } else {
            done();
          }
        };
        autoScrollFrame = window.requestAnimationFrame(frame);
      };
      runSegment(0);
    };
    const scrollToTop = () => animateTo(0, () => pauseThen(scrollToContact));
    const scrollToContact = () => {
      const contact = root.querySelector('.creator-trigger');
      if (!contact) {
        stopAutoScroll();
        return;
      }
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const contactTop = contact.getBoundingClientRect().top + window.scrollY;
      const destination = Math.min(maxScroll, Math.max(0, contactTop - window.innerHeight * 0.68));
      animateTo(destination, () => pauseThen(scrollToTop));
    };
    scrollToContact();
  };
  const handleUserActivity = () => {
    stopAutoScroll();
    scheduleIdleAutoScroll();
  };
  const handleWindowBlur = () => {
    if (document.visibilityState === 'visible') startAutoScroll();
  };
  const handleWindowFocus = () => {
    stopAutoScroll();
    scheduleIdleAutoScroll();
  };
  const handleVisibilityChange = () => {
    stopAutoScroll();
    if (document.visibilityState === 'visible') scheduleIdleAutoScroll();
  };
  const activityEvents = ['pointerdown', 'click', 'keydown', 'input', 'change', 'wheel', 'touchstart'];
  activityEvents.forEach((type) => document.addEventListener(type, handleUserActivity, true));
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('focus', handleWindowFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  scheduleIdleAutoScroll();
  if ('requestIdleCallback' in window) {
    chartIdleHandle = window.requestIdleCallback(warmChart, { timeout: 700 });
  } else {
    chartIdleUsesTimeout = true;
    chartIdleHandle = window.setTimeout(warmChart, 500);
  }
  const flushOnPageHide = () => { if (pendingSave) void flushSave(); };
  window.addEventListener('pagehide', flushOnPageHide);
  return () => {
    window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
    window.removeEventListener('appinstalled', clearInstallPrompt);
    window.removeEventListener('pagehide', flushOnPageHide);
    activityEvents.forEach((type) => document.removeEventListener(type, handleUserActivity, true));
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('focus', handleWindowFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopAutoScroll();
    if (gradeScaleAutoCollapseTimer !== null) window.clearTimeout(gradeScaleAutoCollapseTimer);
    if (chartObserver) chartObserver.disconnect();
    if (chartIdleHandle !== null) {
      if (chartIdleUsesTimeout) window.clearTimeout(chartIdleHandle);
      else window.cancelIdleCallback(chartIdleHandle);
    }
    if (pendingSave) void flushSave();
    destroyed = true;
    chart?.destroy();
    root.replaceChildren();
  };
}
