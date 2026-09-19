# Features

Add user actions here once their requirements are known, for example signing in
or starting a training session. Each feature exposes its public API through
`index.ts` and may import from `entities` and `shared`.

`scenario-management` currently contains a validated scenario form for local
demonstration records. It receives a save callback and does not call an API.

API payloads, authorization policies and authentication storage remain undefined
until the backend contract is available.
