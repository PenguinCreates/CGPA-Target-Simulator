const STORAGE_KEY = 'studyline.cgpa-simulator.v1';
const GRADE_POINTS = Object.freeze({ A: 4, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, 'D+': 1.5, D: 1, F: 0 });
const GRADES = Object.keys(GRADE_POINTS);
let nextId = 1;
const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${nextId++}`;
const course = (name = 'New course', grade = 'B', creditHours = 3) => ({ id: id('course'), name, creditHours, gradeEarned: grade });
const semester = (name) => ({ id: id('semester'), name, courses: [] });

function sampleState() {
  const semesterGrades = [
    [['Foundations of Biology', 'A'], ['Academic Writing', 'A'], ['Intro to Statistics', 'B+'], ['World History', 'B+'], ['Research Methods', 'B'], ['Environmental Studies', 'C+']],
    [['Cell Biology', 'A'], ['Writing & Rhetoric', 'A'], ['Data Analysis', 'B+'], ['Modern History', 'B+'], ['Lab Practice', 'B'], ['Ethics in Science', 'C+']],
  ];
  return {
    semesters: semesterGrades.map((items, index) => ({
      id: id('semester'), name: `Semester ${index + 1}`,
      courses: items.map(([name, grade]) => ({ id: id('course'), name, creditHours: 3, gradeEarned: grade })),
    })),
    target: { targetCgpa: 3.6, remainingSemesters: 4, plannedCreditsPerSemester: 18 },
  };
}

const numeric = (value, min = 0, max = Infinity) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
};
const escaped = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const format = (value, places = 2) => Number.isFinite(value) ? value.toFixed(places) : '—';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sampleState();
    const saved = JSON.parse(raw);
    if (!saved || !Array.isArray(saved.semesters) || !saved.target) return sampleState();
    const semesters = saved.semesters.map((item) => ({
      id: String(item.id || id('semester')),
      name: String(item.name ?? ''),
      courses: Array.isArray(item.courses) ? item.courses.map((c) => ({
        id: String(c.id || id('course')), name: String(c.name ?? ''),
        creditHours: c.creditHours === '' || c.creditHours == null ? '' : numeric(c.creditHours, 0, 1000),
        gradeEarned: GRADE_POINTS[c.gradeEarned] !== undefined ? c.gradeEarned : 'B',
      })) : [],
    }));
    const target = saved.target;
    return { semesters, target: {
      targetCgpa: target.targetCgpa === '' || target.targetCgpa == null ? '' : numeric(target.targetCgpa, 0, 4),
      remainingSemesters: target.remainingSemesters === '' || target.remainingSemesters == null ? '' : numeric(target.remainingSemesters, 0, 20),
      plannedCreditsPerSemester: target.plannedCreditsPerSemester === '' || target.plannedCreditsPerSemester == null ? '' : numeric(target.plannedCreditsPerSemester, 0, 1000),
    } };
  } catch { return sampleState(); }
}

function derive(state) {
  let totalCreditsEarned = 0, totalQualityPoints = 0;
  for (const term of state.semesters) {
    for (const c of term.courses) {
      const credits = numeric(c.creditHours);
      const points = GRADE_POINTS[c.gradeEarned];
      if (credits > 0 && points !== undefined) {
        totalCreditsEarned += credits;
        totalQualityPoints += credits * points;
      }
    }
  }
  const currentCumulativeGpa = totalCreditsEarned > 0 ? totalQualityPoints / totalCreditsEarned : null;
  const targetValid = state.target.targetCgpa !== '' && Number.isFinite(Number(state.target.targetCgpa)) && Number(state.target.targetCgpa) >= 0 && Number(state.target.targetCgpa) <= 4;
  const planValid = state.target.remainingSemesters !== '' && state.target.plannedCreditsPerSemester !== ''
    && Number.isFinite(Number(state.target.remainingSemesters)) && Number.isFinite(Number(state.target.plannedCreditsPerSemester));
  const goal = numeric(state.target.targetCgpa, 0, 4);
  const remainingSemesters = numeric(state.target.remainingSemesters, 0, 20);
  const plannedCreditsPerSemester = numeric(state.target.plannedCreditsPerSemester, 0, 1000);
  const futureCredits = remainingSemesters * plannedCreditsPerSemester;
  const requiredFutureGpa = !targetValid || !planValid ? null : futureCredits > 0
    ? (goal * (totalCreditsEarned + futureCredits) - totalQualityPoints) / futureCredits
    : (currentCumulativeGpa !== null && currentCumulativeGpa >= goal ? 0 : null);
  return { totalCreditsEarned, totalQualityPoints, currentCumulativeGpa, goal, remainingSemesters, plannedCreditsPerSemester, futureCredits, requiredFutureGpa, targetValid, planValid };
}

function statusFor(data) {
  const { currentCumulativeGpa, goal, futureCredits, requiredFutureGpa } = data;
  if (!data.targetValid) return { kind: 'warning', label: 'Target needed', copy: 'Enter a target from 0.00 to 4.00 to see your projection.' };
  if (!data.planValid) return { kind: 'warning', label: 'Plan details needed', copy: 'Enter both remaining semesters and planned credits per semester to calculate a useful average.' };
  if (futureCredits <= 0) {
    if (currentCumulativeGpa !== null && currentCumulativeGpa >= goal) return { kind: 'success', label: 'Goal already met', copy: 'Your current cumulative GPA is already at or above your target.' };
    return { kind: 'warning', label: 'Add future credits', copy: 'Set remaining semesters and planned credits to calculate the GPA needed from here.' };
  }
  if (currentCumulativeGpa !== null && currentCumulativeGpa >= goal) return { kind: 'success', label: 'Goal already met', copy: 'You are at or above your target now. The calculation shows the average you can earn and still finish at your goal.' };
  if (requiredFutureGpa > 4) return { kind: 'unreachable', label: 'Above the 4.0 scale', copy: 'This target is not reachable with the current credits and plan. Consider revising the target or timeline.' };
  if (requiredFutureGpa <= 0) return { kind: 'success', label: 'Within reach', copy: 'You have enough quality points banked to reach this target with any passing average.' };
  if (requiredFutureGpa >= 3.7) return { kind: 'warning', label: 'A focused stretch', copy: 'This is mathematically possible, but it calls for a consistently strong term average.' };
  return { kind: 'success', label: 'Within reach', copy: 'This average across your remaining planned credits would bring you to your goal.' };
}

function gradeOptions(selected) {
  return GRADES.map((grade) => `<option value="${grade}" ${grade === selected ? 'selected' : ''}>${grade} · ${format(GRADE_POINTS[grade], 1)}</option>`).join('');
}

function semesterMarkup(term, index) {
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
  const credits = term.courses.reduce((sum, c) => sum + numeric(c.creditHours), 0);
  const qps = term.courses.reduce((sum, c) => sum + numeric(c.creditHours) * (GRADE_POINTS[c.gradeEarned] ?? 0), 0);
  return `<article class="semester-card" data-semester-card="${escaped(term.id)}">
    <div class="semester-head">
      <div class="semester-label"><span class="semester-index">${String(index + 1).padStart(2, '0')}</span>
        <label class="sr-only" for="semester-name-${term.id}">Semester name</label>
        <input id="semester-name-${term.id}" class="semester-name" data-kind="semester-name" data-semester="${escaped(term.id)}" data-testid="input-semester-name-${escaped(term.id)}" aria-label="Semester name" value="${escaped(term.name)}">
      </div>
      <span class="semester-summary" data-term-summary="${escaped(term.id)}">${format(credits, 1)} cr · ${format(credits ? qps / credits : 0, 2)} GPA</span>
    </div>
    <div class="course-table-head" aria-hidden="true"><span>Course</span><span style="text-align:right">Credits</span><span style="text-align:center">Grade</span><span></span></div>
    ${courses || '<p class="semester-empty">No courses in this semester yet. Add one to include it in your projection.</p>'}
    <div class="semester-actions">
      <button type="button" class="link-action" data-action="add-course" data-semester="${escaped(term.id)}" data-testid="button-add-course-${escaped(term.id)}">＋ Add course</button>
      <button type="button" class="text-button semester-remove" data-action="remove-semester" data-semester="${escaped(term.id)}" data-testid="button-remove-semester-${escaped(term.id)}" aria-label="Remove ${escaped(term.name || `semester ${index + 1}`)}">Remove semester</button>
    </div>
  </article>`;
}

function render(root, state, saved = true) {
  const data = derive(state);
  const currentGpa = data.currentCumulativeGpa;
  const status = statusFor(data);
  const required = data.requiredFutureGpa;
  root.innerHTML = `
    <div class="app-shell min-h-screen w-full">
      <header class="topbar mx-auto flex max-w-7xl items-center justify-between">
        <a class="brand" href="/" aria-label="Studyline home" data-testid="link-home"><span class="brand-mark" aria-hidden="true">s.</span><span class="brand-name">studyline</span></a>
        <div class="top-meta">
          <span class="save-indicator" role="status" data-testid="status-save"><i class="save-dot"></i><span class="save-copy">${saved ? 'Saved on this device' : 'Saving…'}</span></span>
          <button type="button" class="text-button" data-action="reset" data-testid="button-reset">Reset sample data</button>
        </div>
      </header>
      <main class="main-content mx-auto w-full max-w-7xl">
        <section class="intro" aria-labelledby="page-title">
          <div><div class="eyebrow">A clearer way forward</div><h1 id="page-title">Make the goal<br>feel manageable.</h1>
            <p class="intro-copy">Shape your plan one course at a time. Adjust a grade, credit, or target and see exactly what changes—no hidden assumptions.</p>
          </div>
          <div class="intro-side"><strong>One term at a time.</strong><span>Your plan, in plain numbers</span></div>
        </section>
        <section class="dashboard-grid grid grid-cols-1 items-start gap-3 min-[701px]:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)] min-[901px]:grid-cols-[minmax(0,1.48fr)_minmax(310px,.82fr)] min-[901px]:gap-[18px]" aria-label="CGPA target simulator">
          <section class="panel course-panel" aria-labelledby="courses-title">
            <div class="panel-heading"><div><div class="eyebrow">Your academic record</div><h2 class="panel-title" id="courses-title">Completed semesters</h2><p class="panel-kicker">Edit courses to reflect your transcript.</p></div>
              <span class="eyebrow" data-testid="text-semester-count">${state.semesters.length} ${state.semesters.length === 1 ? 'semester' : 'semesters'}</span>
            </div>
            <div class="semester-list" data-testid="list-semesters">
              ${state.semesters.length ? state.semesters.map(semesterMarkup).join('') : `<div class="semester-card"><p class="semester-empty">No semesters added. Start with your completed coursework to build an accurate projection.</p></div>`}
            </div>
            <div class="course-footer"><button type="button" class="button button-soft" data-action="add-semester" data-testid="button-add-semester">＋ Add semester</button><span class="hint">Only completed courses count toward your current CGPA.</span></div>
          </section>
          <aside class="panel assumptions" aria-labelledby="plan-title">
            <div class="eyebrow">The plan ahead</div><h2 class="panel-title" id="plan-title" style="margin-top:6px">Set your target</h2>
            <div class="goal-field" style="margin-top:18px"><label for="target-cgpa">Target CGPA</label><div class="goal-input-wrap"><input id="target-cgpa" class="goal-input" data-kind="target" data-key="targetCgpa" data-testid="input-target-cgpa" type="number" min="0" max="4" step="0.01" value="${escaped(state.target.targetCgpa)}" aria-describedby="goal-hint"><span>/ 4.0</span></div><p class="hint" id="goal-hint">Your desired cumulative GPA on a 4.0 scale.</p></div>
            <div class="settings-grid">
              <div class="setting-control"><label class="input-label" for="remaining-semesters">Semesters left</label><input id="remaining-semesters" class="setting-input" data-kind="target" data-key="remainingSemesters" data-testid="input-remaining-semesters" type="number" min="0" max="20" step="1" value="${escaped(state.target.remainingSemesters)}" aria-describedby="semesters-hint"><p class="hint" id="semesters-hint">Future terms in your plan.</p></div>
              <div class="setting-control"><label class="input-label" for="planned-credits">Credits per term</label><input id="planned-credits" class="setting-input" data-kind="target" data-key="plannedCreditsPerSemester" data-testid="input-planned-credits" type="number" min="0" max="1000" step="0.5" value="${escaped(state.target.plannedCreditsPerSemester)}" aria-describedby="credits-hint"><p class="hint" id="credits-hint">Your planned credit load each term.</p></div>
            </div>
            <section class="projection-box" aria-live="polite" aria-atomic="true">
              <div class="projection-label">Average needed in remaining credits</div>
              <div class="projection-value ${status.kind === 'unreachable' ? 'is-unreachable' : ''}" data-testid="text-required-gpa">${required === null ? '—' : format(required)}</div>
              <p class="projection-copy" data-testid="text-projection-message">${status.copy}</p>
              <span class="status-pill ${status.kind}" data-testid="status-reachability"><span aria-hidden="true">${status.kind === 'success' ? '✓' : status.kind === 'warning' ? '!' : '×'}</span>${status.label}</span>
            </section>
            <div class="breakdown"><h3 class="breakdown-title">How the projection works</h3>
              <div class="stat-row"><span>Current CGPA</span><strong data-testid="text-current-cgpa">${currentGpa === null ? '—' : format(currentGpa)}</strong></div>
              <div class="stat-row"><span>Future credits planned</span><strong data-testid="text-future-credits">${format(data.futureCredits, 1)} cr</strong></div>
              <div class="stat-row"><span>Credits at graduation</span><strong data-testid="text-total-credits">${format(data.totalCreditsEarned + data.futureCredits, 1)} cr</strong></div>
            </div>
            <div class="scale-note"><span class="note-mark" aria-hidden="true">i</span><span>The required average uses your <strong>total credits and quality points</strong>, plus your planned future credit total. Future courses are not assumed to have any particular grade or individual credit size.</span></div>
            <p class="assumption-foot">A plan is a guide, not a promise. Check your university’s official repeat, rounding, and degree-credit rules.</p>
          </aside>
        </section>
        <section class="panel summary-strip" aria-label="Current academic standing">
          <div class="summary-item"><span>Credits completed</span><strong data-testid="text-credits-earned">${format(data.totalCreditsEarned, 1)}<small>credits</small></strong></div>
          <div class="summary-item"><span>Quality points earned</span><strong data-testid="text-quality-points">${format(data.totalQualityPoints, 1)}<small>points</small></strong></div>
          <div class="summary-item"><span>Current CGPA</span><strong data-testid="text-summary-cgpa">${currentGpa === null ? '—' : format(currentGpa)}<small>out of 4.0</small></strong></div>
        </section>
        <footer class="bottom-note"><span><strong>Your edits stay on this device.</strong> Nothing is sent to a server.</span><span>Grade scale: A 4.0 · B+ 3.5 · B 3.0 · C+ 2.5 · C 2.0 · D+ 1.5 · D 1.0 · F 0.0</span></footer>
      </main>
    </div>`;
}

function refreshOutputs(root, state, saved) {
  const data = derive(state), status = statusFor(data), required = data.requiredFutureGpa;
  const set = (testid, value) => { const node = root.querySelector(`[data-testid="${testid}"]`); if (node) node.textContent = value; };
  set('text-required-gpa', required === null ? '—' : format(required));
  set('text-projection-message', status.copy);
  const reach = root.querySelector('[data-testid="status-reachability"]');
  if (reach) { reach.className = `status-pill ${status.kind}`; reach.innerHTML = `<span aria-hidden="true">${status.kind === 'success' ? '✓' : status.kind === 'warning' ? '!' : '×'}</span>${status.label}`; }
  const projected = root.querySelector('[data-testid="text-required-gpa"]');
  if (projected) projected.classList.toggle('is-unreachable', status.kind === 'unreachable');
  set('text-current-cgpa', data.currentCumulativeGpa === null ? '—' : format(data.currentCumulativeGpa));
  set('text-future-credits', `${format(data.futureCredits, 1)} cr`);
  set('text-total-credits', `${format(data.totalCreditsEarned + data.futureCredits, 1)} cr`);
  set('text-credits-earned', `${format(data.totalCreditsEarned, 1)} credits`);
  set('text-quality-points', `${format(data.totalQualityPoints, 1)} points`);
  set('text-summary-cgpa', `${data.currentCumulativeGpa === null ? '—' : format(data.currentCumulativeGpa)} out of 4.0`);
  for (const term of state.semesters) {
    const node = root.querySelector(`[data-term-summary="${term.id}"]`);
    if (!node) continue;
    const credits = term.courses.reduce((sum, c) => sum + numeric(c.creditHours), 0);
    const points = term.courses.reduce((sum, c) => sum + numeric(c.creditHours) * (GRADE_POINTS[c.gradeEarned] ?? 0), 0);
    node.textContent = `${format(credits, 1)} cr · ${format(credits ? points / credits : 0, 2)} GPA`;
  }
  const save = root.querySelector('[data-testid="status-save"] .save-copy');
  if (save) save.textContent = saved ? 'Saved on this device' : 'Saving…';
}

export function mountSimulator(root) {
  let state = loadState();
  let saveTimer;
  const persist = () => {
    const indicator = root.querySelector('[data-testid="status-save"] .save-copy');
    if (indicator) indicator.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage may be unavailable */ }
      refreshOutputs(root, state, true);
    }, 160);
  };
  const paint = () => { render(root, state, true); refreshOutputs(root, state, true); };
  const findCourse = (termId, courseId) => state.semesters.find((term) => term.id === termId)?.courses.find((item) => item.id === courseId);

  root.addEventListener('input', (event) => {
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
    }
    refreshOutputs(root, state, false);
    persist();
  });
  root.addEventListener('change', (event) => {
    const el = event.target;
    if (el instanceof HTMLSelectElement && el.dataset.kind === 'course-grade') {
      const item = findCourse(el.dataset.semester, el.dataset.course);
      if (item) item.gradeEarned = GRADE_POINTS[el.value] !== undefined ? el.value : 'B';
      refreshOutputs(root, state, false);
      persist();
    }
  });
  root.addEventListener('focusout', (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'number' || el.value === '') return;
    const bounds = el.dataset.key === 'targetCgpa' || el.id === 'target-cgpa'
      ? [0, 4]
      : el.dataset.key === 'remainingSemesters' || el.id === 'remaining-semesters'
        ? [0, 20]
        : [0, 1000];
    const normalized = Math.min(bounds[1], Math.max(bounds[0], Number(el.value)));
    if (Number.isFinite(normalized)) {
      el.value = String(normalized);
      if (el.dataset.kind === 'target') state.target[el.dataset.key] = normalized;
      else if (el.dataset.kind === 'course-credits') {
        const item = findCourse(el.dataset.semester, el.dataset.course);
        if (item) item.creditHours = normalized;
      }
      refreshOutputs(root, state, false);
      persist();
    }
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, semester: termId, course: courseId } = button.dataset;
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
    if (action === 'reset') {
      state = sampleState();
    }
    paint();
    persist();
    if (action === 'add-course') root.querySelector(`[data-semester="${termId}"] [data-kind="course-name"]:last-of-type`)?.focus();
  });
  paint();
  return () => { clearTimeout(saveTimer); root.replaceChildren(); };
}
