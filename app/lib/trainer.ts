/* Trainer + Pokémon sheet shapes, shared between the Characters page (which
   edits them) and the landing Pokédex (which reads them to personalise the
   device). They used to live inside the Characters page module; the landing
   can't import from there without pulling in the whole ~2MB Pokémon dataset,
   so the shapes and the blank-trainer factory live here instead. */
import { Rank, TrainerAge } from "../data/game-rules";
import { loadFromStorage, saveToStorage } from "./storage";

/* Pokémon can be Genderless (no data set here carries per-species gender
   ratios to roll against), so "Unknown" exists as a distinct fourth state
   from an intentional "Genderless" choice — it's what every sheet starts
   as until a player actually picks one. Trainers are always people, so
   there's no Genderless state for them, just an unset "Unspecified". */
export type PokemonGender = "Male" | "Female" | "Genderless" | "Unknown";
export type TrainerGender = "Male" | "Female" | "Unspecified";

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
    gender: s.gender ?? "Unknown",
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
