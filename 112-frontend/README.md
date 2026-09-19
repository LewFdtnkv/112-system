# DDS/112 Frontend

React, TypeScript, Vite, React Router, MUI, Zustand, ky and TanStack Query.
The frontend uses the current FastAPI backend for authentication and training.

## Run and verify in Docker

```sh
docker run --rm -p 5174:5173 -v "$PWD":/app -v system112-design-node-modules:/app/node_modules -w /app node:24-bullseye-slim sh -c 'npm ci && npm run dev -- --host 0.0.0.0'
docker run --rm -v "$PWD":/app -v system112-design-node-modules:/app/node_modules -w /app node:24-bullseye-slim npm run build
docker run --rm -v "$PWD":/app -v system112-design-node-modules:/app/node_modules -w /app node:24-bullseye-slim npm run lint
docker run --rm -v "$PWD":/app -v system112-design-node-modules:/app/node_modules -w /app node:24-bullseye-slim npm test -- --maxWorkers=2
docker run --rm -v "$PWD":/app -v system112-design-node-modules:/app/node_modules -w /app -e PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ms-playwright/chromium-1234/chrome-linux/chrome mcr.microsoft.com/playwright:v1.62.1-noble npm run test:e2e -- --workers=2 --grep-invert 'real API:'
```

Run these commands in the frontend directory. Node runs in Docker only.
The development proxy defaults to `http://host.docker.internal:8000`;
`API_PROXY_TARGET` overrides it. `VITE_API_URL` defaults to `/api/v1`.
Local `.env` files are ignored. No secret belongs in a `VITE_*` variable.
Apply backend migration `0006_frontend_scenarios` before using this integration.

## Structure

```text
src/
  app/        Providers, layouts, routes, theme and global styles
  pages/      Route-level screens
  widgets/    Composite UI blocks and lesson tables
  features/   Authentication, lesson launch, review and incident editing
  entities/   Domain types, real training DTOs and API requests
  shared/     HTTP transport, configuration and reusable ARM controls
```

Dependencies point down: `app -> pages -> widgets -> features -> entities -> shared`.
Import another slice through its `index.ts`. Shared code does not import domains.
The current frontend uses MUI and `shared/ui/arm`; it does not depend on `112-ui`.

## Implemented routes

- `/login`, `/change-password`: backend authentication and mandatory replacement.
- `/student`: the account's own assigned lessons and results.
- `/student/sessions/:sessionId`: operator 112 workspace with server drafts,
  classifier search, calculated recipients and sequential card submission.
- `/teacher`, `/sessions`: own lessons, progress and latest teacher scores.
- `/groups`, `/cards`: group membership and the teacher's card library.
- `/scenarios`, `/scenarios/new`, `/scenarios/:scenarioId/edit`: composed scenarios;
  editing creates a new version and preserves assigned versions.
- `/training`, `/training/:sessionId`: group/single-student launch and monitoring.
- `/results`, `/results/:sessionId`: own student results or teacher review and grading.
- `/analytics`: aggregates from real submitted work and latest teacher evaluations.
- `/admin`, `/users`, `/catalogs`: account administration, services and JSON EKP publication.
- `/403`, `/404`, `/500`: service pages. Unknown paths show 404.

Teacher and administrator rights are independent. All business requests use the
real backend; there is no fake API switch. Server-side ownership is authoritative.
Legacy demonstration models remain only for isolated examples/tests and are not
used by the training pages. Old browser drafts are not imported into real accounts.

The backend currently supports operator 112 execution and manual teacher grading.
DDS execution, SIP, AI grading, conditional EKP routing, automated hints and timeout
completion remain unavailable. Scores are never generated locally. Work without
an evaluation shows “Ожидает проверки”. Training notifications do not call real services.

See [the API integration](docs/API.md), [authentication](docs/AUTH.md), and
[backend page contracts](../112-backend/docs/FRONTEND_API.md).

## Browser integration checks

`e2e/integration-real.spec.ts` requires `AUTH_ISOLATED_API=true` and a disposable,
migrated backend reached through `API_PROXY_TARGET`. It creates users and teaching
objects and changes the bootstrap password if necessary. Never point it at user
data. The ordinary browser suite uses explicit HTTP fixtures. The real integration
and backend pytest must use separate test databases.

The ARM journal/card layout follows the provided system screenshots. Reviewed
images of the real flow are in `docs/screenshots/api-*.png`. Static card elements
are not selectable; input text remains selectable. Navigation uses full-block links.
