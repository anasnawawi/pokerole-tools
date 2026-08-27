/* Shared Pokémon-training mechanic — the same dice-pool rules the
   Characters page's Training Mode roll uses (trainerAttr + trainerSkill
   dice, 4+ is a success, 2 successes = +1 training point toward the
   attribute, +1 Happiness per completed session). app/care/page.tsx's
   timed Training sessions resolve against this so the numbers stay one
   mechanic in two places, not a fork. */
import { PokemonSheetData, TrainerData } from "./trainer";
import { POKEMON } from "../data/pokerole-data";

export type TrainAttr = "strength" | "dexterity" | "vitality" | "special" | "insight";

export const TRAINING_ROLLS: Record<TrainAttr, {
  trainerAttr: "strength" | "dexterity" | "vitality" | "insight";
  trainerSkill: "brawl" | "channel" | "athletic" | "nature";
  label: string;
}> = {
  strength:  { trainerAttr: "strength",  trainerSkill: "brawl",    label: "STR" },
  dexterity: { trainerAttr: "dexterity", trainerSkill: "athletic", label: "DEX" },
  vitality:  { trainerAttr: "vitality",  trainerSkill: "nature",   label: "VIT" },
  special:   { trainerAttr: "insight",   trainerSkill: "channel",  label: "SPC" },
  insight:   { trainerAttr: "insight",   trainerSkill: "nature",   label: "INS" },
};

/** The dice pool a training roll for this attribute gets, straight from the
 *  trainer's own attribute + skill — this is "the trainer's stat" the
 *  session's efficiency (see trainingDurationMs) is tied to. */
export function trainingPool(trainer: TrainerData, attr: TrainAttr): number {
  const cfg = TRAINING_ROLLS[attr];
  return (trainer.attributes[cfg.trainerAttr] ?? 0) + (trainer.skills[cfg.trainerSkill] ?? 0);
}

/** How many more training points this attribute can still take — species
 *  cap (or the Partner-status floor of 10) minus what's already banked as
 *  real attribute points. Mirrors the Characters page's own cap logic. */
export function attributeCap(sheet: PokemonSheetData, attr: TrainAttr): number {
  const species = POKEMON.find(p => p.number === sheet.number);
  const speciesCap = species?.attributeLimits?.[attr] ?? Math.min((species?.attributes[attr] ?? 1) + 4, 8);
  const cap = sheet.isPartner ? Math.max(10, speciesCap) : speciesCap;
  return Math.max(0, cap - sheet.attributes[attr]);
}

/** A bigger dice pool trains faster — "the better the trainer's stat... the
 *  more efficient the training," per spec. Clamped so a pool of 0 doesn't
 *  stall forever and a huge one doesn't finish instantly. */
export function trainingDurationMs(pool: number): number {
  const minutes = Math.min(150, Math.max(20, Math.round(180 / Math.max(1, pool))));
  return minutes * 60 * 1000;
}

/** Real exertion — hunger and cleanliness both take a hit sized to how
 *  long the session runs, paid up front when it starts (see care.ts's
 *  `spend`), not dripped out over the session. */
export function trainingCareCost(durationMs: number): { hunger: number; cleanliness: number } {
  const minutes = durationMs / 60000;
  const cost = Math.round(Math.min(35, Math.max(8, minutes / 5)));
  return { hunger: cost, cleanliness: Math.round(cost * 0.7) };
}

export function rollD6(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, () => Math.ceil(Math.random() * 6));
}

export function countSuccesses(rolls: number[]): number {
  return rolls.filter(r => r >= 4).length;
}

/** Mirrors the Characters page's happiness/loyalty carry-over rules — a
 *  Cruelty-trained Pokémon loses happiness/loyalty from what would
 *  otherwise be a gain, a held Soothe Bell adds one, and every 2 points of
 *  Happiness overflow above the 0–5 cap becomes +1 Loyalty. Reused as-is
 *  for both Training completions and wild-encounter outcomes (see
 *  app/care/page.tsx) — same currency, same rules, regardless of source. */
export function applyHappinessGain(sheet: PokemonSheetData, delta: number, source?: "training"): Partial<PokemonSheetData> {
  const isCrueltyTraining = !!sheet.cruelty && source === "training" && delta > 0;
  const hasSootherBell = (sheet.heldItem ?? "") === "Soothe Bell";
  const bell = (!isCrueltyTraining && hasSootherBell && delta > 0) ? 1 : 0;
  const effective = isCrueltyTraining ? -delta : (delta + bell);
  const rawNew = (sheet.happiness ?? 0) + effective;
  const newHappiness = Math.max(0, Math.min(5, rawNew));
  let pending = sheet.happinessPending ?? 0;
  let newLoyalty = sheet.loyalty ?? 0;
  if (effective > 0 && rawNew > 5) {
    pending += rawNew - 5;
    if (pending >= 2) { newLoyalty = Math.min(5, newLoyalty + Math.floor(pending / 2)); pending = pending % 2; }
  }
  if (isCrueltyTraining) { newLoyalty = Math.max(0, newLoyalty - 1); pending = sheet.happinessPending ?? 0; }
  return { happiness: newHappiness, loyalty: newLoyalty, happinessPending: pending };
}
