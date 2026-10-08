# Two-shot search V1: first implementation

`src/search-v1.js` connects the existing isolated simulator to the normal-shot rules evaluator. It generates direct-pot candidates, simulates them, rejects fouls and failed intended pots, and evaluates a second shot from the **complete actual final snapshot** of selected successful first shots. It does not reuse the existing teaching UI's CB2 approximation. All calculations run locally without new runtime packages or network requests.

This is a search foundation, not a complete coaching release. Neither this module nor the rules module is activated in the trainer page yet.

## Invocation

Load `src/rules-v1.js`, then `src/search-v1.js` for the browser globals; CommonJS can require the search module directly.

```js
const controller = new AbortController();
const result = await BTHintsSearch.search(
  window.__BT_SIMULATION__.evaluate,
  window.__BT_SIMULATION__.capture(),
  {
    profile: 'wpa-9ball-normal-v1', phase: 'normal', frozenBallIds: [],
    consecutiveFouls: 0, warnedOnTwo: false
  },
  { signal: controller.signal }
);
```

For 8-ball supply `profile: 'wpa-8ball-normal-v1'`, `phase: 'normal'`, `frozenBallIds: []`, and `shooterGroup: null|'solids'|'stripes'`. The search supplies each candidate's own called ball/pocket; caller call/safety declarations are not constraints on this all-direct-pot search. Foul history and groups must describe the actual shooter.

`generateCandidates(snapshot, state)` exposes the same deterministic generation without running physics. Search returns `status`, `reasonCode`, up to five `recommendations`, and diagnostics. `unsupported` means the supplied state falls outside this version; `no-shot-found` means this limited search found no verified direct pot, not that the layout is impossible. `cancelled` always has an empty recommendation list.

Each recommendation contains the tested `candidate` (aim, speed, spin, called pocket, route measurements), rules `outcome` including exact resulting state, optional `nextShot`, and `continuationStatus`. A missing second shot must never be displayed as a verified two-shot plan. A result with `continuationStatus: 'not-searched'` may simply be outside the beam/budget. Winning first shots do not require continuation.

## Candidate generation and ranking

The generator constructs a ghost-ball contact point for each eligible target/pocket pair and checks both straight paths for obstructing balls. It skips extreme cuts and out-of-bounds contact points, then retains up to eight geometrically easiest routes. Across these it tries speed 1.2/1.8/2.5, follow/draw 0/-0.35/+0.35, and aim offsets 0/-0.4/+0.4 degrees. Side spin and elevation are zero. Variants are interleaved by route; lower budgets sample only part of this grid.

Physics, not the ghost geometry, determines whether a shot succeeds. Every scored first/second shot must be legal and either win the rack or pot its intended ball in its intended pocket while retaining the turn. A legal incidental 9-ball win is accepted even if the intended pot missed. A missed pot that leaves a legal safety is not labeled a successful pocketing recommendation.

Ranking is explicit and provisional:

1. Immediate legal win (`rankTier: 3`).
2. Verified win on the second shot (`rankTier: 2`).
3. Verified second pot (`rankTier: 1`).
4. Verified first pot without a verified continuation (`rankTier: 0`).

Within tiers, a simple heuristic favors shorter paths, smaller cuts, lower speed, and less spin. Local score is `20 - cueDistance - objectDistance - cutAngleDeg/35 - 0.15*speed - 0.2*abs(follow)`; two-shot score adds half the second shot's local score. Distances are meters. Deterministic candidate IDs break ties. Scores are **not success probabilities**, professional coaching judgments, or calibrated difficulty ratings. Only the best few first shots by immediate score receive a second-shot search, so a better unsearched route can be missed.

## Work limits and responsiveness

Defaults: 96 total simulations, up to 48 first candidates, four continuation branches, and up to 12 second candidates per branch. Second candidates are evaluated round-robin across branches. The generator produces at most 216 candidates per state. Options reject noninteger/out-of-range budgets; the total simulation ceiling is 512 even with overrides.

The asynchronous controller yields to the event loop after every four simulations by default. `signal` is checked between evaluations and after yields; cancelled results are discarded. Inputs are captured before the first yield so edits cannot alter an in-progress search. A UI integration must abort on layout/calibration edits and check its request identity before rendering a completed result.

The individual simulator call remains synchronous. Cooperative yielding is not a worker and does not guarantee smooth interaction or Android performance. Simulator failures propagate as errors; they are not silently turned into valid hints. Optional `yieldControl` exists for scheduling/tests, and `yieldEvery` is bounded from 1 to 16.

## Unsupported situations and remaining work

The search inherits the rules module's normal-shot limitations. It additionally rejects layouts with any ball within one millimeter of the cushion contact band, or touching/overlapping balls. The cushion test intentionally covers the whole rectangular boundary, including pocket openings, and may reject playable layouts. This conservative check is repeated at second-shot endpoints before asserting that no balls are frozen. It avoids silently inventing frozen-ball metadata.

No bank/kick generation, planned combinations, jump/masse shots, tactical safety ranking, tolerance-based success estimates, zones, or five-level hint UI are implemented here. Accidental legal combinations are possible in simulated results. The bounded grid/beam is not exhaustive or globally optimal. Spatial tolerance sampling and human coaching priorities need further work before presenting precise advice to players.

## Validation

`node tests/search-v1.cjs` runs 24 checks, including actual simulator two-shot finishes for 8-ball and 9-ball, replay of a selected sequence, deterministic results, state isolation, obstacles, rejected scratches/fouls/turn changes, exact propagation of moved remaining balls, budget enforcement, and cancellation. Synthetic simulator results exercise controller failures and edge cases; real simulator cases are explicitly labeled in the output.

A sample 9-ball layout used 75 simulations in approximately 2.7 seconds in this environment's Node VM. This is not an ordinary-PC/Android performance acceptance result. Re-run timings vary. The existing 54 rules and 15 simulation-interface checks remain separate regression gates. These checks do not replace the planned 20–30 complete coaching acceptance layouts or browser/device tests.
