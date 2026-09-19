# DDS/112 Frontend

Frontend scaffold for a DDS/112 operator training application.
React, TypeScript, Vite, React Router, MUI, SCSS, Zustand, ky and TanStack Query.

## Run

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run lint
npm test
npm run test:watch
```

Authentication requires the backend. `VITE_API_URL` is
optional and defaults to `/api/v1`. `.env.example` lists the configuration;
local `.env` files are ignored by Git. Vite exposes `VITE_*` values to the
browser, so these values must not contain secrets.

## Structure

```text
src/
  app/        Providers, layouts, route composition, theme, global styles
  pages/      Route-level screens
  widgets/    Composite UI blocks
  features/   User actions
  entities/   Domain models and entity UI
  shared/     Configuration, HTTP client and reusable UI
```

Dependencies point down: `app -> pages -> widgets -> features -> entities -> shared`.
Layers may skip intermediate layers. Import another slice through its `index.ts`;
use relative imports within a slice. Shared code must not import application or
domain code. `@/` points to `src/` in Vite, TypeScript and Vitest.

Business screens currently use explicit demonstration fixtures. Their frontend
types are provisional UI models, not backend DTOs or authentication policies.
Unused business folders are still reserved with `.gitkeep` files.

## Routes and UI

- `/`: redirects to the signed-in user's dashboard, or to sign-in for guests.
- `/login`: backend sign-in by username and password.
- `/change-password`: mandatory initial password replacement.
- `/student`, `/teacher`, `/admin`: demonstration dashboards.
- `/student/sessions/:sessionId`: the student's assigned or active training workspace.
- `/scenarios`: searchable scenario list; `/scenarios/new` and
  `/scenarios/:scenarioId/edit`: local scenario editor.
- `/training` and `/training/:sessionId`: sessions and their details.
- `/results` and `/results/:sessionId`: completed sessions and score breakdowns.
- `/sessions`: session monitoring with search and status filters.
- `/users`: user search, role filtering and a read-only user card.
- `/analytics`: statistics calculated from the same demonstration records.
- `/403`, `/404`, `/500`: service pages with a link home.
- Unknown paths: the 404 page.

Path constants live in `shared/config/routes.ts` so lower layers can use them.
The route tree lives in `app/router/routes.ts`. `MainLayout` and `AuthLayout`
render child pages through `Outlet`. `RouteErrorBoundary` handles route errors.

Reusable UI: `PageHeader`, `EmptyState`, `LoadingScreen`, `ErrorState`,
and a controlled `ConfirmDialog`. Components use semantic markup and existing
MUI defaults. `global.scss` and component overrides are reserved for later design.

## Demonstration Data

Fixtures live alongside their owners in `entities/scenario`, `entities/user`
and `entities/training-session`. `useDemoScenarioStore` supports creating and
editing scenarios in memory. Changes remain available while navigating and reset
on a full reload. Other demonstration records are read-only. The demo banner is
shown on every business screen.

The student dashboard uses the signed-in demonstration account. Students can open
only their own sessions and results; completed sessions link to the result page.
Unknown or inaccessible record IDs show an unavailable-record state.

Card drafts are stored in browser localStorage separately for each session and
card. Existing single-card drafts remain readable. Older free-text addresses are
restored in the descriptive address field, districts in the district field, and
caller phone numbers in the provided phone field. Street and house must be
specified before submitting these older cards. Submitting a card removes only
its draft and locks that card for the current workspace visit. Newly created cards,
action logs, submission state, call status and timer are stored separately in the
browser for each session. Completing a training session creates a local automatic
evaluation and makes it available in results and analytics. These local records
can be reset by clearing browser storage.

Replacing fixtures with API hooks should keep page composition and navigation
intact; define actual request/response types only after the backend contract is known.

## Authentication

Authentication uses the real FastAPI contract: login, refresh, password change,
logout and `GET /api/v1/users/me`. The login identifier is `username`, not email.
There is no demonstration password or mock-auth fallback in the application.

The access/refresh token pair lives in `sessionStorage` for the browser tab;
passwords are never persisted. The user profile and roles stay in memory. Reload
checks the server profile before rendering protected pages. Old `dds112-auth`
localStorage sessions are discarded. Logout revokes the backend session and
clears local credentials and the query cache. A rejected refresh signs out;
a temporary server/network error offers retry without discarding the session.

Initial passwords require replacement before accessing business routes. Teacher
and administrator permissions are independent; administrators do not inherit
teaching rights. Authentication does not connect the demonstration business
screens to the lesson/user-management API.

See [the integration contract and Docker checks](docs/AUTH.md).

## API Integration

`shared/api` exposes `api`, `getApiError` and `ApiErrorInfo`.
The ky client has a URL prefix, a 10-second timeout and no automatic retries;
TanStack Query owns retry policy. Creating the client does not send requests.
Authentication calls `backendApi`, which always uses the real backend. The older
`api` client still serves demonstration business resources when
`VITE_USE_FAKE_API=true`; this switch cannot enable mock authentication.

This project uses ky 2 and its `prefix` option; examples using the older
`prefixUrl` option do not apply. See the [ky release notes](https://github.com/sindresorhus/ky/releases).

Add DTOs and requests to the owning entity or feature when the backend contract
is available. Pass Query's abort signal to ky from query functions. Keep business
requests out of the shared transport module.

## Adding a Screen

1. Add the screen and an `index.ts` to its reserved folder in `pages/`.
2. Add the path to `shared/config/routes.ts` and register it in `app/router/routes.ts`.
3. Compose widgets, features and entities through their public exports.
4. Add data fetching and authentication only after their contracts are known.

Production hosting must serve `index.html` for frontend routes so direct links
and page reloads work with browser history routing.

## Next Development Steps

1. Connect the remaining backend contracts for session ownership, incident
   cards, action logs and submission. Persist the complete session state and
   enforce role and record access on the server.
2. Connect the training flow from accepting a call through submission to a saved
   result. Use one evaluation model across results, monitoring and analytics;
   the additional evaluation/chart fixtures are not yet integrated into this flow.
3. Add browser end-to-end checks for each role, session recovery after reload,
   and submission failures once these contracts are implemented.
