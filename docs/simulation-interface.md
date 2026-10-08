# Isolated simulation interface — first implementation

The hint evaluator now calls the existing simulator with a copied, versioned snapshot. It does not call UI refresh, storage, animation or network APIs. A synchronous `try/finally` adapter temporarily binds the simulator's shared state and restores the exact original reference, including on exceptions. This is an interim interface, not a worker/pure-engine extraction or a responsiveness guarantee.

```js
const snapshot = window.__BT_SIMULATION__.capture();
const result = window.__BT_SIMULATION__.evaluate(snapshot, {
  freeAim: { x: 1.5, y: 0.5 }, speed: 2.0, follow: 0, sideSpin: 0
}, { recordPaths: true, recordFrames: false });
// Only consider a continuation if result.usable; game legality is a separate future check.
const continuation = result.usable
  ? window.__BT_SIMULATION__.evaluate(result.finalState, nextShot)
  : null;
```

`capture` copies physical balls, all state-dependent calibration used by the simulator, aim and stroke settings. Markers and UI state are excluded. `hints-sim-1` identifies constants and contract; bump it when the engine contract/constants change. Physical snapshots and results are ordinary serializable data. Inputs must have finite supported calibration/stroke values and unique ball IDs. Invalid inputs throw before live state is changed. This API evaluates shots from rest, not mid-flight states.

Results retain the existing final-ball, contact and pocket data and add:

- `settled`, `terminationReason` (`settled`, `time-limit`, `missing-cue-ball`) and simulated `duration`.
- `events`: ball contacts, cushion hits, jaw hits, pocket events with pocket ID, and airborne off-table exits. Timestamps use the existing integration-step convention; simultaneous events follow solver order, not sub-step continuous-time ordering. Bed bounces remain in the existing airborne result.
- `finalVelocities` for termination inspection.
- `finalState`: actual remaining object balls and cue, carrying calibration forward. Scratched cue balls are not restored. Capped results must not be used as resting states.
- `usable`: settled with cue remaining; this means usable as a numerical continuation, **not game-legal or strategically good**. The future rules layer must reject fouls, including object balls off-table.

Paths and frames default off for candidate evaluation; existing preview/animation callers keep their prior recording defaults. Final animation frames now contain exact final coordinates, and the animation commit reads `finalBalls`. Execute Shot refuses to commit an unsettled simulation. No coaching UI, rules engine or installer identity changes are included.

The jaw helper no longer accesses a variable outside its scope. The simulator owns jaw-event recording. Physics equations, time step and physical constants are unchanged.

Validation: `node tests/simulation-interface.cjs` passes 15 focused checks: existing numerical self-tests; seven old-engine parity layouts; jaw-contact execution; time-cap rejection and terminal frames; immutable snapshots and complete second-shot tables; scratch/pocket/no-cue output; invalid input; exception restoration; and final-state animation commit with a deliberately stale sample. Every inline script also passes syntax compilation. Tests load verbatim source functions in a Node VM and compare against Git commit `15c6c76` (must exist locally). UI helpers are stubbed only for the final animation-commit unit test. These are not browser interaction, physical-table, offline-installation or Android performance acceptance tests.

Still pending: full browser/device regression, event/rules edge cases (including simultaneous contacts), cancellation/worker integration, game rules, candidate search, zone construction and five-level coaching UI. Existing CB2 teaching UI is unchanged; the new evaluator supports true sequential table propagation independently.
