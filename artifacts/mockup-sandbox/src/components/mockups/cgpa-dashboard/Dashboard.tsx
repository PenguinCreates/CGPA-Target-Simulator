import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { derive, sampleState, statusFor } from "./simulator.js";
import type { Course, Grade, Semester, SimulatorState } from "./simulator.js";
import "./_group.css";
import "./Dashboard.css";

const GRADE_POINTS: Record<Grade, number> = {
  A: 4,
  "B+": 3.5,
  B: 3,
  "C+": 2.5,
  C: 2,
  "D+": 1.5,
  D: 1,
  F: 0,
};
const GRADES = Object.keys(GRADE_POINTS) as Grade[];
const STORAGE_KEY = "mockup.studyline.cgpa-simulator.current";
const fmt = (value: number | null, places = 2) =>
  value === null || !Number.isFinite(value) ? "—" : value.toFixed(places);
const fmtRequired = (value: number | null) =>
  value === Infinity ? "∞" : fmt(value);

function readInitialState(): SimulatorState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SimulatorState;
      if (parsed && Array.isArray(parsed.semesters) && parsed.target) return parsed;
    }
  } catch {
    // The sample remains available if browser storage is unavailable.
  }
  return sampleState();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function courseGpa(courses: Course[]) {
  let credits = 0;
  let quality = 0;
  courses.forEach((course) => {
    const hours = Number(course.creditHours) || 0;
    const points = GRADE_POINTS[course.gradeEarned];
    if (hours > 0 && points !== undefined) {
      credits += hours;
      quality += hours * points;
    }
  });
  return { credits, quality, gpa: credits ? quality / credits : null };
}

function trendGeometry(semesters: Semester[], target: number) {
  const width = 700;
  const height = 220;
  const padX = 38;
  const padY = 22;
  const min = 0;
  const max = 4;
  const points = semesters.map((semester, index) => {
    const { gpa } = courseGpa(semester.courses);
    const x = semesters.length <= 1 ? width / 2 : padX + (index * (width - padX * 2)) / (semesters.length - 1);
    const y = padY + ((max - (gpa ?? 0)) / (max - min)) * (height - padY * 2);
    return { x, y, gpa, name: semester.name || `Semester ${index + 1}` };
  });
  const targetY = padY + ((max - target) / max) * (height - padY * 2);
  return { width, height, padX, padY, points, targetY, path: points.map((point) => `${point.x},${point.y}`).join(" ") };
}

type CourseField = "name" | "creditHours" | "gradeEarned";

export function Dashboard() {
  const [state, setState] = useState<SimulatorState>(readInitialState);
  const [dark, setDark] = useState(false);
  const metrics = useMemo(() => derive(state), [state]);
  const status = statusFor(metrics);
  const chart = trendGeometry(state.semesters, metrics.goal);

  const update = (next: SimulatorState) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Editing still works for the current session.
    }
  };

  const setTarget = (key: "targetCgpa" | "graduationCredits" | "remainingSemesters", value: string) => {
    const max = key === "targetCgpa" ? 4 : key === "remainingSemesters" ? 20 : 1000;
    const min = key === "graduationCredits" ? 1 : 0;
    const numericValue = value === "" ? "" : Math.min(max, Math.max(min, Number(value)));
    update({ ...state, target: { ...state.target, [key]: numericValue } });
  };

  const setSemesterName = (semesterId: string, value: string) => {
    update({ ...state, semesters: state.semesters.map((term) => term.id === semesterId ? { ...term, name: value } : term) });
  };

  const setCourse = (semesterId: string, courseId: string, field: CourseField, value: string) => {
    update({
      ...state,
      semesters: state.semesters.map((term) => term.id !== semesterId ? term : {
        ...term,
        courses: term.courses.map((course) => {
          if (course.id !== courseId) return course;
          const fieldValue = field === "creditHours" ? (value === "" ? "" : Math.max(0, Number(value))) : value;
          return { ...course, [field]: fieldValue };
        }),
      }),
    });
  };

  const addSemester = () => update({
    ...state,
    semesters: [...state.semesters, { id: makeId("semester"), name: `Semester ${state.semesters.length + 1}`, courses: [] }],
  });

  const addCourse = (semesterId: string) => update({
    ...state,
    semesters: state.semesters.map((term) => term.id === semesterId ? {
      ...term,
      courses: [...term.courses, { id: makeId("course"), name: "New course", creditHours: 3, gradeEarned: "B" }],
    } : term),
  });

  const removeCourse = (semesterId: string, courseId: string) => update({
    ...state,
    semesters: state.semesters.map((term) => term.id === semesterId
      ? { ...term, courses: term.courses.filter((course) => course.id !== courseId) }
      : term),
  });

  const removeSemester = (semesterId: string) => update({
    ...state,
    semesters: state.semesters.filter((term) => term.id !== semesterId),
  });

  const handleNumberBlur = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value === "") return;
    const key = event.target.dataset.key;
    if (!key) return;
    const bounds = key === "targetCgpa" ? [0, 4] : key === "graduationCredits" ? [1, 1000] : [0, 20];
    const value = Math.min(bounds[1], Math.max(bounds[0], Number(event.target.value)));
    setTarget(key as "targetCgpa" | "graduationCredits" | "remainingSemesters", String(value));
  };

  return (
    <div className={`cgpa-dashboard ${dark ? "cgpa-dark" : ""}`}>
      <div className="cgpa-frame">
        <header className="cgpa-topbar">
          <a className="cgpa-brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Studyline dashboard">
            <span className="cgpa-brand-mark">s.</span>
            <span>studyline<span className="cgpa-brand-divider">/</span><span className="cgpa-brand-section">degree planner</span></span>
          </a>
          <div className="cgpa-top-actions">
            <span className="cgpa-saved"><i /> Saved on this device</span>
            <button className="cgpa-theme-toggle" type="button" onClick={() => setDark(!dark)} aria-label={`Switch to ${dark ? "light" : "dark"} mode`}>
              <span className="cgpa-toggle-glyph">{dark ? "☼" : "◐"}</span>
              <span>{dark ? "Light" : "Dark"} mode</span>
            </button>
            <button className="cgpa-reset" type="button" onClick={() => update(sampleState())}>Reset sample</button>
          </div>
        </header>

        <main>
          <section className="cgpa-welcome">
            <div>
              <p className="cgpa-overline">YOUR ACADEMIC PLAN <span>·</span> 4.0 GRADE SCALE</p>
              <h1>Make the next term<br /><em>count toward your goal.</em></h1>
              <p className="cgpa-lede">A clear view of where you are, what you need, and how each course moves the number.</p>
            </div>
            <div className="cgpa-term-count">
              <span className="cgpa-term-count-number">{String(state.semesters.length).padStart(2, "0")}</span>
              <span>completed<br />semesters</span>
            </div>
          </section>

          <section className="cgpa-metrics" aria-label="CGPA summary">
            <article className="cgpa-metric cgpa-metric-primary">
              <div className="cgpa-metric-label">Current CGPA <span className="cgpa-info" title="Quality points divided by completed credit hours">i</span></div>
              <div className="cgpa-metric-number">{fmt(metrics.currentCumulativeGpa)}<small> / 4.00</small></div>
              <div className="cgpa-meter" aria-label="Current CGPA on a 4 point scale"><span style={{ width: `${((metrics.currentCumulativeGpa ?? 0) / 4) * 100}%` }} /></div>
              <div className="cgpa-metric-foot">{metrics.totalCreditsEarned.toFixed(1)} credits completed</div>
            </article>
            <article className="cgpa-metric">
              <div className="cgpa-metric-label">Your target</div>
              <label className="cgpa-target-input">
                <input
                  aria-label="Target CGPA"
                  type="number"
                  min="0"
                  max="4"
                  step="0.01"
                  value={state.target.targetCgpa}
                  onChange={(event) => setTarget("targetCgpa", event.target.value)}
                  onBlur={handleNumberBlur}
                  data-key="targetCgpa"
                />
                <span>/ 4.00</span>
              </label>
              <div className="cgpa-metric-foot">Final CGPA at graduation</div>
            </article>
            <article className={`cgpa-metric cgpa-required ${status.kind}`}>
              <div className="cgpa-metric-label">Required remaining GPA</div>
              <div className="cgpa-metric-number">{fmtRequired(metrics.requiredFutureGpa)}<small> / 4.00</small></div>
              <div className={`cgpa-status ${status.kind}`}><span className="cgpa-status-dot" />{status.label}</div>
              <div className="cgpa-metric-foot">Across {Math.max(0, metrics.remainingCreditsToGraduation).toFixed(0)} credits to graduation</div>
            </article>
          </section>

          <section className="cgpa-main-grid">
            <section className="cgpa-panel cgpa-chart-panel" aria-labelledby="trajectory-title">
              <div className="cgpa-panel-heading">
                <div>
                  <p className="cgpa-overline">THE BIG PICTURE</p>
                  <h2 id="trajectory-title">Semester GPA trajectory</h2>
                </div>
                <div className="cgpa-chart-legend"><span className="cgpa-legend-line" /> Semester GPA <span className="cgpa-legend-dash" /> Target</div>
              </div>
              <div className="cgpa-chart-wrap">
                {state.semesters.length ? (
                  <svg className="cgpa-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Semester GPA chart with target line">
                    {[0, 1, 2, 3, 4].map((value) => {
                      const y = chart.padY + ((4 - value) / 4) * (chart.height - chart.padY * 2);
                      return <g key={value}><line x1={chart.padX} x2={chart.width - chart.padX} y1={y} y2={y} className="cgpa-gridline" /><text x="4" y={y + 4} className="cgpa-axis-label">{value.toFixed(1)}</text></g>;
                    })}
                    <line x1={chart.padX} x2={chart.width - chart.padX} y1={chart.targetY} y2={chart.targetY} className="cgpa-target-line" />
                    <text x={chart.width - chart.padX} y={chart.targetY - 7} textAnchor="end" className="cgpa-target-label">GOAL {fmt(metrics.goal)}</text>
                    {chart.points.length > 1 && <polyline points={chart.path} className="cgpa-trend-line" />}
                    {chart.points.map((point, index) => (
                      <g key={`${point.name}-${index}`}>
                        <circle cx={point.x} cy={point.y} r="6" className="cgpa-point" />
                        <text x={point.x} y={chart.height - 2} textAnchor="middle" className="cgpa-axis-label">{point.name.length > 15 ? `${point.name.slice(0, 13)}…` : point.name}</text>
                        <text x={point.x} y={point.y - 12} textAnchor="middle" className="cgpa-point-label">{fmt(point.gpa)}</text>
                      </g>
                    ))}
                  </svg>
                ) : (
                  <div className="cgpa-chart-empty">Add a semester to see your GPA trajectory.</div>
                )}
              </div>
              <p className="cgpa-chart-note">Each point is the credit-weighted GPA for that semester. The dotted line marks your final CGPA target.</p>
            </section>

            <aside className="cgpa-panel cgpa-plan-panel" aria-labelledby="plan-title">
              <div className="cgpa-panel-heading">
                <div><p className="cgpa-overline">THE CALCULATION</p><h2 id="plan-title">Plan assumptions</h2></div>
                <span className="cgpa-verified"><span /> 4.0 scale</span>
              </div>
              <p className="cgpa-status-copy">{status.copy}</p>
              <div className="cgpa-setting-row">
                <label htmlFor="degree-credits">Total degree credits</label>
                <div className="cgpa-setting-input"><input id="degree-credits" data-key="graduationCredits" aria-label="Total degree credits" type="number" min="1" max="1000" step="1" value={state.target.graduationCredits} onChange={(event) => setTarget("graduationCredits", event.target.value)} onBlur={handleNumberBlur} /><span>cr</span></div>
              </div>
              <div className="cgpa-setting-row">
                <label htmlFor="remaining-terms">Semesters remaining</label>
                <div className="cgpa-setting-input"><input id="remaining-terms" data-key="remainingSemesters" aria-label="Semesters remaining" type="number" min="0" max="20" step="1" value={state.target.remainingSemesters} onChange={(event) => setTarget("remainingSemesters", event.target.value)} onBlur={handleNumberBlur} /><span>terms</span></div>
              </div>
              <div className="cgpa-plan-detail">
                <div><span>Quality points needed</span><strong>{metrics.targetTotalQualityPoints.toFixed(1)}</strong></div>
                <div><span>Credits still needed</span><strong>{Math.max(0, metrics.remainingCreditsToGraduation).toFixed(1)}</strong></div>
                <div><span>Avg. credits per term</span><strong>{fmt(metrics.averageCreditsPerRemainingSemester, 1)}</strong></div>
              </div>
              <div className="cgpa-footnote"><span className="cgpa-footnote-mark">i</span><p>Required GPA = (target × degree credits − quality points earned) ÷ credits remaining. Always confirm your school’s repeat and rounding rules.</p></div>
            </aside>
          </section>

          <section className="cgpa-panel cgpa-record-panel" aria-labelledby="record-title">
            <div className="cgpa-panel-heading cgpa-record-heading">
              <div>
                <p className="cgpa-overline">YOUR ACADEMIC RECORD</p>
                <h2 id="record-title">Completed semesters <span className="cgpa-count">{state.semesters.length}</span></h2>
                <p className="cgpa-panel-subtitle">Edit your transcript; every change updates your CGPA instantly.</p>
              </div>
              <button type="button" className="cgpa-add-button" onClick={addSemester}><span>+</span> Add semester</button>
            </div>
            <div className="cgpa-semesters">
              {state.semesters.length ? state.semesters.map((semester, semesterIndex) => {
                const summary = courseGpa(semester.courses);
                return (
                  <article className="cgpa-semester" key={semester.id}>
                    <div className="cgpa-semester-head">
                      <div className="cgpa-semester-title">
                        <span className="cgpa-semester-number">{String(semesterIndex + 1).padStart(2, "0")}</span>
                        <input aria-label="Semester name" value={semester.name} onChange={(event) => setSemesterName(semester.id, event.target.value)} />
                      </div>
                      <div className="cgpa-semester-summary"><strong>{fmt(summary.gpa)}</strong><span>GPA</span><i />{summary.credits.toFixed(1)} credits</div>
                      <button type="button" className="cgpa-remove-term" onClick={() => removeSemester(semester.id)} aria-label={`Remove ${semester.name}`}>Remove</button>
                    </div>
                    <div className="cgpa-course-grid cgpa-course-header"><span>COURSE</span><span>CREDITS</span><span>GRADE</span><span>POINTS</span><span /></div>
                    {semester.courses.length ? semester.courses.map((course) => (
                      <div className="cgpa-course-grid cgpa-course-row" key={course.id}>
                        <input aria-label="Course name" value={course.name} placeholder="Course name" onChange={(event) => setCourse(semester.id, course.id, "name", event.target.value)} />
                        <input aria-label={`${course.name || "Course"} credit hours`} type="number" min="0" max="1000" step="0.5" value={course.creditHours} onChange={(event) => setCourse(semester.id, course.id, "creditHours", event.target.value)} />
                        <select aria-label={`${course.name || "Course"} grade`} value={course.gradeEarned} onChange={(event) => setCourse(semester.id, course.id, "gradeEarned", event.target.value)}>
                          {GRADES.map((grade) => <option value={grade} key={grade}>{grade} · {GRADE_POINTS[grade].toFixed(1)}</option>)}
                        </select>
                        <span className="cgpa-quality-points">{((Number(course.creditHours) || 0) * GRADE_POINTS[course.gradeEarned]).toFixed(1)} <small>pts</small></span>
                        <button type="button" className="cgpa-delete-course" aria-label={`Remove ${course.name || "course"}`} onClick={() => removeCourse(semester.id, course.id)}>×</button>
                      </div>
                    )) : <p className="cgpa-empty-term">No courses yet. Add completed coursework to begin your calculation.</p>}
                    <button type="button" className="cgpa-add-course" onClick={() => addCourse(semester.id)}>+ Add course</button>
                  </article>
                );
              }) : (
                <div className="cgpa-empty-record">
                  <div className="cgpa-empty-mark">+</div>
                  <strong>Your record starts here</strong>
                  <p>Add a completed semester to calculate your current CGPA.</p>
                  <button type="button" className="cgpa-add-button" onClick={addSemester}><span>+</span> Add first semester</button>
                </div>
              )}
            </div>
          </section>

          <footer className="cgpa-footer">
            <span><strong>Private by default.</strong> Your edits stay on this device.</span>
            <span>A 4.0 · B+ 3.5 · B 3.0 · C+ 2.5 · C 2.0 · D+ 1.5 · D 1.0 · F 0.0</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
