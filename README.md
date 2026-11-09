# Studyline CGPA Target Simulator

Studyline is a responsive, offline-capable academic planning app that helps university students track cumulative GPA and understand what grades they need in the semesters ahead. Students can enter completed courses, set a graduation goal, and test hypothetical courses without risking their saved plan.

## What the app does

- Calculates course quality points, semester GPA, and cumulative GPA from credit hours and grades.
- Uses a default 4.0 scale: A (4.0), B+ (3.5), B (3.0), C+ (2.5), C (2.0), D+ (1.5), D (1.0), F (0.0). Grade points can be adjusted to match a university's scale.
- Estimates the average GPA needed across remaining degree credits to reach a target CGPA. It flags targets that are mathematically out of reach or comparatively easy to achieve.
- Lets students organize semesters and courses, adjust credit hours and grades, and add hypothetical courses for instant what-if projections.
- Displays semester GPA history and the target in an interactive Chart.js trajectory chart.
- Saves plans on the device, supports JSON export/import, and provides a printer-friendly summary.
- Supports a responsive layout, light and dark themes, an installable web-app manifest, and a gentle idle page-scroll tour that stops when the user interacts.

## GPA calculation model

For each course:

```text
Quality points = credit hours × grade points
```

For a semester or completed degree plan:

```text
GPA = total quality points ÷ total credits
```

The target calculation compares the quality points required for the selected graduation CGPA with the quality points already earned. Hypothetical courses are included in projected results and subtracted from the credits remaining to graduate.

The calculation logic is shared from `lib/cgpa-calculations.js` so the web and mobile planners can use the same credit weighting and boundary rules.

## Technology

| Area | Technology |
| --- | --- |
| UI framework | React 19, with a small React mount shell and a JavaScript-driven simulator |
| Build and development | Vite 7 |
| Styling | Tailwind CSS 4, custom CSS, and HTML5 |
| Languages | JavaScript (ES modules), TypeScript/TSX, HTML, CSS, and JSON |
| Charts | Chart.js 4, bundled locally |
| Local persistence | Dexie.js 4 over browser IndexedDB, with a `localStorage` fallback |
| Offline support | Service Worker API and Cache Storage API; the production build precaches the app shell, bundles, fonts, manifest, and icons |
| Browser APIs | IndexedDB, `localStorage`, Service Workers, Cache Storage, File/Blob, `window.print`, `matchMedia`, and animation/timer APIs |

### API and backend

The CGPA simulator does **not** require a third-party API, account, or backend server. GPA calculations, theme preferences, and saved plans run in the browser. Dexie uses the browser's IndexedDB API for local storage; a legacy `localStorage` path is retained as a fallback. JSON import/export uses browser file APIs.

The workspace also contains an API-server artifact, but the CGPA simulator does not depend on it for its core flows.

## Offline behavior

The app is an installable Progressive Web App. After the first successful online load, its service worker can serve the app shell and locally bundled assets offline. The production build precaches the JavaScript and CSS bundles, chart code, local fonts, manifest, and icon variants. The development service worker also precaches the theme and install icons and caches other same-origin assets as they are loaded.

Saved course plans and theme preferences are stored on the device, so calculations and theme switching do not need a network connection. A first visit still needs internet access so the browser can download the app and install its service worker.

## Repository map

- `artifacts/cgpa-target-simulator/` — Studyline web app, PWA manifest, service worker, UI, storage, and tests.
- `lib/cgpa-calculations.js` — Shared GPA and target calculation functions.
- `artifacts/cgpa-target-mobile-app/` — Companion mobile app.
- `artifacts/api-server/` — Separate workspace API-server artifact; not required by the web simulator.
- `artifacts/cgpa-target-film/` — Project animation/video artifact.

## Run locally

Requirements: Node.js 24 and pnpm.

```bash
pnpm install --frozen-lockfile
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/cgpa-target-simulator run dev
```

The Vite configuration requires both `PORT` and `BASE_PATH`. For a production build:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/cgpa-target-simulator run build
```

## Quality checks

```bash
pnpm --filter @workspace/cgpa-target-simulator run typecheck
pnpm --filter @workspace/cgpa-target-simulator run test
```

The tests cover GPA weighting, target boundaries, scenario credits, plan import validation, persistence migration, and consistency between web and mobile calculations.
