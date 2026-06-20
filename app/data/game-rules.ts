// PokeRole 3.0 Game Rules - Mechanical Constants

export type Rank = "Starter" | "Rookie" | "Standard" | "Advanced" | "Expert" | "Ace" | "Master" | "Champion";
export type TrainerAge = "Child" | "Teen" | "Adult" | "Senior";

// Trainer rank bonuses (cumulative points to distribute)
export const TRAINER_RANK_POINTS: Record<Rank, {
  attrPoints: number;
  socialPoints: number;
  skillPoints: number;
  skillLimit: number;
}> = {
  Starter:   { attrPoints: 0,  socialPoints: 0,  skillPoints: 5,  skillLimit: 1 },
  Rookie:    { attrPoints: 2,  socialPoints: 2,  skillPoints: 10, skillLimit: 2 },
  Standard:  { attrPoints: 4,  socialPoints: 4,  skillPoints: 14, skillLimit: 3 },
  Advanced:  { attrPoints: 6,  socialPoints: 6,  skillPoints: 17, skillLimit: 4 },
  Expert:    { attrPoints: 8,  socialPoints: 8,  skillPoints: 19, skillLimit: 5 },
  Ace:       { attrPoints: 10, socialPoints: 10, skillPoints: 20, skillLimit: 5 },
  Master:    { attrPoints: 10, socialPoints: 10, skillPoints: 22, skillLimit: 5 },
  Champion:  { attrPoints: 14, socialPoints: 14, skillPoints: 25, skillLimit: 5 },
};

// Age bonus points (added on top of rank)
export const TRAINER_AGE_POINTS: Record<TrainerAge, { attrPoints: number; socialPoints: number }> = {
  Child:  { attrPoints: 0, socialPoints: 0 },
  Teen:   { attrPoints: 2, socialPoints: 2 },
  Adult:  { attrPoints: 4, socialPoints: 4 },
  Senior: { attrPoints: 3, socialPoints: 6 },
};

// Attributes start at 1, max 5 for trainers
export const TRAINER_ATTR_BASE = 1;
export const TRAINER_ATTR_MAX = 5;

// Pokemon rank attribute limits (base stat + rank upgrades)
export const POKEMON_RANK_ATTR_UPGRADES: Record<Rank, number> = {
  Starter:  0,
  Rookie:   2,
  Standard: 4,
  Advanced: 6,
  Expert:   8,
  Ace:      10,
  Master:   12,
  Champion: 14,
};

// Ranks ordered
export const RANK_ORDER: Rank[] = ["Starter","Rookie","Standard","Advanced","Expert","Ace","Master","Champion"];

export function getRankIndex(rank: Rank): number {
  return RANK_ORDER.indexOf(rank);
}

export function getDisobedienceLevel(pokemonRank: Rank, trainerRank: Rank): "none" | "low" | "high" {
  const diff = getRankIndex(pokemonRank) - getRankIndex(trainerRank);
  if (diff <= 0) return "none";
  if (diff === 1) return "low";
  return "high";
}

// Status conditions with full mechanics
export interface StatusCondition {
  name: string;
  color: string;
  shortDesc: string;
  fullDesc: string;
  battleEffect: string;
  endOfRoundEffect?: string;
  // Dice penalties applied to attacker
  accuracyPenalty?: number;       // reduce accuracy dice pool
  physicalDamagePenalty?: number; // reduce physical damage dice
  cannotAct?: boolean;            // cannot take actions
  requiresRollToAct?: boolean;    // must roll before acting
  rollToActDesc?: string;
}

export const STATUS_CONDITIONS: Record<string, StatusCondition> = {
  Healthy: {
    name: "Healthy", color: "#00d4aa",
    shortDesc: "No ailment.",
    fullDesc: "This Pokémon is in perfect health.",
    battleEffect: "No penalties.",
  },
  Burned: {
    name: "Burned", color: "#f08030",
    shortDesc: "–2 dice Physical; –1 HP/round.",
    fullDesc: "The Pokémon is on fire. It loses 1 HP at the end of each round and physical move damage is reduced by 2 dice.",
    battleEffect: "Physical move damage dice pool –2.",
    endOfRoundEffect: "–1 HP (ignores defenses, typeless)",
    physicalDamagePenalty: 2,
  },
  Frozen: {
    name: "Frozen", color: "#98d8d8",
    shortDesc: "Cannot act. Roll 1d6 each turn (5–6 thaws).",
    fullDesc: "The Pokémon is encased in ice. It cannot act or evade. At the start of its turn roll 1d6 — on 5 or 6 it thaws. Fire-type moves or sunny weather automatically thaws it.",
    battleEffect: "Cannot act or evade. Roll 1d6 each turn — 5 or 6 = thaw.",
    cannotAct: true,
    requiresRollToAct: true,
    rollToActDesc: "Thaw Check: Roll 1d6. On 5–6, thaw and act normally. Otherwise, skip turn.",
  },
  Paralyzed: {
    name: "Paralyzed", color: "#f8d030",
    shortDesc: "–2 accuracy dice; Roll 1d6 (1–2 fail to act).",
    fullDesc: "The Pokémon can barely move. Accuracy dice pool is reduced by 2. At the start of its turn, roll 1d6 — on 1 or 2 it fails to act this turn.",
    battleEffect: "Accuracy rolls –2 dice. Roll 1d6 at turn start (1–2 = cannot act).",
    accuracyPenalty: 2,
    requiresRollToAct: true,
    rollToActDesc: "Paralysis Check: Roll 1d6. On 1–2, cannot act this turn. 3–6, act normally (still –2 accuracy dice).",
  },
  Poisoned: {
    name: "Poisoned", color: "#a040a0",
    shortDesc: "–1 HP/round.",
    fullDesc: "The Pokémon is mildly poisoned. It loses 1 HP at the end of each round. This damage ignores defenses.",
    battleEffect: "No battle dice penalties.",
    endOfRoundEffect: "–1 HP (ignores defenses, Poison type)",
  },
  "Badly Poisoned": {
    name: "Badly Poisoned", color: "#7038f8",
    shortDesc: "–2 HP/round.",
    fullDesc: "The Pokémon is badly poisoned. It loses 2 HP at the end of each round. This damage ignores defenses.",
    battleEffect: "No battle dice penalties.",
    endOfRoundEffect: "–2 HP (ignores defenses, Poison type)",
  },
  Asleep: {
    name: "Asleep", color: "#705898",
    shortDesc: "Cannot act. Roll 1d6 each turn (4–6 wakes). Max 3 turns.",
    fullDesc: "The Pokémon is fast asleep. It cannot act or evade. At the start of each turn, roll 1d6 — on 4, 5, or 6 it wakes up. It automatically wakes after 3 turns.",
    battleEffect: "Cannot act or evade. Roll 1d6 at turn start (4–6 = wake up). Auto-wakes after 3 turns.",
    cannotAct: true,
    requiresRollToAct: true,
    rollToActDesc: "Wake Check: Roll 1d6. On 4–6, wake up and act. On 1–3, remain asleep (skip turn). Max 3 turns asleep.",
  },
  Confused: {
    name: "Confused", color: "#f85888",
    shortDesc: "Roll 1d6 before acting (1–3 hit self with STR+Brawl vs VIT).",
    fullDesc: "The Pokémon is confused. Before each action, roll 1d6. On 1–3 it hits itself: roll STR + Brawl vs own Vitality for damage. On 4–6 it acts normally.",
    battleEffect: "Before each action, roll 1d6. 1–3 = hit self (STR+Brawl vs own VIT). 4–6 = act normally.",
    requiresRollToAct: true,
    rollToActDesc: "Confusion Check: Roll 1d6. 1–3 = hits itself (roll STR+Brawl, damage = successes – own Vitality, min 1). 4–6 = acts normally.",
  },
  Flinched: {
    name: "Flinched", color: "#c0c0d0",
    shortDesc: "Cannot act this turn. Clears at end of turn.",
    fullDesc: "The Pokémon flinched from an attack. It cannot act this turn. Flinch automatically clears at the end of the turn.",
    battleEffect: "Cannot act this turn. Clears automatically.",
    cannotAct: true,
  },
  Infatuated: {
    name: "Infatuated", color: "#ff69b4",
    shortDesc: "Must roll WP (2+ successes) to act.",
    fullDesc: "The Pokémon is infatuated. At the start of each turn it must roll its Will Points pool. If it scores 2 or more successes, it can act. Otherwise it cannot act that turn.",
    battleEffect: "Roll WP pool at turn start. 2+ successes = can act. Fewer = cannot act.",
    requiresRollToAct: true,
    rollToActDesc: "Infatuation Check: Roll your Will Points (WP) as dice. 2+ successes = act normally. Fewer = too lovestruck to act.",
  },
};

// Weather effects with accurate dice modifiers (from cheat sheet: ±2 dice)
export interface WeatherData {
  name: string;
  emoji: string;
  color: string;
  description: string;
  typeBoostDice?: number;  // extra dice to boosted type
  typeBoost?: string;
  typeWeakenDice?: number; // dice removed from weakened type
  typeWeaken?: string;
  endOfRoundDmg?: number;
  immuneTypes?: string[];
  triggeredAbilities?: string[];
  endOfRoundDesc?: string;
}

export const WEATHER_DATA: WeatherData[] = [
  {
    name: "Clear", emoji: "☀️", color: "#e8eaf0",
    description: "No weather effects. Standard battle rules apply.",
  },
  {
    name: "Sunny", emoji: "🌤️", color: "#f8d030",
    description: "Intense sunlight. Fire-type moves get +2 dice to damage pool. Water-type moves lose 2 dice. Solar Beam charges instantly.",
    typeBoost: "Fire", typeBoostDice: 2,
    typeWeaken: "Water", typeWeakenDice: 2,
    triggeredAbilities: ["Blaze","Chlorophyll","Solar Power","Flower Gift","Forecast"],
  },
  {
    name: "Rain", emoji: "🌧️", color: "#6890f0",
    description: "Heavy rain. Water-type moves get +2 dice to damage pool. Fire-type moves lose 2 dice. Thunder never misses.",
    typeBoost: "Water", typeBoostDice: 2,
    typeWeaken: "Fire", typeWeakenDice: 2,
    triggeredAbilities: ["Torrent","Rain Dish","Hydration","Swift Swim","Forecast"],
  },
  {
    name: "Sandstorm", emoji: "🌪️", color: "#e0c068",
    description: "Raging sandstorm. Non-Rock/Ground/Steel Pokémon take 1 chip damage at end of each round. No roll needed.",
    endOfRoundDmg: 1, immuneTypes: ["Rock","Ground","Steel"],
    endOfRoundDesc: "Non-Rock/Ground/Steel types take 1 typeless damage (no roll, no defense).",
    triggeredAbilities: ["Sand Veil","Sand Stream","Sand Rush"],
  },
  {
    name: "Hail", emoji: "🧊", color: "#98d8d8",
    description: "Blizzard conditions. Non-Ice Pokémon take 1 chip damage at end of each round. Blizzard never misses.",
    endOfRoundDmg: 1, immuneTypes: ["Ice"],
    endOfRoundDesc: "Non-Ice types take 1 Ice damage (no roll, no defense).",
    triggeredAbilities: ["Ice Body","Slush Rush","Forecast"],
  },
  {
    name: "Fog", emoji: "🌫️", color: "#8b90a8",
    description: "Dense fog. All accuracy rolls take –1 die.",
    triggeredAbilities: [],
  },
  {
    name: "Electric Terrain", emoji: "⚡", color: "#f8d030",
    description: "Electric energy covers the ground. Electric-type moves get +1 die. Grounded Pokémon cannot fall asleep.",
    typeBoost: "Electric", typeBoostDice: 1,
    triggeredAbilities: ["Electric Surge","Hadron Engine"],
  },
  {
    name: "Misty Terrain", emoji: "🌸", color: "#EE99AC",
    description: "Fairy mist blankets the field. Fairy-type moves get +1 die. Grounded Pokémon cannot be inflicted with status ailments.",
    typeBoost: "Fairy", typeBoostDice: 1,
    triggeredAbilities: ["Misty Surge"],
  },
];

// Catch roll table
export const CATCH_REQUIRED_SUCCESSES: Record<Rank, number> = {
  Starter: 3, Rookie: 4, Standard: 6, Advanced: 8, Expert: 9, Ace: 10, Master: 12, Champion: 14,
};

// Multiple action difficulty
export const MULTIPLE_ACTION_REQUIRED: number[] = [1, 2, 3, 4, 5];

// Pain penalization thresholds (HP %)
export const PAIN_PENALIZATION = [
  { threshold: 0.75, penalty: 0, label: "Healthy" },
  { threshold: 0.50, penalty: 1, label: "Hurt" },
  { threshold: 0.25, penalty: 2, label: "Badly Hurt" },
  { threshold: 0,    penalty: 3, label: "Critical" },
];

export function getPainPenalty(currentHp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  const pct = currentHp / maxHp;
  if (pct > 0.5) return 0;
  if (pct > 0.25) return 1;
  if (pct > 0) return 2;
  return 3;
}
