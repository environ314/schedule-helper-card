// The linked_entities option: an indirect drive (sensor/template → automation) replaces noAutomation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleHelperCard, linkedEntitiesOf, STRINGS } from '../dist/schedule-helper-card.js';

const cardWith = (config, states, drivers) => {
  const card = Object.create(ScheduleHelperCard.prototype);
  card.setConfig(config);
  card._hass = { states };
  card._h = { callWS: async () => ({}), states };
  card._drivers = drivers;
  return card;
};

test('linkedEntitiesOf: null, a string, a list, and a map', () => {
  assert.equal(linkedEntitiesOf({}), null);
  assert.deepEqual(linkedEntitiesOf({ linked_entity: 'climate.chambre' }), { '*': ['climate.chambre'] });
  assert.deepEqual(linkedEntitiesOf({ linked_entities: ['a.x', 'b.y'] }), { '*': ['a.x', 'b.y'] });
  assert.deepEqual(linkedEntitiesOf({ linked_entities: { 'schedule.s': 'sensor.t' } }), { 'schedule.s': ['sensor.t'] });
  assert.deepEqual(linkedEntitiesOf({ linked_entities: { 'schedule.s': ['a', 'b'] } }), { 'schedule.s': ['a', 'b'] });
  assert.throws(() => linkedEntitiesOf({ linked_entities: 3 }), /linked_entities/);
  assert.throws(() => linkedEntitiesOf({ linked_entities: { s: 3 } }), /linked_entities/);
});

test('_linkedFor merges the card-wide list with the per-schedule one and dedupes', () => {
  const card = cardWith({ linked_entities: { '*': ['sensor.common'], 'schedule.a': 'sensor.one' } }, {});
  assert.deepEqual(card._linkedFor('schedule.a'), ['sensor.common', 'sensor.one']);
  assert.deepEqual(card._linkedFor('schedule.b'), ['sensor.common']);
  assert.deepEqual(card._linkedFor('schedule.c'), ['sensor.common']);
  assert.deepEqual(cardWith({}, {})._linkedFor('schedule.a'), []);
  // string alias accepted too
  assert.deepEqual(cardWith({ linked_entities: 'sensor.all' }, {})._linkedFor('schedule.a'), ['sensor.all']);
});

test('_idleReason: a declared indirect drive silences noAutomation, unless it is off or unavailable', () => {
  const states = {
    'sensor.planning_chauffage_chambre': { entity_id: 'sensor.planning_chauffage_chambre', state: 'on', attributes: {} },
    'automation.suivi': { entity_id: 'automation.suivi', state: 'on', attributes: {} },
  };
  const cfg = { linked_entities: { 'schedule.chambre': ['sensor.planning_chauffage_chambre', 'automation.suivi'] } };
  const drivers = { 'schedule.chambre': [] }; // search/related finds nothing: the indirect drive is the only one
  const healthy = cardWith(cfg, states, drivers);
  assert.equal(healthy._idleReason('schedule.chambre', {}), null); // drives something indirectly: no warning

  const offAuto = cardWith(cfg, { ...states, 'automation.suivi': { state: 'off', attributes: {} } }, drivers);
  assert.equal(offAuto._idleReason('schedule.chambre', {}), 'automationOff');

  const gone = cardWith(cfg, { ...states, 'sensor.planning_chauffage_chambre': { state: 'unavailable', attributes: {} } }, drivers);
  assert.equal(gone._idleReason('schedule.chambre', {}), 'automationOff');

  const undeclared = cardWith({}, states, drivers);
  assert.equal(undeclared._idleReason('schedule.chambre', {}), 'noAutomation'); // unchanged upstream behaviour
});

test('STRINGS keep the linked_entities wording in every language', () => {
  for (const lang of ['fr', 'he', 'en']) {
    assert.ok(STRINGS[lang].externalDrive, `externalDrive missing in ${lang}`);
    assert.ok(STRINGS[lang].drivesNothing, `drivesNothing missing in ${lang}`);
  }
});