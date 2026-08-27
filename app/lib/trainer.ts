/* Trainer + Pokémon sheet shapes, shared between the Characters page (which
   edits them) and the landing Pokédex (which reads them to personalise the
   device). They used to live inside the Characters page module; the landing
   can't import from there without pulling in the whole ~2MB Pokémon dataset,
   so the shapes and the blank-trainer factory live here instead. */
import { Rank, TrainerAge } from "../data/game-rules";
import { loadFromStorage, saveToStorage } from "./storage";
import type { CareState } from "./care";

/* Pokémon can be Genderless, so "Unknown" exists as a distinct fourth state
   from an intentional "Genderless" choice — but it's meant to be transient:
   every sheet gets a real gender resolved for it (see resolveGender below)
   the first time it's normalized, so "Unknown" only shows up mid-migration,
   never as a Pokémon's actual permanent state. Trainers are always people,
   so there's no Genderless state for them, just an unset "Unspecified" that
   IS meant to persist until a player chooses to fill it in. */
export type PokemonGender = "Male" | "Female" | "Genderless" | "Unknown";
export type TrainerGender = "Male" | "Female" | "Unspecified";

/* Species that are always Genderless in the mainline games — legendaries
   and mythicals, plus the handful of ordinary lines (Magnemite, Ditto,
   Unown, Beldum, etc.) that never had a gender to begin with. This file
   deliberately doesn't import the ~2MB Pokémon dataset (see header comment),
   so a per-species "legendary" flag isn't available here — this is a
   hand-maintained dex-number list instead. Not perfectly exhaustive for the
   newest generations, but covers every mainstream case a resolveGender call
   is likely to hit. */
const GENDERLESS_DEX_NUMBERS = new Set<number>([
  // Ordinary genderless lines
  81, 82, 462,   // Magnemite/Magneton/Magnezone
  100, 101,      // Voltorb/Electrode
  120, 121,      // Staryu/Starmie
  132,           // Ditto
  201,           // Unown
  299, 476,      // Nosepass/Probopass
  337, 338,      // Lunatone/Solrock
  343, 344,      // Baltoy/Claydol
  374, 375, 376, // Beldum/Metang/Metagross
  436, 437,      // Bronzor/Bronzong
  479,           // Rotom
  599, 600, 601, // Klink/Klang/Klinklang
  622, 623,      // Golett/Golurk
  679, 680, 681, // Honedge/Doublade/Aegislash
  703,           // Carbink
  769, 770,      // Sandygast/Palossand
  774,           // Minior
  870,           // Falinks
  781,           // Dhelmise
  // Legendaries / mythicals (Gen 1-8)
  144, 145, 146, 150, 151,
  243, 244, 245, 249, 250, 251,
  377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
  480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
  494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649,
  716, 717, 718, 719, 720, 721,
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809,
  888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898,
]);

/** Resolves an "Unknown" gender into a real one — Genderless for a species
 * that's always Genderless, otherwise a coin flip between Male and Female.
 * Anything already resolved (including a deliberate "Genderless" pick for a
 * species not on the list above) passes through untouched. */
export function resolveGender(number: number, current: PokemonGender): PokemonGender {
  if (current !== "Unknown") return current;
  if (GENDERLESS_DEX_NUMBERS.has(number)) return "Genderless";
  return Math.random() < 0.5 ? "Male" : "Female";
}

/** True for a species that's always Genderless (see the dex-number list
 * above) — the one case where offering Male/Female as a choice would be
 * wrong, not just redundant. */
export function isAlwaysGenderless(number: number): boolean {
  return GENDERLESS_DEX_NUMBERS.has(number);
}

export interface TrainerData {
  id: string; name: string; playerName: string; concept: string; nature: string;
  age: TrainerAge; rank: Rank; money: number; gender: TrainerGender;
  attributes: { strength: number; dexterity: number; vitality: number; insight: number };
  socialAttributes: { tough: number; cool: number; beauty: number; cute: number; clever: number };
  skills: { brawl: number; channel: number; clash: number; evasion: number; alert: number; athletic: number; nature: number; stealth: number; empathy: number; etiquette: number; intimidate: number; perform: number; crafts: number; lore: number; medicine: number; science: number };
  customSkills: { name: string; points: number }[];
  inventory: { name: string; quantity: number; description: string }[];
  equippedItem: string;  // bike, fishing rod, etc. — persistent
  battleItem: string;    // Key Stone / Z-Power Ring / Dynamax Band / Tera Orb
  achievements: string[]; notes: string; gymBadges: boolean[]; pokemon: string[];
  pcBox: string[]; // pokemon sheet keys stored in PC
  spriteId?: string; // key into TRAINER_SPRITES, "" = none chosen
}

/* Front/back battler sprites, sourced from the Pokémon Essentials community
   asset pack — files live in /public/sprites/trainers (front) and
   /public/sprites/trainers/back (back), named "<id>.png". */
export const TRAINER_SPRITES: { id: string; label: string }[] = [
  { id: "red", label: "Red" },
  { id: "leaf", label: "Leaf" },
  { id: "brendan", label: "Brendan" },
  { id: "may", label: "May" },
];

export interface PokemonSheetData {
  number: number;
  nickname: string;
  gender: PokemonGender;
  rank: Rank;
  loyalty: number;  // 0-5
  happiness: number; // 0-5
  attributes: { strength: number; dexterity: number; vitality: number; special: number; insight: number };
  trainingAttributes: { strength: number; dexterity: number; vitality: number; special: number; insight: number };
  socialAttributes: { tough: number; cool: number; beauty: number; cute: number; clever: number };
  skills: { brawl: number; channel: number; clash: number; evasion: number; alert: number; athletic: number; nature: number; stealth: number; charm: number; etiquette: number; intimidate: number; perform: number };
  moves: string[]; // active move names (max insight+3)
  partnerMoves: string[]; // bonus moves unlocked by Partner status
  isPartner: boolean;
  nature: string;
  origin: "wild" | "egg" | "trade";
  heldItem: string; // item name from trainer inventory, "" = none
  cruelty: boolean;
  inPokeball: boolean;
  happinessPending: number; // overflow happiness toward loyalty (2 = +1 loyalty)
  notes: string;
  /** TamaPoke's real-time care state — see app/lib/care.ts. Undefined means
   *  "never opened the Care page for this one yet," not "no care needed";
   *  app/care/page.tsx lazily initializes it to a fresh blankCare() the
   *  first time it actually looks at this sheet, rather than migrating
   *  every existing sheet up front. */
  care?: CareState;
}

export function makeBlankTrainer(): TrainerData {
  return {
    id: Date.now().toString(), name: "", playerName: "", concept: "", nature: "Hardy",
    age: "Teen", rank: "Rookie", money: 2000, gender: "Unspecified",
    attributes: { strength: 1, dexterity: 1, vitality: 1, insight: 1 },
    socialAttributes: { tough: 1, cool: 1, beauty: 1, cute: 1, clever: 1 },
    skills: { brawl: 0, channel: 0, clash: 0, evasion: 0, alert: 0, athletic: 0, nature: 0, stealth: 0, empathy: 0, etiquette: 0, intimidate: 0, perform: 0, crafts: 0, lore: 0, medicine: 0, science: 0 },
    customSkills: [], inventory: [], equippedItem: "", battleItem: "",
    achievements: [], notes: "", gymBadges: Array(8).fill(false), pokemon: [], pcBox: [],
    spriteId: "",
  };
}

/* Which saved trainer this device is currently "playing as". Several trainers
   can exist (a GM keeps NPCs alongside their own), so the landing needs one
   named owner rather than guessing. */
export const TRAINERS_KEY = "trainers";
export const SHEETS_KEY = "pokemon_sheets";
export const ACTIVE_TRAINER_KEY = "active_trainer_id";

export function getActiveTrainer(trainers: TrainerData[]): TrainerData | null {
  if (trainers.length === 0) return null;
  const id = loadFromStorage<string>(ACTIVE_TRAINER_KEY, "");
  // Falling back to the first trainer keeps existing saves working: they
  // predate this key and would otherwise look like nobody is playing.
  return trainers.find(t => t.id === id) ?? trainers[0];
}

export function setActiveTrainer(id: string) {
  saveToStorage(ACTIVE_TRAINER_KEY, id);
}

const BLANK_TRAINER_SKILLS = makeBlankTrainer().skills;
const BLANK_SOCIAL: TrainerData["socialAttributes"] = { tough: 1, cool: 1, beauty: 1, cute: 1, clever: 1 };
const BLANK_POKEMON_SKILLS: PokemonSheetData["skills"] = { brawl: 0, channel: 0, clash: 0, evasion: 0, alert: 0, athletic: 0, nature: 0, stealth: 0, charm: 0, etiquette: 0, intimidate: 0, perform: 0 };

/* Skills 3.0 dropped Capture (catching already rolls Channel) and added
   Empathy/Crafts/Lore/Medicine/Science; Pokémon gained Charm and Etiquette.
   Saves made before that migration are missing the new keys and carry the
   stale "capture" one — merge in defaults for what's missing rather than
   silently hiding the new skills on every pre-existing character. */
export function normalizeTrainer(t: TrainerData): TrainerData {
  const skills = { ...BLANK_TRAINER_SKILLS, ...t.skills } as Record<string, number>;
  delete skills.capture;
  return {
    ...t,
    socialAttributes: t.socialAttributes ?? BLANK_SOCIAL,
    skills: skills as TrainerData["skills"],
    gender: t.gender ?? "Unspecified",
  };
}

export function normalizePokemonSheet(s: PokemonSheetData): PokemonSheetData {
  return {
    ...s,
    socialAttributes: s.socialAttributes ?? BLANK_SOCIAL,
    skills: { ...BLANK_POKEMON_SKILLS, ...s.skills },
    gender: resolveGender(s.number, s.gender ?? "Unknown"),
  };
}

/* Reads + migrates in one step, and writes the migrated shape straight back
   so every other page's plain loadFromStorage("trainers"/"pokemon_sheets")
   call also sees the fixed data from then on, without having to route every
   read site through these helpers. */
export function loadTrainers(): TrainerData[] {
  const raw = loadFromStorage<TrainerData[]>(TRAINERS_KEY, []);
  const normalized = raw.map(normalizeTrainer);
  if (JSON.stringify(normalized) !== JSON.stringify(raw)) saveToStorage(TRAINERS_KEY, normalized);
  return normalized;
}

export function loadPokemonSheets(): Record<string, PokemonSheetData> {
  const raw = loadFromStorage<Record<string, PokemonSheetData>>(SHEETS_KEY, {});
  const normalized = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, normalizePokemonSheet(v)]));
  if (JSON.stringify(normalized) !== JSON.stringify(raw)) saveToStorage(SHEETS_KEY, normalized);
  return normalized;
}
