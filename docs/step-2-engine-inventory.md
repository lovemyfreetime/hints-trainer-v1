# Hints Trainer V1 — Step 2 engine inventory

Status: inventory and initial numerical baseline complete; ready for review. This is not V1 acceptance or a claim that the application is defect-free.

Audited baseline: `15c6c76fe5aaadca507313de56a124291992881c` in `lovemyfreetime/hints-trainer-v1`. All five copied branches matched the original before this audit. Original repository receives no changes. Scope authority: the approved conversation freezes 8-ball and 9-ball, current shot plus next-shot position (two-shot horizon), offline coaching, four position-zone families, five additive hint levels, and the existing simulator. The inherited `live-hint-planner-source-audit.md` proposes four-shot search; it is historical research, not V1 scope authority.

## Reuse and gaps against the frozen scope

| Requirement | Existing implementation | V1 work needed |
|---|---|---|
| Table and pocket geometry | `pocketModel`, `logicalPockets`, `openSpans`, `jawSegments`; physical dimensions in metres | Reuse one geometry source. Validate pocket approach angles/speeds and traffic through simulation. |
| Ball and cushion physics | `simulate`, cloth slide/roll, rail response, throw, squirt, follow/draw, side spin, optional airborne mode | Reuse engine; repair interface/event defects below. Numerical self-tests do not validate all real-world physics. |
| Legal 8-ball / 9-ball shots | Rack/setup mode, numbered balls, pocket tray, manual score and turn state | No complete referee/legality module found. Add group/open-table state for 8-ball, lowest-ball-first for 9-ball, endgame handling, scratch/foul checks, and an explicit rules profile. Rules variant details remain to be specified in rules/test design. Photo-identification legal IDs are not shot legality. |
| Deterministic coaching | Manual aiming, bank/kick geometry tools, teaching power estimates | No installed candidate search/ranker or next-shot coaching engine found. Build candidate evaluation and human-principle scoring. |
| Current plus next shot | CB2 preview and controls | CB2 context copies current object balls, not Shot 1 final object-ball positions/removals. Feed the entire resulting table into continuation evaluation. |
| Meaningful zones | Nonphysical circular practice markers, diameter controls, table/projector mapping | Preserve instructor markers; derive coach zones from useful tested continuations. Lanes, wedges and irregular safe regions are absent. |
| Five additive hints | Existing trajectories, ghost/tangent visuals and stroke controls | Add ownership, level progression, recommendation state and explanation text. Existing visual controls are building blocks, not the five-level feature. |
| Demonstration | `animateShot` calls `simulate(true)`; preview calls `simulate(false)` | Share verified shot parameters. Commit exact final state, not merely last sampled frame; reject unfinished simulations. |
| Offline | Core numerical functions work without DOM/network in this audit; same-origin service worker present | Cache/verify all required coaching assets. Existing optional photo analysis loads ONNX runtime from CDNs, and feedback uses external services; offline coaching must not depend on those paths. |
| Responsiveness | Synchronous simulation, fixed dt=1/600, 20-second cap, paths always recorded | Pure snapshot interface, optional path/frame collection, worker or cooperative scheduling, cancellation and versioning. Benchmark real PC and Android hardware before budgets are fixed. |
| Regression/release | Undo, saved runs/layouts, projector, wrappers and installer files | Define 20–30 fixed acceptance layouts and regression checklist. Separate app identity, persistence and installer destinations before installing development builds. |

## Actual simulation contract

`simulate(makeFrames=false)` reads shared `S`, clones active non-marker balls, and returns:

- `paths`: per-ball sampled x/y/z/time; generated even when frames are disabled.
- `frames`: sampled ball id/x/y/z/active, only when requested.
- `firstEvent`: display string, not an event ledger.
- `firstBallContact`: first cue/object contact with object ID, normal, incoming direction, cut/overlap, position, distance and time; airborne fields when applicable.
- `pocketEvents`: id/x/y/time/speed, without explicit pocket identity.
- `airborne`: optional takeoff/landing/clearance information.
- `finalBalls`: id/x/y/z/active; no final linear/angular velocities.

Missing: settled flag, termination reason, duration, full ordered rail/collision/off-table events and complete normalized invalid-input result. With no active cue, only paths/frames/firstEvent/firstBallContact are returned. An inactive ball can represent a pocket or a ball off-table; inspect events rather than equating inactivity with a legal pot.

Full rail events after contact are needed for foul evaluation; the first-event label cannot establish that requirement. Pocket IDs should come from the same pocket geometry/event logic.

## Concrete findings

1. **Headless jaw-contact blocker:** `collideWithJaw` (index.html around 3017–3040) references bare `firstEvent`, but that variable is local to `simulate` (around 3773). A test reaching that path throws `ReferenceError: firstEvent is not defined` in a DOM-free VM. The HTML includes an element with id `firstEvent`; browser named globals may mask the exception, but that cannot update the simulator-local variable. This audit does not claim a confirmed browser crash. Repair event ownership before worker extraction.
2. **Unfinished shots look complete:** the loop has a 20-second cap without exposing a termination status or final velocities. A low-friction stress case reaches the cap. Never score such endpoints as settled leaves.
3. **Execution endpoint differs:** `commitAnimatedShot` uses the last frame, sampled every ten steps, whereas the simulator separately returns `finalBalls`. Eight completed harness cases had identical preview/animation final results, but last-frame deltas ranged from zero to 13.49 mm; the maximum was the artificial capped case. Ordinary sampled cases were below 0.04 mm. The cap case is an interface stress test, not a typical-table accuracy claim.
4. **CB2 is not a sequential rollout:** `withShot2Context` uses `S.balls` for objects; `syncShot2EndpointFromShot1` only moves the cue seed. Reuse the UI concepts, not this function as a multishot planner.
5. **Context restoration has limits:** complete default Shot 2 state was unchanged after first and repeated calls. An incomplete state changed because `ensureShot2` fills defaults before the backup. `refreshPreview` also saves state and updates UI. Neither is an isolated candidate-evaluation entrypoint.
6. **Rule state and evaluator absent:** setup labels/tray groups do not encode ownership, open table or full fouls. Do not present physics-valid shots as game-legal until the rule layer validates them.
7. **Development installation is not isolated yet:** Android application ID and Android/Windows URLs still target the original trainer. LocalStorage keys, IndexedDB name and service-worker cache prefix are inherited. Two GitHub Pages paths under the same origin can share origin storage/cache namespaces. Scope-relative service workers do not isolate those namespaces. A maskable icon referenced by the manifest is absent. Do not distribute copied installers as a Hints build.

## Baseline executed

Command: `node tests/engine-inventory.cjs` (Node 24.19.0).

Harness compiles verbatim top-level function declarations and APK/PHYSICS_MODEL constants from the audited HTML into a Node VM, then constructs default state. UI bootstrap is deliberately excluded. It does not replace physics calculations. See `step-2-baseline-results.json` for results and `tests/engine-inventory.cjs` for reproducibility.

- Existing `runPhysicsSelfTests`: passed, zero failures (ten numerical comparisons covering squirt, angular velocity, zero throw and bed-rebound benchmarks).
- Nine scenarios attempted: default, follow, draw, side spin, airborne, scratch, marker, jaw contact, capped low-friction shot.
- Eight returned successfully and passed repeated-result determinism, serialized state preservation, and preview-versus-frame-enabled final-state/contact/pocket comparisons.
- One jaw-contact scenario failed with the scope error above. Harness reports it as a finding rather than silently patching source.
- Scratch scenario records cue ID 0 in pocket events. Marker scenario excludes markers from physics by source filtering.
- Complete Shot 2 state remained unchanged; incomplete state was normalized/mutated.
- No-cue return shape confirmed incomplete.

Timings are single-run Node VM observations in this environment (with warm-up effects); they are not Android/PC release performance measurements. No browser UI, installation, offline-cache lifecycle, device responsiveness or human strategic credibility acceptance was performed. No full 20–30-layout suite exists yet. App behavior is unchanged by this audit.

## Recommended integration boundary

A controlled evaluator should accept immutable table state, shot parameters, calibration/physics settings and recording options, and return normalized final state, ordered events, settled status, termination reason and optional trajectories. Use the existing equations; do not create a second engine. Restore shared state with try/finally only as an interim adapter, with tests for errors as well as normal returns. Prefer a pure function for worker execution.

Include all physical inputs in snapshot/version keys: geometry/ball size, friction and restitution, rail tangential response, cue end-mass ratio, elevation/airborne mode and bed settings, plus a physics-version identifier covering constants. Carry every remaining object's actual final state into the second shot. Keep raw scratch results for legality even though the practice UI restores a scratched cue to its starting position.

## Step 2 disposition

Inventory complete; implementation blockers and validation limits are recorded. Recommended next engineering work is the isolated simulator interface and its focused parity/event/termination tests, followed by the 8-ball/9-ball rule layer, within the approved step-by-step plan. No new coaching feature, rules variant or numerical release threshold is approved by this report.
