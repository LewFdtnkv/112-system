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

The app starts without a backend or an environment file. `VITE_API_URL` is
optional and defaults to `/api`. `.env.example` lists the configuration;
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
- `/login`: demonstration sign-in form.
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

`entities/user` exposes `useAuthStore`: `anonymous`, `checking`, or
`authenticated`. Actions are `startChecking`, `setSession` and `clearSession`.
The store persists only the `AuthSession` in browser `localStorage` under
`dds112-auth`; it contains a user ID and roles, never a password. It has a
version so a future incompatible session shape can be replaced safely.

`/login` validates email and password, then signs in one of the demonstration
accounts. The current demonstration password is `demo112`; its value is visible
only to make the prototype usable and must be removed with the mock login code.
On success the form returns to the guarded location when its internal path is
safe, otherwise it opens the home page. The header identifies the active account
and its exit action clears the cached session.

`ProtectedRoute` waits during a session check and redirects guests to `/login`,
preserving the requested location in `state.from`. `RoleRoute` first requires
authentication and then accepts any matching role from its `allowedRoles` prop;
otherwise it redirects to `/403`. An empty allowed-role list denies access.

Business routes use role guards: students access their dashboard and workspace;
teachers and administrators access scenarios, training, monitoring and analytics;
only administrators access users and administration. Results require sign-in and
are filtered to the student's own sessions. Navigation follows the same roles.
There is no real token, refresh flow or HTTP 401 policy. These
depend on the authentication contract. When that contract exists, replace the
demonstration credential check in `features/auth`, map the response to frontend
state and clear the QueryClient cache on account changes. Access control also
belongs on the server.

## API Integration

`shared/api` exposes `api`, `getApiError` and `ApiErrorInfo`.
The ky client has a URL prefix, a 10-second timeout and no automatic retries;
TanStack Query owns retry policy. Creating the client does not send requests.
No screen currently calls the API. Error normalization does not assume a backend
error payload format.

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

1. Agree on backend contracts for authentication, session ownership, incident
   cards, action logs and submission. Persist the complete session state and
   enforce role and record access on the server.
2. Connect the training flow from accepting a call through submission to a saved
   result. Use one evaluation model across results, monitoring and analytics;
   the additional evaluation/chart fixtures are not yet integrated into this flow.
3. Add browser end-to-end checks for each role, session recovery after reload,
   and submission failures once these contracts are implemented.
