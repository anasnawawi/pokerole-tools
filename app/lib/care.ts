/* TamaPoke — the real-time care loop. Pure, storage-agnostic functions only;
   app/care/page.tsx owns loading/saving. Formulas are adapted from
   Lingelo/poketama (MIT licensed) — see the roadmap doc this was built from
   for the full writeup of what was and wasn't carried over.

   One deliberate departure from that reference: poketama's neglected pets
   can die permanently (a MemorialEntry). Here, sustained neglect instead
   makes a Pokémon Inconsolable — Happiness and Loyalty (already 0–5 fields
   on the sheet) drop to their absolute floor, and every care action here is
   locked out. The only way back is healing it for real, in the Battle
   Tracker (see the `upd` hook in battle-tracker/page.tsx that clears
   `inconsolable` the moment a linked entry's HP goes up) — neglect has a
   real consequence, but never a permanent one, and this system alone can
   never inflict it; only genuine table play can lift it. */

/** Points lost per gauge per real-time hour, while the tab is open. */
export const DECAY_RATE_PER_HOUR = 5;

/** Decay multiplier during night hours (22:00–06:00). */
export const NIGHT_DECAY_MULTIPLIER = 0.5;

/** Affection gained per real-time hour during night instead of decaying — a
 *  sleeping Pokémon's bond doesn't need tending the way its hunger does. */
export const NIGHT_AFFECTION_REGEN_PER_HOUR = 2;

/** A single gauge below this needs visible attention (badges, warnings). */
export const CRITICAL_THRESHOLD = 15;

/** All three gauges at or below this at once is what tips a Pokémon into
 *  Inconsolable — not one bad day, but every need going unmet at the same
 *  time for long enough to get there. */
export const INCONSOLABLE_THRESHOLD = 5;

/** How many real hours of *offline* decay (time-since-last-visit, applied
 *  in one step on reopen) count at the full linear rate before tapering. */
export const OFFLINE_LINEAR_CAP_HOURS = 12;

/** Offline-only decay never pushes a gauge below this — deliberately above
 *  INCONSOLABLE_THRESHOLD, so simply being away, however long, can never by
 *  itself tip a Pokémon into Inconsolable. Live decay (applyLiveTick, for
 *  time that passes while the page is actually open) has no such floor and
 *  is the only path that can — see the module comment above. */
export const OFFLINE_FLOOR = 10;

export interface CareGauges {
  hunger: number;
  cleanliness: number;
  affection: number;
}

/** A Training session in progress — see app/lib/training.ts for the dice
 *  mechanic it resolves into and app/care/page.tsx for the timer/animation.
 *  `attr` is one of training.ts's TrainAttr values; kept as a bare string
 *  here (rather than importing that type) so this file never has to import
 *  anything from training.ts, which itself imports PokemonSheetData from
 *  trainer.ts — trainer.ts already imports CareState from here, and a
 *  three-way type cycle isn't worth the risk for one union type. */
export interface TrainingSession {
  attr: string;
  startedAt: number;
  durationMs: number;
  /** The trainer's dice pool at the moment training started — resolved
   *  against this, not whatever the trainer's stats are by the time the
   *  session finishes, so a mid-session stat change can't retroactively
   *  change a roll that (narratively) already happened. */
  pool: number;
}

export interface CareState {
  gauges: CareGauges;
  /** Epoch ms — every tick function reads elapsed time from this and then
   *  advances it; callers persist the returned state. */
  lastTickAt: number;
  /** True once neglect has crossed INCONSOLABLE_THRESHOLD on every gauge at
   *  once. Locks out every action in app/care/page.tsx until cleared. */
  inconsolable: boolean;
  /** Epoch ms of the last successful Groom — see GROOM_COOLDOWN_MS/canGroom
   *  below. Undefined means "never groomed here," which reads as off
   *  cooldown. */
  lastGroomedAt?: number;
  /** Set while a Training session (see app/lib/training.ts) is running;
   *  cleared once app/care/page.tsx resolves it. */
  training?: TrainingSession;
}

/** Real items from data/items-data.ts, not invented ones — Feed only works
 *  with something actually in the Bag, and the potency scales with what the
 *  item is (High-Performance Food's flavor text even calls out training). */
export const FOOD_ITEMS: Record<string, number> = {
  "Dry Food": 20,
  "Meal Rations": 30,
  "Gourmet Food": 45,
  "High-Performance Food": 25,
};

/** Groom needs this in the Bag, but — unlike food — it isn't consumed
 *  (items-data.ts marks it oneUse:false). What limits Groom to "regular
 *  care" instead of a spammable button is the cooldown below. */
export const GROOM_ITEM = "Grooming Kit";
export const GROOM_COOLDOWN_MS = 8 * 60 * 60 * 1000;

export function canGroom(care: CareState, now: number = Date.now()): boolean {
  return !care.lastGroomedAt || now - care.lastGroomedAt >= GROOM_COOLDOWN_MS;
}

function clampGauge(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** A freshly-tended Pokémon that's never had `care` before — full gauges,
 *  ticking from right now. */
export function blankCare(now: number = Date.now()): CareState {
  return {
    gauges: { hunger: 100, cleanliness: 100, affection: 100 },
    lastTickAt: now,
    inconsolable: false,
  };
}

/** True when `now`'s clock hour falls in the night window. */
export function isNightTime(now: Date = new Date()): boolean {
  const hour = now.getHours();
  return hour >= 22 || hour < 6;
}

/** True once every gauge has been neglected down to the floor at the same
 *  time — the trigger for going Inconsolable. */
export function isThoroughlyNeglected(gauges: CareGauges): boolean {
  return (
    gauges.hunger <= INCONSOLABLE_THRESHOLD &&
    gauges.cleanliness <= INCONSOLABLE_THRESHOLD &&
    gauges.affection <= INCONSOLABLE_THRESHOLD
  );
}

/** True when any single gauge is low enough to flag for attention (a party
 *  strip dot, a home-screen badge) — a much lower bar than Inconsolable. */
export function needsAttention(care: CareState): boolean {
  const { hunger, cleanliness, affection } = care.gauges;
  return (
    hunger <= CRITICAL_THRESHOLD ||
    cleanliness <= CRITICAL_THRESHOLD ||
    affection <= CRITICAL_THRESHOLD
  );
}

/** Decay to apply for elapsed real time while the app is actually open —
 *  the ordinary per-visit tick, not the reopen-after-a-while catch-up
 *  (applyOfflineTick below handles that one, with a different curve). Also
 *  the only path that can push a gauge low enough to trip Inconsolable —
 *  offline decay alone never can (see OFFLINE_FLOOR). */
export function applyLiveTick(care: CareState, deltaMs: number, now: Date = new Date()): CareState {
  if (deltaMs <= 0) return care;
  const hours = deltaMs / (1000 * 60 * 60);
  const night = isNightTime(now);
  const multiplier = night ? NIGHT_DECAY_MULTIPLIER : 1;
  const decay = DECAY_RATE_PER_HOUR * hours * multiplier;

  const gauges: CareGauges = {
    hunger: clampGauge(care.gauges.hunger - decay),
    cleanliness: clampGauge(care.gauges.cleanliness - decay),
    affection: night
      ? clampGauge(care.gauges.affection + NIGHT_AFFECTION_REGEN_PER_HOUR * hours)
      : clampGauge(care.gauges.affection - decay),
  };

  return {
    ...care,
    gauges,
    lastTickAt: care.lastTickAt + deltaMs,
    inconsolable: care.inconsolable || isThoroughlyNeglected(gauges),
  };
}

/** Decay to apply in one step for time elapsed while the tab was closed —
 *  linear for the first OFFLINE_LINEAR_CAP_HOURS, logarithmic after, and
 *  floored at OFFLINE_FLOOR rather than 0. Never trips Inconsolable on its
 *  own: the floor sits above INCONSOLABLE_THRESHOLD on purpose, so simply
 *  being away — however long — can't do what active neglect can. */
export function applyOfflineTick(care: CareState, elapsedMs: number): CareState {
  if (elapsedMs <= 0) return care;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const decay = computeOfflineDecay(elapsedHours);

  const floor = (value: number) => Math.max(OFFLINE_FLOOR, Math.min(100, value - decay));
  const gauges: CareGauges = {
    hunger: floor(care.gauges.hunger),
    cleanliness: floor(care.gauges.cleanliness),
    affection: floor(care.gauges.affection),
  };

  return { ...care, gauges, lastTickAt: care.lastTickAt + elapsedMs, inconsolable: care.inconsolable };
}

function computeOfflineDecay(elapsedHours: number): number {
  if (elapsedHours <= OFFLINE_LINEAR_CAP_HOURS) return elapsedHours * DECAY_RATE_PER_HOUR;
  const linearPortion = OFFLINE_LINEAR_CAP_HOURS * DECAY_RATE_PER_HOUR;
  const logPortion = Math.log(elapsedHours - OFFLINE_LINEAR_CAP_HOURS + 1) * DECAY_RATE_PER_HOUR;
  return linearPortion + logPortion;
}

/** A short gap since the last tick reads as "the page was open and time
 *  passed" (applyLiveTick); anything longer reads as "the tab was closed"
 *  (applyOfflineTick), even though this function can't actually tell which
 *  one happened — it's just picking the more forgiving curve for gaps too
 *  long to plausibly have been a single open session. */
const LIVE_TICK_MAX_MS = 30 * 60 * 1000; // 30 minutes

/** The one entry point callers should use: bring `care` up to date as of
 *  `now`, picking the live or offline curve based on how big the gap is.
 *  Call this once on page load, and again on a periodic interval (see
 *  app/care/page.tsx) while the Care page stays open, so a Pokémon left
 *  neglected in an open tab decays for real instead of only catching up in
 *  one lump the next time someone visits. */
export function tick(care: CareState, now: number = Date.now()): CareState {
  const elapsed = now - care.lastTickAt;
  if (elapsed <= 0) return care;
  if (elapsed <= LIVE_TICK_MAX_MS) return applyLiveTick(care, elapsed, new Date(now));
  return applyOfflineTick(care, elapsed);
}

// ── Care actions ─────────────────────────────────────────────────────────
// Locked out entirely while inconsolable — callers should check that first
// and route to "go heal them" instead of calling these.

export function feed(care: CareState, amount = 30): CareState {
  return { ...care, gauges: { ...care.gauges, hunger: clampGauge(care.gauges.hunger + amount) } };
}

export function groom(care: CareState, amount = 30, now: number = Date.now()): CareState {
  return { ...care, lastGroomedAt: now, gauges: { ...care.gauges, cleanliness: clampGauge(care.gauges.cleanliness + amount) } };
}

/** Walking raises affection but — same trade-off poketama's CareActions.ts
 *  uses — costs some cleanliness in return, so the three needs pull against
 *  each other instead of each just filling up in isolation. */
export function walk(care: CareState, affectionAmount = 25, cleanlinessCost = 10): CareState {
  return {
    ...care,
    gauges: {
      ...care.gauges,
      affection: clampGauge(care.gauges.affection + affectionAmount),
      cleanliness: clampGauge(care.gauges.cleanliness - cleanlinessCost),
    },
  };
}

/** A real activity — a Training session, a Walk that turns into a fight —
 *  costs real gauges, spent all at once rather than dripped out, since
 *  these are one-shot events, not ongoing decay. Never routes through
 *  Inconsolable on its own (clampGauge floors at 0, same as decay) — it's
 *  additive with whatever neglect was already there, not a separate
 *  trigger. */
export function spend(care: CareState, cost: Partial<CareGauges>): CareState {
  return {
    ...care,
    gauges: {
      hunger: clampGauge(care.gauges.hunger - (cost.hunger ?? 0)),
      cleanliness: clampGauge(care.gauges.cleanliness - (cost.cleanliness ?? 0)),
      affection: clampGauge(care.gauges.affection - (cost.affection ?? 0)),
    },
  };
}

/** Called when a linked Battle Tracker entry actually gets healed — the
 *  only door out of Inconsolable. Leaves the gauges wherever they were
 *  (a fresh, modest baseline, not full) so the Pokémon still needs real
 *  care afterward; Happiness/Loyalty on the sheet are a separate concern
 *  the caller handles (they stay at their floor until rebuilt normally). */
export function healedInBattle(care: CareState): CareState {
  if (!care.inconsolable) return care;
  return {
    ...care,
    gauges: { hunger: 30, cleanliness: 30, affection: 30 },
    lastTickAt: Date.now(),
    inconsolable: false,
  };
}
