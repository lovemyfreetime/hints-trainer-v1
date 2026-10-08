# Fixed coaching-layout regression set

`tests/fixtures/coaching-layouts-v1.json` defines 30 explicit layouts on the default 88-by-44-inch playing surface. Coordinates are meters. Each case declares its game state and expected behavior before evaluation.

The set contains 22 pocketing/endgame layouts, two blocked-route cases, and six unsupported-input cases. Coverage includes all six pocket destinations, left/right cuts, lowest remaining 9-ball targets other than one, multi-ball continuation, solids/stripes, open-table assignment, an 8-ball win with opponent balls still present, and two rolling-resistance settings. Negative cases include frozen/touching balls, no cue ball, a break, unknown foul history, and the unsupported open-table/absent-group situation.

The two blocked-route cases forbid the obstructed direct route. They allow a different verified route or an honest no-shot result; they do not assume that obstructing one route makes the whole layout impossible.

## What the runner verifies

Run `node tests/coaching-layouts-v1.cjs --report` to evaluate all cases and save `docs/coaching-layouts-v1-results.json`. The runner loads the actual simulator functions from `index.html`; numerical behavior is not mocked.

For each supported layout it checks the expected outcome and the 96-simulation search ceiling. Every returned recommendation is replayed through the simulator and rules evaluator. Every proposed second shot is replayed from the exact complete first-shot final state. Selected endgame cases require a rack win on the first or second shot, rather than accepting any legal pot. Input snapshots are frozen and checked for mutation, and the live trainer state must stay unchanged.

When the highest-ranked recommendation has a second shot, the runner also builds its position guide. The predicted cue-ball endpoint must reproduce the verified next pot; each irregular guide cell corner must have a successful sample. The 25-point sampling contract is checked. Unsupported cases must return their expected reason without invoking physics.

The report records outcomes, selected ball/pocket, presence of a second shot, successful zone samples, search simulation count, and elapsed time. Elapsed time includes recommendation replays and zone sampling; it is **not** a standalone search benchmark. Generated reports are observations of one run, not timing thresholds.

## Acceptance boundary

This is a broader automated regression baseline. The previous browser suite separately checks the five hint levels, projector messages, edit/animation invalidation, Undo, and offline operation. The 30 cases here do not all execute through the browser UI.

Passing this set does not prove that the highest-ranked route is the best human coaching choice. The two blocked and six unsupported cases also do not count as successful coaching demonstrations. Expert review, broader bank/kick/safety coverage, tolerance-based ranking, and ordinary-PC/Android performance remain outstanding. Physical projector calibration/readability and installer acceptance remain outstanding. The V1 release is not declared complete by this suite.
