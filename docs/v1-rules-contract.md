# Hints Trainer V1 — 8-ball and 9-ball rules contract

Status: design contract for the next implementation step. It defines what the hint engine may call legal; it does not change the existing trainer yet.

## Shared shot facts

The simulator supplies a raw result. The rules evaluator must inspect the complete ordered event list and resulting table state.

A candidate is never presented as a valid hint unless the rules evaluator returns `legal: true`. A physically successful pot can still be illegal because of first contact, a scratch, an off-table object ball, a required group, or an endgame condition.

The rules evaluator must be deterministic, offline, side-effect free, and independent of UI markers. It receives an immutable snapshot, a rules profile, and a simulation result.

The evaluator returns:

```js
{
  legal, game, reasonCode, reason,
  firstObjectContactId, pocketedObjectIds, pocketedCueBall,
  requiredBallId, nextRequiredBallId, terminal, winner,
  resultingState, foul
}
```

`resultingState` is produced from the simulator's actual final state. A scratched cue ball remains absent in this raw state; the practice interface may separately restore the cue for user convenience.

## 9-ball profile

- Legal object balls are 1 through 9 that remain active.
- The required first object contact is the lowest-numbered active object ball.
- Any object ball may be pocketed after legal first contact.
- Pocketing the 9 legally ends the rack and makes the shooter the winner.
- Pocketing another ball legally continues the rack with the lowest remaining active ball.
- A shot with no object-ball contact is a foul.
- A shot whose first object contact is not the lowest active ball is a foul.
- Cue-ball pocketing is a foul, regardless of whether an object ball was also pocketed.
- An object ball leaving the table is a foul.
- A legal shot need not pocket a ball; a legal safety is allowed when first contact and table boundaries are valid.
- A legal 9-ball win must include legal first contact and no foul. The evaluator must not accept a 9 merely because it appears in `pocketEvents`.

The profile intentionally leaves push-out rules outside this first implementation unless the game-state design explicitly enables a push-out phase. A future rules change must add a separate state flag and acceptance cases.

## 8-ball profile

V1 uses an explicit group state:

```js
{ phase: 'open' | 'assigned' | 'eight', shooterGroup: 'solids' | 'stripes' | null }
```

- On an open table, the shooter may legally contact and pocket a solid or stripe. The 8 is not a legal first object target while groups remain.
- Assignment occurs only when the rules variant allows it: the first legally pocketed solid or stripe on an open table establishes the shooter's group. A safety without a pocket does not assign a group.
- Once assigned, the shooter must first contact one of their active group balls.
- Pocketing an opponent's ball first or pocketing the 8 before the shooter's group is cleared is a foul/loss condition according to the terminal classification below.
- When all of the shooter's group balls are cleared, the phase becomes `eight`; the required first contact is the 8.
- Pocketing the 8 legally in phase `eight` ends the rack with a win.
- Pocketing the 8 early, pocketing it on a foul, or pocketing it while the opponent's group remains active is a loss under standard call-shot 8-ball assumptions.
- Cue-ball pocketing is a foul. An object ball leaving the table is a foul.
- A legal shot may be a safety and may pocket no ball.
- This contract does not claim to implement called-pocket requirements. Until call-shot data exists in the snapshot, a pocket is evaluated geometrically and the rules layer must label the variant as `no-call`. Adding called-pocket enforcement requires a declared pocket target in the candidate.

Because 8-ball variants differ, the evaluator must reject an unknown or missing rules profile rather than silently selecting a house rule. The implementation must record the selected profile in the result.

## Terminal classification

The evaluator distinguishes:

- `continue`: legal shot, rack remains active.
- `win`: legal terminal shot.
- `foul`: illegal shot; rack continues under the configured foul consequence.
- `loss`: illegal terminal 8-ball shot or other configured loss condition.
- `unusable`: simulator did not settle, cue is missing before the shot, or the result is incomplete.

A foul or loss cannot be a recommended coaching shot. Safety candidates may be legal and non-scoring, but they must carry a clear safety reason.

## Candidate-search requirements

The candidate generator must provide an intended first object ball and pocket for each candidate. The rules evaluator then checks the simulation result against that intention. It must not infer legality from the candidate label alone.

The evaluator must preserve extra legal pots and actual pocket order. In 9-ball, an extra ball pocketed before the lowest ball is still illegal if first contact was wrong; after legal first contact, extra pots can be legal. In 8-ball, extra group/opponent pots require the selected variant's explicit policy and must not be silently treated as legal.

## Required acceptance layouts

Before merging the rules implementation, add fixed layouts covering:

1. 9-ball legal lowest-ball pot.
2. 9-ball wrong first contact.
3. 9-ball legal safety with no pot.
4. 9-ball legal 9-ball win.
5. 9-ball 9-ball pot after wrong first contact.
6. 9-ball scratch with an object ball pocketed.
7. 9-ball object ball off the table.
8. 8-ball open-table solid assignment.
9. 8-ball open-table stripe assignment.
10. 8-ball open-table 8 attempt.
11. 8-ball assigned-group legal shot.
12. 8-ball opponent first contact.
13. 8-ball early 8 loss.
14. 8-ball cleared-group 8 win.
15. 8-ball scratch on a made ball.
16. Unsettled/time-limit simulation rejected for both profiles.

These are rule cases, separate from the 20–30 full coaching layouts required by the frozen Definition of Done.

## Scope boundary

This contract does not add a new UI, push-out mode, called-shot UI, league handicaps, scorekeeping redesign, or cloud service. It supplies the stable legality boundary needed by candidate scoring. The next implementation should be a pure `evaluateRules(snapshot, simulationResult, profile)` function with unit tests, then a candidate adapter that calls it.
