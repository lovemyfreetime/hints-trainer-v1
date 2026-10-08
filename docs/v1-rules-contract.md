# Hints Trainer V1 rules boundary

Implemented in `src/rules-v1.js`, independently of the trainer UI. This supersedes the earlier draft contract. The module has no runtime dependencies, storage, network calls, or mutations of its inputs. Browser global: `BTHintsRules`; CommonJS exports the same API. It is not yet loaded by the existing trainer page.

## Rules basis and corrections

Reference: [WPA Rules of Play, effective September 15, 2025](https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf), sections 1.7, 2.7, 3.1–3.5, 3.13, 4.4–4.9, and 5.4–5.8.

An opponent's remaining balls do not prevent an 8-ball win. Incidental opponent-ball pots are allowed after legal contact. Open-table assignment follows the legally completed called shot, not pocket order. A non-scoring shot needs a rail after contact. An early, uncalled, fouled, or off-table 8 loses during normal play. A fouled or off-table 9 needs spotting. Three consecutive 9-ball fouls lose only with the required warning. These replace incorrect or incomplete conditions in the previous draft.

## API

```js
const { rules, simulation } = BTHintsRules.evaluateCandidate(
  window.__BT_SIMULATION__.evaluate,
  snapshot,
  { freeAim: { x: 1, y: 0.5 }, speed: 2 },
  {
    profile: 'wpa-8ball-normal-v1',
    phase: 'normal',
    frozenBallIds: [],
    shooterGroup: 'solids', // null on an open table; otherwise solids or stripes
    call: { ballId: 1, pocketId: 'TL' }
  }
);
```

Alternatively, `evaluateRules(snapshot, simulation, state)` evaluates an existing simulation without rerunning physics. Snapshot and result use the `hints-sim-1` interface. The ordered `events` ledger is authoritative; redundant legacy pocket/path arrays are not used.

For 9-ball use `profile: 'wpa-9ball-normal-v1'`, `phase: 'normal'`, `frozenBallIds: []`, `consecutiveFouls: 0|1|2`, and `warnedOnTwo: boolean`. History belongs to the current shooter. The caller must supply known history rather than defaulting unknown history to zero. The warning flag may be true only when the count is two.

For 8-ball provide a called physical ball ID and pocket (`TL`, `TM`, `TR`, `BL`, `BM`, `BR`), or `safety: true` with no call. Ball IDs are actual ball numbers; zero is the cue ball. Missing call information is not interpreted as an unannounced house-rule variant. Calls are candidate metadata; this change adds no called-shot UI.

## Result and search behavior

- `classification`: `continue`, `foul`, `win`, `loss`, or `unusable`. Here `continue` means the rack continues, not necessarily the shooter's inning.
- `legal`: accepted by the supported rules boundary. A legal missed call can pass the turn. A loss or unusable result is never legal.
- `reasonCode`, `fouls`, and `foul`: diagnostics; an uncalled 8 can be a loss without a standard foul.
- `terminal`, `winner`: rack outcome; winner is relative to the shooter.
- `retainsTurn`, `canContinue`: gates for the current shooter's second-shot search. Terminal shots and turn changes stop the rollout.
- `requiredFirstContactIds`, `firstObjectContactId`, `firstContactIds`: eligible and observed initial targets.
- `pocketedObjectIds`, `pocketedCueBall`: preserve actual ledger pocket order.
- `nextRequiredBallId`: next 9-ball target, including a pending respot.
- `resultingState`: independent copy of the simulator's exact raw final snapshot. Never restores the scratched cue or invents a spotted ball position.
- `respotBallIds`, `ballInHand`: work for the game controller before another player shoots.
- `nextShooterState`: updated group and foul history for this shooter, not the opponent's state. Call/safety and frozen-ball metadata are removed: reassess the new table and provide the next candidate's declaration.

A scorer must check `legal`, then treat wins separately, and use `canContinue` before starting the second-shot rollout. Do not feed the prior shooter's group/history into the opponent's turn. A raw physical endpoint with a respot pending is not a ready-to-play layout.

## Conservative boundaries

Only normal shots are supported. Breaks, push-outs, declared frozen-ball situations, and the unusual open-table case with an entire group already absent return `unusable`. The latter requires an explicit temporary-group-claim workflow that is not implemented. `frozenBallIds: []` is a caller assertion based on the current layout, not permission to skip checking cushions. No automatic spotting or cue placement is provided.

This is simulated shot legality, not a referee for physical stroke violations such as double hits, touched balls, feet, or player conduct. No full match controller is present. The timestamp granularity is 1/600 second; the module treats same-step contact/rail events as simultaneous and allows a legal target among same-step first contacts. This is an explicit approximation, not a claim of sub-step precision.

Incomplete, inconsistent, unknown-profile, or unsettled inputs return `unusable`. Removed balls must match the final snapshot; first-contact metadata must match the event ledger. Input positions are assumed to come from the validated simulator interface; this module does not duplicate its calibration/geometry validation.

## Verification and remaining work

Run `node tests/rules-v1.cjs` and `node tests/simulation-interface.cjs`. The rules suite has 54 checks: synthetic event cases for both profiles plus three fixed layouts executed through the actual simulator. It checks input immutability and determinism, incorrect contacts, turn changes, call assignment, scratches, endgames, foul history, malformed ledgers, and unsupported states. The separate 15-check simulator suite verifies physics parity and state isolation.

These tests are not the frozen V1 requirement for 20–30 complete coaching acceptance layouts. Browser/device tests, candidate generation/ranking, two-shot coaching rollout, position zones, five hint levels, and distribution isolation remain future integration work. Nothing in this change alters the original repository or activates a new trainer UI.
