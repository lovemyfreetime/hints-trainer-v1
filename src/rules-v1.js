/* Offline normal-shot rules boundary. See docs/v1-rules-contract.md. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BTHintsRules = api;
})(globalThis, function () {
  'use strict';
  const profiles = Object.freeze({ eight: 'wpa-8ball-normal-v1', nine: 'wpa-9ball-normal-v1' });
  const pockets = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR'];
  const group = id => id >= 1 && id <= 7 ? 'solids' : id >= 9 && id <= 15 ? 'stripes' : null;
  const copy = x => JSON.parse(JSON.stringify(x));
  const unusable = reasonCode => ({ legal: false, classification: 'unusable', reasonCode,
    foul: false, terminal: false, winner: null, canContinue: false, resultingState: null });

  function evaluateRules(snapshot, simulation, state) {
    if (!state || !Object.values(profiles).includes(state.profile)) return unusable('unknown-profile');
    const nine = state.profile === profiles.nine;
    if (state.phase !== 'normal') return unusable('unsupported-phase');
    // The event stream does not establish whether a ball declared frozen left its cushion.
    if (!Array.isArray(state.frozenBallIds) || state.frozenBallIds.length) return unusable('frozen-status-unsupported');
    if (nine && (!Number.isInteger(state.consecutiveFouls) || state.consecutiveFouls < 0 ||
      state.consecutiveFouls > 2 || typeof state.warnedOnTwo !== 'boolean' || (state.warnedOnTwo && state.consecutiveFouls !== 2))) return unusable('invalid-foul-history');
    if (!nine && ![null, 'solids', 'stripes'].includes(state.shooterGroup)) return unusable('invalid-group');
    if (!snapshot || !Array.isArray(snapshot.balls) || !simulation || !Array.isArray(simulation.events) ||
      !simulation.finalState || !Array.isArray(simulation.finalState.balls)) return unusable('incomplete-simulation');
    if (simulation.physicsVersion !== 'hints-sim-1' || snapshot.physicsVersion !== 'hints-sim-1') return unusable('unknown-physics');
    if (simulation.settled !== true || simulation.terminationReason !== 'settled') return unusable('unsettled');
    if (snapshot.balls.some(b => !b || typeof b.active !== 'boolean')) return unusable('invalid-balls');
    const before = snapshot.balls.filter(b => b.active), after = simulation.finalState.balls;
    const validBalls = balls => balls.every(b => b && Number.isInteger(b.id) && b.id >= 0 && b.id <= (nine ? 9 : 15) &&
      b.active === true && Number.isFinite(b.x) && Number.isFinite(b.y)) && new Set(balls.map(b => b.id)).size === balls.length;
    if (!validBalls(before) || !validBalls(after)) return unusable('invalid-balls');
    const ids = before.map(b => b.id), remaining = after.map(b => b.id);
    if (!ids.includes(0)) return unusable('missing-cue-ball');
    if (!ids.includes(nine ? 9 : 8)) return unusable('rack-already-ended');
    const own = ids.filter(id => group(id) === state.shooterGroup && id !== 0 && id !== 8);
    if (!nine && state.shooterGroup === null && ['solids', 'stripes'].some(g => !ids.some(id => group(id) === g)))
      return unusable('open-table-cleared-group-needs-claim');
    if (!nine && state.safety !== true && (!state.call || !ids.includes(state.call.ballId) || state.call.ballId === 0 ||
      !pockets.includes(state.call.pocketId))) return unusable('missing-or-invalid-call');
    if (!nine && state.safety === true && state.call != null) return unusable('conflicting-call-and-safety');

    let time = -Infinity;
    const removed = new Set(), pots = [], contacts = [], rails = [], off = [];
    for (const event of simulation.events) {
      if (!event || !Number.isFinite(event.t) || event.t < 0 || event.t < time) return unusable('invalid-event-order');
      time = event.t;
      if (event.type === 'ball-contact') {
        if (!Array.isArray(event.ids) || event.ids.length !== 2 || event.ids[0] === event.ids[1] ||
          event.ids.some(id => !ids.includes(id) || removed.has(id))) return unusable('invalid-contact');
        if (event.ids.includes(0)) contacts.push({ id: event.ids.find(id => id !== 0), t: event.t });
      } else if (['rail', 'jaw', 'pocket', 'off-table'].includes(event.type)) {
        if (!ids.includes(event.id) || removed.has(event.id)) return unusable('invalid-event-ball');
        if (event.type === 'rail' || event.type === 'jaw') rails.push(event);
        else {
          removed.add(event.id);
          if (event.type === 'pocket') {
            if (!pockets.includes(event.pocketId)) return unusable('unknown-pocket');
            pots.push(event);
          } else off.push(event.id);
        }
      } else return unusable('unknown-event');
    }
    if (remaining.some(id => !ids.includes(id) || removed.has(id)) || ids.some(id => !removed.has(id) && !remaining.includes(id)))
      return unusable('inconsistent-final-state');
    const first = contacts[0];
    if ((first && (!simulation.firstBallContact || simulation.firstBallContact.objId !== first.id || simulation.firstBallContact.t !== first.t)) ||
      (!first && simulation.firstBallContact != null)) return unusable('inconsistent-first-contact');
    const targets = nine ? [Math.min(...ids.filter(id => id > 0))] : state.shooterGroup === null
      ? ids.filter(id => group(id)) : own.length ? own : [8];
    // Solver timestamps cannot resolve within-step simultaneity: benefit of doubt for a legal first hit.
    const firstTargets = first ? contacts.filter(c => c.t === first.t).map(c => c.id) : [];
    const fouls = [];
    if (removed.has(0)) fouls.push(off.includes(0) ? 'cue-off-table' : 'scratch');
    if (off.some(id => id !== 0)) fouls.push('object-off-table');
    if (!first) fouls.push('no-object-contact');
    else if (!firstTargets.some(id => targets.includes(id))) fouls.push('wrong-first-contact');
    if (first && !pots.length && !rails.some(e => e.t >= first.t)) fouls.push('no-rail-after-contact');
    const foul = fouls.length > 0;
    const objectPots = pots.filter(e => e.id !== 0), eightPot = pots.find(e => e.id === 8);
    let classification = foul ? 'foul' : 'continue', reasonCode = fouls[0] || 'legal-shot', winner = null;
    let shooterGroup = nine ? null : state.shooterGroup;
    const callMade = !nine && state.safety !== true && pots.some(e => e.id === state.call.ballId && e.pocketId === state.call.pocketId);
    const validCallTarget = !nine && state.safety !== true && targets.includes(state.call.ballId);
    let retainsTurn = !foul && (nine ? objectPots.length > 0 : callMade && validCallTarget);
    if (!nine && !foul && shooterGroup === null && retainsTurn) shooterGroup = group(state.call.ballId);
    if (!nine && (eightPot || off.includes(8))) {
      const wins = !!eightPot && !foul && state.shooterGroup !== null && own.length === 0 &&
        state.safety !== true && state.call.ballId === 8 && state.call.pocketId === eightPot.pocketId;
      classification = wins ? 'win' : 'loss'; winner = wins ? 'shooter' : 'opponent';
      reasonCode = wins ? 'legal-eight' : off.includes(8) ? 'eight-off-table' : foul ? 'eight-on-foul' : own.length || state.shooterGroup === null ? 'early-eight' : 'uncalled-eight';
    }
    let consecutiveFouls = nine ? (foul ? Math.min(2, state.consecutiveFouls + 1) : 0) : null;
    if (nine && !foul && pots.some(e => e.id === 9)) {
      classification = 'win'; winner = 'shooter'; reasonCode = 'legal-nine';
    } else if (nine && foul && state.consecutiveFouls === 2 && state.warnedOnTwo) {
      classification = 'loss'; winner = 'opponent'; reasonCode = 'three-consecutive-fouls'; consecutiveFouls = 3;
    }
    const terminal = classification === 'win' || classification === 'loss';
    retainsTurn = retainsTurn && !terminal;
    const respotBallIds = nine && removed.has(9) && classification !== 'win' ? [9] : [];
    const nextState = { ...copy(state), shooterGroup, consecutiveFouls,
      warnedOnTwo: nine && consecutiveFouls === 2 ? state.warnedOnTwo : false };
    delete nextState.call; delete nextState.safety;
    // Reassess cushion contact at the new positions before evaluating another shot.
    delete nextState.frozenBallIds;
    const resultingState = copy(simulation.finalState);
    return { profile: state.profile, legal: !foul && classification !== 'loss', classification, reasonCode,
      foul, fouls, terminal, winner, retainsTurn, canContinue: retainsTurn && !respotBallIds.length,
      firstObjectContactId: first ? first.id : null, firstContactIds: firstTargets,
      requiredFirstContactIds: targets, pocketedObjectIds: objectPots.map(e => e.id), pocketedCueBall: pots.some(e => e.id === 0),
      nextRequiredBallId: nine && !terminal ? Math.min(...remaining.filter(id => id > 0), ...respotBallIds) : null,
      respotBallIds, ballInHand: foul && !terminal, resultingState, nextShooterState: nextState };
  }

  // Dependency injection keeps the rules module independent of UI and simulator globals.
  function evaluateCandidate(simulate, snapshot, shot, state) {
    const simulation = simulate(snapshot, shot);
    return { simulation, rules: evaluateRules(snapshot, simulation, state) };
  }
  return Object.freeze({ version: 'hints-rules-1', profiles, evaluateRules, evaluateCandidate });
});
