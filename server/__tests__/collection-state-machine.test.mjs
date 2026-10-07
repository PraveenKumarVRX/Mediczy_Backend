import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolve, permittedCommands, foreignModeFields, isFinal, TransitionError, ACTORS, COMMANDS, FINAL_STATUSES,
} from '../services/collection/state-machine.js';

const P = ACTORS.PHLEBOTOMIST;
const D = ACTORS.DISPATCH;
const L = ACTORS.LAB_RECEIVER;

// Walk a mode's happy path, asserting every hop, so a change to the table shows up as a diff here.
const HOME_PATH = [
  ['assign', D, 'assigned', 'unassigned'], ['accept', P, 'accepted'], ['depart', P, 'en_route'], ['arrive', P, 'arrived'],
  ['verify_patient', P, 'verified'], ['consent', P, 'consented', undefined, { outcome: 'granted' }], ['collect', P, 'collected'],
  ['start_transit', P, 'in_transit'], ['handoff', P, 'handed_over'], ['receive', L, 'lab_received'],
];
const WARD_PATH = [
  ['assign', D, 'assigned', 'unassigned'], ['accept', P, 'accepted'], ['bedside', P, 'at_bedside'],
  ['verify_patient', P, 'verified'], ['consent', P, 'consented', undefined, { outcome: 'granted' }], ['collect', P, 'collected'],
  ['handoff', P, 'ward_handoff'], ['receive', L, 'lab_received'],
];

for (const [mode, path] of [['home', HOME_PATH], ['ward', WARD_PATH]]) {
  test(`${mode}: the whole happy path resolves hop by hop`, () => {
    let status = 'unassigned';
    for (const [command, actor, to, , context] of path) {
      const r = resolve({ mode, status, command, actor, context });
      assert.equal(r.to, to, `${command} from ${status}`);
      status = r.to;
    }
    assert.equal(status, 'lab_received');
    assert.ok(isFinal(status));
  });

  test(`${mode}: every command is refused from every status it is not listed for (exhaustive)`, () => {
    const statuses = ['unassigned', 'assigned', 'accepted', 'en_route', 'arrived', 'at_bedside', 'verified', 'consented',
      'collected', 'in_transit', 'handed_over', 'ward_handoff', ...FINAL_STATUSES];
    for (const [command, def] of Object.entries(COMMANDS)) {
      for (const status of statuses) {
        for (const actor of def.actors) {
          const legal = (def.from[mode] || []).includes(status) && !isFinal(status);
          if (legal) {
            assert.doesNotThrow(() => resolve({ mode, status, command, actor }), `${command}@${status}`);
          } else {
            assert.throws(() => resolve({ mode, status, command, actor }), TransitionError, `${command}@${status} must be refused`);
          }
        }
      }
    }
  });
}

test('modes are not interchangeable: home-only and ward-only steps are refused on the other mode', () => {
  assert.throws(() => resolve({ mode: 'ward', status: 'accepted', command: 'depart', actor: P }), { code: 'invalid_transition' });
  assert.throws(() => resolve({ mode: 'ward', status: 'collected', command: 'start_transit', actor: P }), { code: 'invalid_transition' });
  assert.throws(() => resolve({ mode: 'home', status: 'accepted', command: 'bedside', actor: P }), { code: 'invalid_transition' });
});

test('evidence cannot be skipped: collect needs consent, consent needs verification, verification needs arrival', () => {
  assert.throws(() => resolve({ mode: 'home', status: 'accepted', command: 'collect', actor: P }), { code: 'invalid_transition' });
  assert.throws(() => resolve({ mode: 'home', status: 'arrived', command: 'consent', actor: P }), { code: 'invalid_transition' });
  assert.throws(() => resolve({ mode: 'home', status: 'en_route', command: 'verify_patient', actor: P }), { code: 'invalid_transition' });
  assert.throws(() => resolve({ mode: 'ward', status: 'verified', command: 'collect', actor: P }), { code: 'invalid_transition' });
});

test('the right actor: a collector cannot dispatch or receive; dispatch cannot collect; the lab alone receives', () => {
  assert.throws(() => resolve({ mode: 'home', status: 'unassigned', command: 'assign', actor: P }), { code: 'actor_not_permitted' });
  assert.throws(() => resolve({ mode: 'home', status: 'assigned', command: 'reassign', actor: P }), { code: 'actor_not_permitted' });
  assert.throws(() => resolve({ mode: 'home', status: 'consented', command: 'collect', actor: D }), { code: 'actor_not_permitted' });
  assert.throws(() => resolve({ mode: 'home', status: 'handed_over', command: 'receive', actor: P }), { code: 'actor_not_permitted' });
  assert.throws(() => resolve({ mode: 'home', status: 'handed_over', command: 'receive', actor: D }), { code: 'actor_not_permitted' });
});

test('a refused consent closes the task as refused, a granted one moves it on', () => {
  assert.equal(resolve({ mode: 'home', status: 'verified', command: 'consent', actor: P, context: { outcome: 'refused' } }).to, 'refused');
  assert.equal(resolve({ mode: 'home', status: 'verified', command: 'consent', actor: P, context: { outcome: 'granted' } }).to, 'consented');
});

test('a lab rejection closes the task as rejected_by_lab', () => {
  assert.equal(resolve({ mode: 'home', status: 'handed_over', command: 'receive', actor: L, context: { anyRejected: true } }).to, 'rejected_by_lab');
});

test('reassign is allowed until collection and never after: a collected task cannot be rewritten', () => {
  for (const mode of ['home', 'ward']) {
    for (const status of ['assigned', 'accepted', 'verified', 'consented']) {
      assert.equal(resolve({ mode, status, command: 'reassign', actor: D }).to, 'assigned');
    }
    for (const status of ['collected', 'in_transit', 'handed_over', 'ward_handoff']) {
      assert.throws(() => resolve({ mode, status, command: 'reassign', actor: D }), { code: 'invalid_transition' });
      assert.throws(() => resolve({ mode, status, command: 'cancel', actor: D }), { code: 'invalid_transition' });
    }
  }
});

test('a closed task accepts nothing, not even by dispatch', () => {
  for (const status of FINAL_STATUSES) {
    assert.throws(() => resolve({ mode: 'home', status, command: 'cancel', actor: D }), { code: 'task_closed' });
    assert.throws(() => resolve({ mode: 'home', status, command: 'assign', actor: D }), { code: 'task_closed' });
  }
});

test('decline returns the task to the pool, but not once the collector is at the door/bedside', () => {
  assert.equal(resolve({ mode: 'home', status: 'en_route', command: 'decline', actor: P }).to, 'unassigned');
  assert.throws(() => resolve({ mode: 'home', status: 'arrived', command: 'decline', actor: P }), { code: 'invalid_transition' });
  assert.throws(() => resolve({ mode: 'ward', status: 'at_bedside', command: 'decline', actor: P }), { code: 'invalid_transition' });
});

test('scan_specimen is bound to the consented status and does not move the task', () => {
  const r = resolve({ mode: 'home', status: 'consented', command: 'scan_specimen', actor: P });
  assert.equal(r.to, 'consented');
  assert.equal(r.moves, false);
  assert.throws(() => resolve({ mode: 'home', status: 'verified', command: 'scan_specimen', actor: P }), { code: 'invalid_transition' });
  assert.throws(() => resolve({ mode: 'home', status: 'collected', command: 'scan_specimen', actor: P }), { code: 'invalid_transition' });
});

test('unknown command and unknown mode are errors, not silent no-ops', () => {
  assert.throws(() => resolve({ mode: 'home', status: 'assigned', command: 'next_stage', actor: P }), { code: 'unknown_command' });
  assert.throws(() => resolve({ mode: 'remote', status: 'assigned', command: 'accept', actor: P }), { code: 'invalid_mode' });
});

test('permittedCommands drives the UI and agrees with resolve', () => {
  assert.deepEqual(permittedCommands({ mode: 'home', status: 'accepted', actor: P }).sort(), ['decline', 'depart']);
  assert.deepEqual(permittedCommands({ mode: 'ward', status: 'accepted', actor: P }).sort(), ['bedside', 'decline']);
  assert.deepEqual(permittedCommands({ mode: 'home', status: 'lab_received', actor: D }), []);
  for (const mode of ['home', 'ward']) {
    for (const status of ['unassigned', 'assigned', 'accepted', 'verified', 'consented', 'collected', 'handed_over', 'ward_handoff']) {
      for (const actor of [P, D, L]) {
        for (const command of permittedCommands({ mode, status, actor })) {
          assert.doesNotThrow(() => resolve({ mode, status, command, actor }), `${mode}/${status}/${actor}/${command}`);
        }
      }
    }
  }
});

test('foreignModeFields names the other mode\'s fields only', () => {
  assert.deepEqual(foreignModeFields('home', { address: {}, wardName: 'ICU', bedLabel: 'B2' }), ['wardName', 'bedLabel']);
  assert.deepEqual(foreignModeFields('ward', { address: { line1: 'x' }, wardName: 'ICU' }), ['address']);
  assert.deepEqual(foreignModeFields('home', { address: {} }), []);
  assert.deepEqual(foreignModeFields('ward', { wardName: null }), []);
});
