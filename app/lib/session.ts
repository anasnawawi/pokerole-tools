/* The player's save, read once and shared by everything that displays it —
   the landing device and the party bar the tool pages carry.

   localStorage is an external store, so it's read through useSyncExternalStore
   rather than an effect: the server snapshot is null (no storage during SSR)
   and React swaps in the client snapshot after hydration, with no markup
   mismatch. getSnapshot runs on every render and must return a stable
   identity, so the result is cached against the raw stored text — which also
   means arriving from another tool re-reads changed data instead of showing
   whatever was true at first mount. */
import { useSyncExternalStore } from "react";
import { loadFromStorage, rawFromStorage } from "./storage";
import {
  TrainerData, PokemonSheetData, getActiveTrainer,
  TRAINERS_KEY, SHEETS_KEY, ACTIVE_TRAINER_KEY,
} from "./trainer";

/* Only the fields the party display needs. The battle tracker's own entry
   type is far larger and lives with the tracker. */
export type BattleLite = {
  linkedPokemonSheetKey?: string;
  currentHp: number; maxHp: number;
  currentWill: number; maxWill: number;
  statuses?: string[];
};

export type Session = {
  /** Whoever the device is currently playing as. */
  trainer: TrainerData | null;
  /** Everyone saved — a GM keeps NPCs alongside their own trainer, and the
   *  device's round key cycles between them. */
  trainers: TrainerData[];
  sheets: Record<string, PokemonSheetData>;
  battle: BattleLite[];
};

export const BATTLE_KEY = "bt_entries";
const SESSION_KEYS = [TRAINERS_KEY, SHEETS_KEY, BATTLE_KEY, ACTIVE_TRAINER_KEY];

let sessionRaw: string | null = null;
let sessionCache: Session = { trainer: null, trainers: [], sheets: {}, battle: [] };

function readSession(): Session {
  const raw = SESSION_KEYS.map(rawFromStorage).join(" ");
  if (raw !== sessionRaw) {
    sessionRaw = raw;
    const trainers = loadFromStorage<TrainerData[]>(TRAINERS_KEY, []) ?? [];
    sessionCache = {
      trainer: getActiveTrainer(trainers),
      trainers,
      sheets: loadFromStorage<Record<string, PokemonSheetData>>(SHEETS_KEY, {}) ?? {},
      battle: loadFromStorage<BattleLite[]>(BATTLE_KEY, []) ?? [],
    };
  }
  return sessionCache;
}

/* Cross-tab writes fire "storage"; this tab's own writes call notifySession
   directly, since the storage event never fires in the tab that wrote. */
const listeners = new Set<() => void>();
function subscribeSession(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}
export function notifySession() { listeners.forEach(cb => cb()); }
const serverSession = (): Session | null => null;

/** The save, or null until the client snapshot is in (i.e. during SSR). */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, readSession, serverSession);
}

/** A trainer's party: their sheet keys in order, capped at the six a Pokémon
 *  game allows. Dangling keys are dropped — that's a data fault, not a slot. */
export function partyOf(session: Session | null) {
  const keys = (session?.trainer?.pokemon ?? []).slice(0, 6);
  return keys
    .map(key => ({ key, sheet: session?.sheets[key] }))
    .filter((p): p is { key: string; sheet: PokemonSheetData } => !!p.sheet);
}
