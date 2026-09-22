# Features

User actions live here: authentication, card authoring/generation, catalog editing,
lesson launch/review, student profiles and incident editing. Each slice exposes
its public API through `index.ts` and imports only `entities` and `shared`.
Pages/widgets compose independent features; features never import one another.

Use `ui`, `model`, `api`, `lib`, `types` and `styles` segments according to
[the mandatory FSD rules](../../docs/FRONTEND_ARCHITECTURE.md).
`demo-training` and `scenario-management` retain the isolated local demonstration
flow; the current application uses the backend through `entities/training`.
