import { STORAGE_PREFIX } from "./storage";

export const BACKUP_KEYS = ["trainers", "pokemon_sheets", "active_trainer_id", "gm_notes", "gm_grid", "gm_dims"] as const;
const TRANSIENT_KEYS = ["bt_entries", "bt_hazards", "bt_started", "encounter_queue", "pending_link"];
export const RECOVERY_KEY = `${STORAGE_PREFIX}backup_previous`;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export type SaveBackup = { format: "pokerole-save"; version: 1; createdAt: string; entries: Record<string, string> };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const numbers = (v: unknown, keys: string[]) => record(v) && keys.every(k => typeof v[k] === "number" && Number.isFinite(v[k]));
const stats = (v: unknown, keys: string[]) => numbers(v, keys) && record(v) && keys.every(k => Number.isInteger(v[k]) && Number(v[k]) >= 0 && Number(v[k]) <= 100);
const ranks = ["Starter", "Rookie", "Standard", "Advanced", "Expert", "Ace", "Master", "Champion"];
const attrs = ["strength", "dexterity", "vitality", "insight"];
const social = ["tough", "cool", "beauty", "cute", "clever"];
const skills = ["brawl", "channel", "clash", "evasion", "alert", "athletic", "nature", "stealth", "etiquette", "intimidate", "perform"];
function requireValid(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

// Validate player data before touching storage. Unknown backup versions and
// unrelated JSON are rejected rather than partially replacing a working save.
export function parseBackup(text: string): SaveBackup {
  requireValid(new Blob([text]).size <= MAX_BACKUP_BYTES, "This backup is too large (maximum 5 MB).");
  let file: unknown;
  try { file = JSON.parse(text); } catch { throw new Error("That file is not valid JSON. Choose a PokeRole backup file."); }
  requireValid(record(file) && file.format === "pokerole-save" && file.version === 1, "Choose a supported PokeRole save backup (version 1).");
  requireValid(typeof file.createdAt === "string" && Number.isFinite(Date.parse(file.createdAt)) && record(file.entries), "The backup header is incomplete.");
  const entries = file.entries;
  requireValid(Object.keys(entries).every(k => BACKUP_KEYS.includes(k as typeof BACKUP_KEYS[number]) && typeof entries[k] === "string"), "The backup contains unsupported or missing save data.");
  const data: Record<string, unknown> = Object.create(null);
  for (const [key, raw] of Object.entries(entries)) {
    try { data[key] = JSON.parse(raw as string); } catch { throw new Error(`The ${key} save data is damaged.`); }
  }
  const trainers = data.trainers === undefined ? [] : data.trainers;
  const sheets = data.pokemon_sheets === undefined ? {} : data.pokemon_sheets;
  requireValid(Array.isArray(trainers) && record(sheets), "Trainer or Pokémon data is invalid.");
  const ids = new Set<string>();
  for (const t of trainers) {
    requireValid(record(t) && ["id", "name", "playerName", "concept", "nature", "notes", "equippedItem", "battleItem"].every(k => typeof t[k] === "string") && !!t.id && !ids.has(t.id as string), "A trainer has missing fields or a duplicate ID.");
    ids.add(t.id as string);
    requireValid(ranks.includes(t.rank as string) && ["Child", "Teen", "Adult", "Senior"].includes(t.age as string) && (t.mode === undefined || ["trainer", "pokemon"].includes(t.mode as string)), "A trainer has an unsupported rank, age or game mode.");
    requireValid(typeof t.money === "number" && Number.isFinite(t.money) && stats(t.attributes, attrs) && stats(t.skills, skills) && (t.socialAttributes === undefined || stats(t.socialAttributes, social)), "A trainer has invalid stats.");
    requireValid(strings(t.pokemon) && t.pokemon.length <= 6 && (t.pcBox === undefined || strings(t.pcBox)) && strings(t.achievements) && Array.isArray(t.gymBadges) && t.gymBadges.length === 8 && t.gymBadges.every(x => typeof x === "boolean"), "A trainer's party, badges or achievements are invalid.");
    requireValid(Array.isArray(t.inventory) && t.inventory.every(i => record(i) && typeof i.name === "string" && typeof i.description === "string" && typeof i.quantity === "number" && Number.isFinite(i.quantity)), "A trainer's inventory is invalid.");
    requireValid(Array.isArray(t.customSkills) && t.customSkills.every(s => record(s) && typeof s.name === "string" && typeof s.points === "number" && Number.isFinite(s.points)), "A trainer's custom skills are invalid.");
    requireValid([...t.pokemon, ...((t.pcBox ?? []) as string[])].every(k => Object.hasOwn(sheets, k)), "A trainer refers to a Pokémon missing from this backup.");
  }
  for (const s of Object.values(sheets)) {
    requireValid(record(s) && typeof s.number === "number" && Number.isInteger(s.number) && s.number >= 0 && s.number <= 1025 && ranks.includes(s.rank as string), "A Pokémon has an unsupported species number or rank.");
    requireValid(["nickname", "nature", "heldItem", "notes"].every(k => typeof s[k] === "string") && ["wild", "egg", "trade"].includes(s.origin as string) && numbers(s, ["loyalty", "happiness", "happinessPending"]), "A Pokémon has missing identity or care fields.");
    requireValid(stats(s.attributes, [...attrs, "special"]) && stats(s.trainingAttributes, [...attrs, "special"]) && stats(s.skills, skills) && (s.socialAttributes === undefined || stats(s.socialAttributes, social)) && strings(s.moves) && strings(s.partnerMoves), "A Pokémon's stats or moves are invalid.");
    requireValid(["isPartner", "cruelty", "inPokeball"].every(k => typeof s[k] === "boolean"), "A Pokémon's flags are invalid.");
    if (s.care !== undefined) requireValid(record(s.care) && numbers(s.care.gauges, ["hunger", "cleanliness", "affection"]) && numbers(s.care, ["lastTickAt"]) && typeof s.care.inconsolable === "boolean" && (s.care.training === undefined || (record(s.care.training) && typeof s.care.training.attr === "string" && numbers(s.care.training, ["startedAt", "durationMs", "pool"]))), "A Pokémon's care state is invalid.");
  }
  if (data.active_trainer_id !== undefined) requireValid(typeof data.active_trainer_id === "string" && (!data.active_trainer_id || ids.has(data.active_trainer_id)), "The active trainer is missing from this backup.");
  if (data.gm_notes !== undefined) requireValid(typeof data.gm_notes === "string", "GM notes are invalid.");
  if (data.gm_dims !== undefined) requireValid(numbers(data.gm_dims, ["cols", "rows"]) && record(data.gm_dims) && [data.gm_dims.cols, data.gm_dims.rows].every(n => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 12), "The GM grid size is invalid.");
  if (data.gm_grid !== undefined) requireValid(Array.isArray(data.gm_grid) && data.gm_grid.length <= 48 && data.gm_grid.every(p => p === null || (record(p) && typeof p.id === "string" && Array.isArray(p.tabs) && p.tabs.length > 0 && p.tabs.every(t => ["tracker", "notes", "weather_ref", "status_ref", "type_chart", "catch_ref", "quick_roll", "encounter", "rules", "characters"].includes(t)) && numbers(p, ["active"]) && ["colSpan", "rowSpan"].every(k => p[k] === undefined || (Number.isInteger(p[k]) && Number(p[k]) >= 1 && Number(p[k]) <= 8)))), "The GM panel layout is invalid.");
  return file as SaveBackup;
}

export function createBackup(storage: Storage, date = new Date()): SaveBackup {
  const entries: Record<string, string> = {};
  for (const key of BACKUP_KEYS) {
    const value = storage.getItem(`${STORAGE_PREFIX}${key}`);
    if (value !== null) entries[key] = value;
  }
  return { format: "pokerole-save", version: 1, createdAt: date.toISOString(), entries };
}

export function backupSummary(backup: SaveBackup) {
  const trainers = JSON.parse(backup.entries.trainers ?? "[]") as { name: string }[];
  const sheets = JSON.parse(backup.entries.pokemon_sheets ?? "{}") as Record<string, unknown>;
  return { trainers: trainers.length, pokemon: Object.keys(sheets).length, names: trainers.map(t => t.name || "Unnamed trainer") };
}

export function restoreBackup(storage: Storage, backup: SaveBackup) {
  const checked = parseBackup(JSON.stringify(backup));
  const keys = [...BACKUP_KEYS, ...TRANSIENT_KEYS].map(k => `${STORAGE_PREFIX}${k}`);
  const previous = new Map([...keys, RECOVERY_KEY].map(k => [k, storage.getItem(k)]));
  let recoveryStored = false;
  try {
    // Keep one previous save for recovery. If there isn't room for it, abort
    // before modifying the current game. The caller reloads after success so
    // mounted autosave effects can't write an old in-memory sheet back.
    storage.setItem(RECOVERY_KEY, JSON.stringify(createBackup(storage)));
    recoveryStored = true;
    for (const key of keys) storage.removeItem(key);
    for (const [key, value] of Object.entries(checked.entries)) storage.setItem(`${STORAGE_PREFIX}${key}`, value);
  } catch {
    // Free partial writes first, then put the original values back.
    if (recoveryStored) {
      for (const key of previous.keys()) storage.removeItem(key);
      for (const [key, value] of previous) if (value !== null) storage.setItem(key, value);
    }
    throw new Error("The restore could not be saved. Your previous save was kept. Check browser storage space and try again.");
  }
}
