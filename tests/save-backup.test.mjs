import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const compiled = mkdtempSync(join(tmpdir(), 'pokerole-backup-test-'));
execFileSync('node', ['node_modules/typescript/bin/tsc', 'app/lib/save-backup.ts', 'app/lib/trainer.ts', '--outDir', compiled, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck']);
const require = createRequire(import.meta.url);
const { createBackup, parseBackup, restoreBackup, RECOVERY_KEY } = require(join(compiled, 'lib/save-backup.js'));
const { makeBlankTrainer } = require(join(compiled, 'lib/trainer.js'));
after(() => rmSync(compiled, { recursive: true, force: true }));
class MemoryStorage {
  values = new Map(); failKey = null; writes = 0;
  getItem(k) { return this.values.get(k) ?? null; }
  setItem(k, v) { this.writes++; if (k === this.failKey) { this.failKey = null; throw new Error('Quota exceeded'); } this.values.set(k, v); }
  removeItem(k) { this.values.delete(k); }
}
function fixture(name = 'Leaf') {
  const storage = new MemoryStorage();
  const trainer = { ...makeBlankTrainer(), id: 'trainer-1', name, pokemon: ['partner'] };
  const attrs = { strength: 2, dexterity: 2, vitality: 2, insight: 2, special: 2 };
  const sheet = { number: 1, nickname: 'Sprout', gender: 'Male', rank: 'Rookie', loyalty: 1, happiness: 1, happinessPending: 0, attributes: attrs, trainingAttributes: attrs, socialAttributes: trainer.socialAttributes, skills: trainer.skills, moves: ['Tackle'], partnerMoves: [], isPartner: false, nature: 'Hardy', origin: 'wild', heldItem: '', cruelty: false, inPokeball: false, notes: '', care: { gauges: { hunger: 80, cleanliness: 70, affection: 60 }, lastTickAt: 12345, inconsolable: false } };
  storage.setItem('pokerole_trainers', JSON.stringify([trainer]));
  storage.setItem('pokerole_pokemon_sheets', JSON.stringify({ partner: sheet }));
  storage.setItem('pokerole_active_trainer_id', JSON.stringify(trainer.id));
  storage.setItem('pokerole_gm_dims', JSON.stringify({ cols: 4, rows: 3 }));
  storage.setItem('pokerole_gm_grid', JSON.stringify([{ id: 'notes', tabs: ['notes', 'quick_roll'], active: 1 }, null]));
  storage.setItem('pokerole_gm_notes', JSON.stringify('Route 1 journal'));
  return storage;
}
test('round trips player, care and GM data without changing raw stored values', () => {
  const source = fixture(); const backup = createBackup(source);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), backup);
  const target = new MemoryStorage(); restoreBackup(target, backup);
  for (const [k, v] of source.values) assert.equal(target.getItem(k), v);
});
test('rejects unrelated JSON, unsupported versions, broken stats and missing party sheets before writes', () => {
  const backup = createBackup(fixture());
  assert.throws(() => parseBackup('{bad'));
  assert.throws(() => parseBackup(JSON.stringify({ version: 1, entries: {} })));
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, version: 2 })));
  const invalid = structuredClone(backup);
  invalid.entries.pokemon_sheets = '{}';
  const target = fixture(); const before = [...target.values]; const writes = target.writes;
  assert.throws(() => restoreBackup(target, invalid), /missing/);
  assert.deepEqual([...target.values], before); assert.equal(target.writes, writes);
  const trainers = JSON.parse(backup.entries.trainers); trainers[0].attributes = 'broken';
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, entries: { ...backup.entries, trainers: JSON.stringify(trainers) } })), /stats/);
});
test('restore preserves unrelated storage, clears old battle links and keeps recoverable previous save', () => {
  const target = fixture('Red'); target.setItem('other-app', 'untouched'); target.setItem('pokerole_bt_entries', '[{"old":true}]');
  restoreBackup(target, createBackup(fixture('Leaf')));
  assert.equal(target.getItem('other-app'), 'untouched'); assert.equal(target.getItem('pokerole_bt_entries'), null);
  const previous = parseBackup(target.getItem(RECOVERY_KEY));
  assert.equal(JSON.parse(previous.entries.trainers)[0].name, 'Red');
  restoreBackup(target, previous);
  assert.equal(JSON.parse(target.getItem('pokerole_trainers'))[0].name, 'Red');
});
test('storage failure after partial writes rolls back the original save and battle', () => {
  const target = fixture('Red'); target.setItem('pokerole_bt_entries', '[]'); const before = [...target.values].sort();
  target.failKey = 'pokerole_pokemon_sheets';
  assert.throws(() => restoreBackup(target, createBackup(fixture('Leaf'))), /previous save was kept/);
  assert.deepEqual([...target.values].sort(), before);
});
test('failure to store recovery leaves current data untouched', () => {
  const target = fixture('Red'); const before = [...target.values]; target.failKey = RECOVERY_KEY;
  assert.throws(() => restoreBackup(target, createBackup(fixture('Leaf')))); assert.deepEqual([...target.values], before);
});
test('empty previous saves can be restored and only supported keys can be imported', () => {
  assert.doesNotThrow(() => parseBackup(JSON.stringify(createBackup(new MemoryStorage()))));
  const backup = createBackup(fixture()); backup.entries.other_app = '{}';
  assert.throws(() => parseBackup(JSON.stringify(backup)), /unsupported/);
});
