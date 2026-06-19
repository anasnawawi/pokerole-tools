// PokeRole 3.0 Core Data

export type PokemonType =
  | "Normal" | "Fire" | "Water" | "Electric" | "Grass" | "Ice"
  | "Fight" | "Poison" | "Ground" | "Flying" | "Psychic" | "Bug"
  | "Rock" | "Ghost" | "Dragon" | "Dark" | "Steel" | "Fairy";

export type MoveCategory = "Physical" | "Special" | "Support";
export type Rank = "Starter" | "Rookie" | "Standard" | "Advanced" | "Expert" | "Ace" | "Master" | "Champion";

export interface PokemonEntry {
  number: number;
  name: string;
  types: PokemonType[];
  height: string;
  weight: string;
  baseHp: number;
  attributes: {
    strength: number;
    dexterity: number;
    vitality: number;
    special: number;
    insight: number;
  };
  attributeLimits?: {
    strength: number;
    dexterity: number;
    vitality: number;
    special: number;
    insight: number;
  };
  abilities: string[];
  suggestedRank: Rank;
  evolutiveStage: string;
  evolvesTo?: string;
  evolvesWith?: string;
  moves: { rank: Rank; type: PokemonType; name: string }[];
  description: string;
  weaknesses: PokemonType[];
  resistances: PokemonType[];
  immunities: PokemonType[];
}

export interface Move {
  name: string;
  type: PokemonType;
  category: MoveCategory;
  power: string;
  accuracy: string;
  damagePool: string;
  effect: string;
  description: string;
}

export interface Ability {
  name: string;
  description: string;
  effect: string;
  isUnique?: boolean;
}

export interface Item {
  name: string;
  description: string;
  effect: string;
  cost?: number;
}

// Type color map
export const TYPE_COLORS: Record<PokemonType, string> = {
  Normal: "#A8A878",
  Fire: "#F08030",
  Water: "#6890F0",
  Electric: "#F8D030",
  Grass: "#78C850",
  Ice: "#98D8D8",
  Fight: "#C03028",
  Poison: "#A040A0",
  Ground: "#E0C068",
  Flying: "#A890F0",
  Psychic: "#F85888",
  Bug: "#A8B820",
  Rock: "#B8A038",
  Ghost: "#705898",
  Dragon: "#7038F8",
  Dark: "#705848",
  Steel: "#B8B8D0",
  Fairy: "#EE99AC",
};

// Defensive type chart
export const TYPE_CHART: Record<PokemonType, { weaknesses: PokemonType[]; resistances: PokemonType[]; immunities: PokemonType[] }> = {
  Normal: { weaknesses: ["Fight"], resistances: [], immunities: ["Ghost"] },
  Bug: { weaknesses: ["Fire", "Flying", "Rock"], resistances: ["Fight", "Grass", "Ground"], immunities: [] },
  Dark: { weaknesses: ["Bug", "Fairy", "Fight"], resistances: ["Dark", "Ghost"], immunities: ["Psychic"] },
  Dragon: { weaknesses: ["Dragon", "Fairy", "Ice"], resistances: ["Electric", "Fire", "Grass", "Water"], immunities: [] },
  Electric: { weaknesses: ["Ground"], resistances: ["Electric", "Flying", "Steel"], immunities: [] },
  Fairy: { weaknesses: ["Poison", "Steel"], resistances: ["Bug", "Dark", "Fight"], immunities: ["Dragon"] },
  Fight: { weaknesses: ["Fairy", "Flying", "Psychic"], resistances: ["Bug", "Dark", "Rock"], immunities: [] },
  Fire: { weaknesses: ["Ground", "Rock", "Water"], resistances: ["Bug", "Fairy", "Fire", "Grass", "Ice", "Steel"], immunities: [] },
  Flying: { weaknesses: ["Electric", "Ice", "Rock"], resistances: ["Bug", "Fight", "Grass"], immunities: ["Ground"] },
  Ghost: { weaknesses: ["Dark", "Ghost"], resistances: ["Bug", "Poison"], immunities: ["Fight", "Normal"] },
  Grass: { weaknesses: ["Bug", "Fire", "Flying", "Ice", "Poison"], resistances: ["Electric", "Grass", "Ground", "Water"], immunities: [] },
  Ground: { weaknesses: ["Grass", "Ice", "Water"], resistances: ["Poison", "Rock"], immunities: ["Electric"] },
  Ice: { weaknesses: ["Fight", "Fire", "Rock", "Steel"], resistances: ["Ice"], immunities: [] },
  Poison: { weaknesses: ["Ground", "Psychic"], resistances: ["Bug", "Fairy", "Fight", "Grass", "Poison"], immunities: [] },
  Psychic: { weaknesses: ["Bug", "Dark", "Ghost"], resistances: ["Fight", "Psychic"], immunities: [] },
  Rock: { weaknesses: ["Fight", "Grass", "Ground", "Steel", "Water"], resistances: ["Fire", "Flying", "Normal", "Poison"], immunities: [] },
  Steel: { weaknesses: ["Fight", "Fire", "Ground"], resistances: ["Bug", "Dragon", "Fairy", "Flying", "Grass", "Ice", "Normal", "Psychic", "Rock", "Steel"], immunities: ["Poison"] },
  Water: { weaknesses: ["Electric", "Grass"], resistances: ["Fire", "Ice", "Steel", "Water"], immunities: [] },
};

// Sample Pokemon data (key entries from the Pokedex)
export const POKEMON: PokemonEntry[] = [
  {
    number: 1,
    name: "Bulbasaur",
    types: ["Grass", "Poison"],
    height: "0.7m / 2'04\"",
    weight: "6.9kg / 15 lbs",
    baseHp: 3,
    attributes: { strength: 1, dexterity: 1, vitality: 1, special: 2, insight: 2 },
    attributeLimits: { strength: 3, dexterity: 3, vitality: 3, special: 4, insight: 4 },
    abilities: ["Overgrow", "Chlorophyll"],
    suggestedRank: "Starter",
    evolutiveStage: "First",
    evolvesTo: "Ivysaur",
    evolvesWith: "Training",
    moves: [
      { rank: "Starter", type: "Normal", name: "Tackle" },
      { rank: "Starter", type: "Grass", name: "Vine Whip" },
      { rank: "Starter", type: "Normal", name: "Growl" },
      { rank: "Rookie", type: "Poison", name: "Poison Powder" },
      { rank: "Rookie", type: "Grass", name: "Razor Leaf" },
      { rank: "Standard", type: "Grass", name: "Solar Beam" },
      { rank: "Standard", type: "Normal", name: "Sweet Scent" },
      { rank: "Advanced", type: "Grass", name: "Seed Bomb" },
    ],
    description: "A strange seed was planted on its back at birth. The plant sprouts and grows with this Pokémon.",
    weaknesses: ["Fire", "Ice", "Flying", "Psychic"],
    resistances: ["Fight", "Water", "Grass", "Electric", "Fairy"],
    immunities: [],
  },
  {
    number: 4,
    name: "Charmander",
    types: ["Fire"],
    height: "0.6m / 2'00\"",
    weight: "8.5kg / 19 lbs",
    baseHp: 3,
    attributes: { strength: 1, dexterity: 2, vitality: 1, special: 1, insight: 2 },
    attributeLimits: { strength: 3, dexterity: 4, vitality: 3, special: 3, insight: 4 },
    abilities: ["Blaze", "Solar Power"],
    suggestedRank: "Starter",
    evolutiveStage: "First",
    evolvesTo: "Charmeleon",
    evolvesWith: "Training",
    moves: [
      { rank: "Starter", type: "Fire", name: "Ember" },
      { rank: "Starter", type: "Normal", name: "Scratch" },
      { rank: "Starter", type: "Normal", name: "Growl" },
      { rank: "Rookie", type: "Fire", name: "Flame Charge" },
      { rank: "Rookie", type: "Normal", name: "Slash" },
      { rank: "Standard", type: "Fire", name: "Flamethrower" },
      { rank: "Advanced", type: "Fire", name: "Fire Spin" },
      { rank: "Advanced", type: "Dragon", name: "Dragon Rage" },
    ],
    description: "The flame at the tip of its tail reflects the health and emotions of the Charmander.",
    weaknesses: ["Ground", "Rock", "Water"],
    resistances: ["Bug", "Fairy", "Fire", "Grass", "Ice", "Steel"],
    immunities: [],
  },
  {
    number: 7,
    name: "Squirtle",
    types: ["Water"],
    height: "0.5m / 1'08\"",
    weight: "9kg / 20 lbs",
    baseHp: 3,
    attributes: { strength: 1, dexterity: 1, vitality: 2, special: 2, insight: 1 },
    attributeLimits: { strength: 3, dexterity: 3, vitality: 4, special: 4, insight: 3 },
    abilities: ["Torrent", "Rain Dish"],
    suggestedRank: "Starter",
    evolutiveStage: "First",
    evolvesTo: "Wartortle",
    evolvesWith: "Training",
    moves: [
      { rank: "Starter", type: "Water", name: "Water Gun" },
      { rank: "Starter", type: "Normal", name: "Tackle" },
      { rank: "Starter", type: "Normal", name: "Tail Whip" },
      { rank: "Rookie", type: "Water", name: "Bubble" },
      { rank: "Standard", type: "Water", name: "Water Pulse" },
      { rank: "Advanced", type: "Water", name: "Hydro Pump" },
    ],
    description: "After birth, its back swells and hardens into a shell. Squirtle vigorously sprays foam from its mouth.",
    weaknesses: ["Electric", "Grass"],
    resistances: ["Fire", "Ice", "Steel", "Water"],
    immunities: [],
  },
  {
    number: 25,
    name: "Pikachu",
    types: ["Electric"],
    height: "0.4m / 1'04\"",
    weight: "6kg / 13 lbs",
    baseHp: 4,
    attributes: { strength: 1, dexterity: 2, vitality: 1, special: 2, insight: 2 },
    attributeLimits: { strength: 3, dexterity: 4, vitality: 3, special: 4, insight: 4 },
    abilities: ["Static", "Lightning Rod"],
    suggestedRank: "Rookie",
    evolutiveStage: "Second",
    evolvesTo: "Raichu",
    evolvesWith: "Thunder Stone",
    moves: [
      { rank: "Starter", type: "Electric", name: "Thunder Shock" },
      { rank: "Starter", type: "Normal", name: "Growl" },
      { rank: "Rookie", type: "Electric", name: "Thunder Wave" },
      { rank: "Rookie", type: "Normal", name: "Quick Attack" },
      { rank: "Standard", type: "Electric", name: "Electro Ball" },
      { rank: "Advanced", type: "Electric", name: "Thunderbolt" },
      { rank: "Expert", type: "Electric", name: "Thunder" },
    ],
    description: "They live in forests forming small groups. Pikachu stores electricity in its cheek sacs and uses its tail to ground the excess charge.",
    weaknesses: ["Ground"],
    resistances: ["Electric", "Flying", "Steel"],
    immunities: [],
  },
  {
    number: 39,
    name: "Jigglypuff",
    types: ["Normal", "Fairy"],
    height: "0.5m / 1'08\"",
    weight: "5.5kg / 12 lbs",
    baseHp: 5,
    attributes: { strength: 1, dexterity: 1, vitality: 3, special: 1, insight: 1 },
    attributeLimits: { strength: 3, dexterity: 3, vitality: 5, special: 3, insight: 3 },
    abilities: ["Cute Charm", "Competitive", "Friend Guard"],
    suggestedRank: "Rookie",
    evolutiveStage: "First",
    evolvesTo: "Wigglytuff",
    evolvesWith: "Moon Stone",
    moves: [
      { rank: "Starter", type: "Normal", name: "Sing" },
      { rank: "Starter", type: "Normal", name: "Pound" },
      { rank: "Rookie", type: "Normal", name: "Defense Curl" },
      { rank: "Rookie", type: "Fairy", name: "Charm" },
      { rank: "Standard", type: "Normal", name: "Hyper Voice" },
      { rank: "Advanced", type: "Fairy", name: "Dazzling Gleam" },
      { rank: "Advanced", type: "Normal", name: "Rest" },
    ],
    description: "Its vocal cords can freely adjust the wavelength of its voice. Jigglypuff's lullabies can put anyone to sleep.",
    weaknesses: ["Poison", "Steel"],
    resistances: ["Bug", "Dark", "Fight"],
    immunities: ["Dragon"],
  },
  {
    number: 52,
    name: "Meowth",
    types: ["Normal"],
    height: "0.4m / 1'04\"",
    weight: "4.2kg / 9 lbs",
    baseHp: 3,
    attributes: { strength: 1, dexterity: 2, vitality: 1, special: 1, insight: 2 },
    attributeLimits: { strength: 3, dexterity: 4, vitality: 3, special: 3, insight: 4 },
    abilities: ["Pickup", "Technician", "Unnerve"],
    suggestedRank: "Starter",
    evolutiveStage: "First",
    evolvesTo: "Persian",
    evolvesWith: "Training",
    moves: [
      { rank: "Starter", type: "Normal", name: "Scratch" },
      { rank: "Starter", type: "Normal", name: "Growl" },
      { rank: "Rookie", type: "Dark", name: "Bite" },
      { rank: "Rookie", type: "Normal", name: "Fake Out" },
      { rank: "Standard", type: "Dark", name: "Night Slash" },
      { rank: "Advanced", type: "Normal", name: "Slash" },
    ],
    description: "It loves things that shine. It especially adores coins and will sneak into homes to snatch them while people sleep.",
    weaknesses: ["Fight"],
    resistances: [],
    immunities: ["Ghost"],
  },
  {
    number: 94,
    name: "Gengar",
    types: ["Ghost", "Poison"],
    height: "1.5m / 4'11\"",
    weight: "40.5kg / 89 lbs",
    baseHp: 4,
    attributes: { strength: 1, dexterity: 2, vitality: 2, special: 4, insight: 3 },
    attributeLimits: { strength: 3, dexterity: 4, vitality: 4, special: 6, insight: 5 },
    abilities: ["Cursed Body", "Levitate"],
    suggestedRank: "Advanced",
    evolutiveStage: "Final",
    moves: [
      { rank: "Starter", type: "Ghost", name: "Lick" },
      { rank: "Starter", type: "Normal", name: "Spite" },
      { rank: "Rookie", type: "Ghost", name: "Shadow Sneak" },
      { rank: "Rookie", type: "Poison", name: "Hypnosis" },
      { rank: "Standard", type: "Ghost", name: "Shadow Ball" },
      { rank: "Standard", type: "Psychic", name: "Psychic" },
      { rank: "Advanced", type: "Ghost", name: "Shadow Punch" },
      { rank: "Expert", type: "Ghost", name: "Hex" },
    ],
    description: "On the night of a full moon, if shadows move on their own and laugh, it must be Gengar. It hides in the shadows lurking for victims.",
    weaknesses: ["Dark", "Ghost", "Ground", "Psychic"],
    resistances: ["Bug", "Fairy", "Fight", "Grass", "Poison"],
    immunities: ["Fight", "Normal"],
  },
  {
    number: 131,
    name: "Lapras",
    types: ["Water", "Ice"],
    height: "2.5m / 8'02\"",
    weight: "220kg / 485 lbs",
    baseHp: 6,
    attributes: { strength: 2, dexterity: 1, vitality: 3, special: 3, insight: 2 },
    attributeLimits: { strength: 4, dexterity: 3, vitality: 5, special: 5, insight: 4 },
    abilities: ["Water Absorb", "Shell Armor", "Hydration"],
    suggestedRank: "Standard",
    evolutiveStage: "Final",
    moves: [
      { rank: "Starter", type: "Water", name: "Water Gun" },
      { rank: "Starter", type: "Ice", name: "Ice Shard" },
      { rank: "Rookie", type: "Psychic", name: "Psychic" },
      { rank: "Standard", type: "Water", name: "Surf" },
      { rank: "Standard", type: "Ice", name: "Ice Beam" },
      { rank: "Advanced", type: "Water", name: "Hydro Pump" },
      { rank: "Advanced", type: "Ice", name: "Blizzard" },
    ],
    description: "Being very intelligent, they understand human speech. They act as a ferry to carry people across the sea and through icebergs.",
    weaknesses: ["Electric", "Fight", "Grass", "Rock"],
    resistances: ["Ice", "Water"],
    immunities: [],
  },
  {
    number: 133,
    name: "Eevee",
    types: ["Normal"],
    height: "0.3m / 1'00\"",
    weight: "6.5kg / 14 lbs",
    baseHp: 3,
    attributes: { strength: 1, dexterity: 2, vitality: 1, special: 1, insight: 2 },
    attributeLimits: { strength: 3, dexterity: 4, vitality: 3, special: 3, insight: 4 },
    abilities: ["Run Away", "Adaptability", "Anticipation"],
    suggestedRank: "Rookie",
    evolutiveStage: "First",
    evolvesTo: "Multiple Forms",
    evolvesWith: "Various",
    moves: [
      { rank: "Starter", type: "Normal", name: "Tackle" },
      { rank: "Starter", type: "Normal", name: "Growl" },
      { rank: "Rookie", type: "Normal", name: "Quick Attack" },
      { rank: "Rookie", type: "Normal", name: "Bite" },
      { rank: "Standard", type: "Normal", name: "Swift" },
      { rank: "Standard", type: "Normal", name: "Take Down" },
      { rank: "Advanced", type: "Normal", name: "Last Resort" },
    ],
    description: "Its genetic makeup is unstable, so it may evolve in many different ways. Multiple evolutions are possible depending on the environment.",
    weaknesses: ["Fight"],
    resistances: [],
    immunities: ["Ghost"],
  },
  {
    number: 143,
    name: "Snorlax",
    types: ["Normal"],
    height: "2.1m / 6'11\"",
    weight: "460kg / 1014 lbs",
    baseHp: 8,
    attributes: { strength: 4, dexterity: 1, vitality: 4, special: 2, insight: 2 },
    attributeLimits: { strength: 6, dexterity: 3, vitality: 6, special: 4, insight: 4 },
    abilities: ["Immunity", "Thick Fat", "Gluttony"],
    suggestedRank: "Expert",
    evolutiveStage: "Final",
    moves: [
      { rank: "Starter", type: "Normal", name: "Tackle" },
      { rank: "Starter", type: "Normal", name: "Defense Curl" },
      { rank: "Rookie", type: "Normal", name: "Rest" },
      { rank: "Rookie", type: "Normal", name: "Snore" },
      { rank: "Standard", type: "Normal", name: "Body Slam" },
      { rank: "Standard", type: "Normal", name: "Yawn" },
      { rank: "Advanced", type: "Normal", name: "Giga Impact" },
      { rank: "Expert", type: "Normal", name: "Hyper Beam" },
    ],
    description: "Snorlax is not satisfied unless it eats over 880 lbs of food every day. When it is done eating, it goes promptly to sleep.",
    weaknesses: ["Fight"],
    resistances: [],
    immunities: ["Ghost"],
  },
  {
    number: 149,
    name: "Dragonite",
    types: ["Dragon", "Flying"],
    height: "2.2m / 7'03\"",
    weight: "210kg / 463 lbs",
    baseHp: 6,
    attributes: { strength: 4, dexterity: 3, vitality: 3, special: 4, insight: 3 },
    attributeLimits: { strength: 6, dexterity: 5, vitality: 5, special: 6, insight: 5 },
    abilities: ["Inner Focus", "Multiscale"],
    suggestedRank: "Ace",
    evolutiveStage: "Final",
    moves: [
      { rank: "Rookie", type: "Dragon", name: "Dragon Rage" },
      { rank: "Standard", type: "Flying", name: "Wing Attack" },
      { rank: "Standard", type: "Normal", name: "Hyper Beam" },
      { rank: "Advanced", type: "Dragon", name: "Dragon Rush" },
      { rank: "Expert", type: "Fire", name: "Fire Punch" },
      { rank: "Ace", type: "Dragon", name: "Outrage" },
      { rank: "Ace", type: "Dragon", name: "Draco Meteor" },
    ],
    description: "A Pokémon that is feared as an indomitable deity, it can navigate stormy seas with ease. It circles the globe in sixteen hours.",
    weaknesses: ["Dragon", "Fairy", "Ice", "Rock"],
    resistances: ["Bug", "Fight", "Fire", "Grass", "Water"],
    immunities: ["Ground"],
  },
  {
    number: 150,
    name: "Mewtwo",
    types: ["Psychic"],
    height: "2m / 6'07\"",
    weight: "122kg / 269 lbs",
    baseHp: 6,
    attributes: { strength: 3, dexterity: 3, vitality: 3, special: 6, insight: 5 },
    attributeLimits: { strength: 5, dexterity: 5, vitality: 5, special: 8, insight: 7 },
    abilities: ["Pressure", "Unnerve"],
    suggestedRank: "Master",
    evolutiveStage: "Final",
    moves: [
      { rank: "Starter", type: "Psychic", name: "Confusion" },
      { rank: "Rookie", type: "Normal", name: "Disable" },
      { rank: "Standard", type: "Psychic", name: "Psychic" },
      { rank: "Standard", type: "Psychic", name: "Future Sight" },
      { rank: "Advanced", type: "Psychic", name: "Psystrike" },
      { rank: "Expert", type: "Ice", name: "Blizzard" },
      { rank: "Ace", type: "Psychic", name: "Aura Sphere" },
      { rank: "Master", type: "Psychic", name: "Psystrike" },
    ],
    description: "A Pokémon created by science. It is recombinant DNA. Scientists engineered it to be the ultimate in battle and might. Its heart is empty.",
    weaknesses: ["Bug", "Dark", "Ghost"],
    resistances: ["Fight", "Psychic"],
    immunities: [],
  },
  {
    number: 246,
    name: "Larvitar",
    types: ["Rock", "Ground"],
    height: "0.6m / 2'00\"",
    weight: "72kg / 159 lbs",
    baseHp: 3,
    attributes: { strength: 2, dexterity: 1, vitality: 2, special: 1, insight: 1 },
    attributeLimits: { strength: 4, dexterity: 3, vitality: 4, special: 3, insight: 3 },
    abilities: ["Guts", "Sand Veil"],
    suggestedRank: "Rookie",
    evolutiveStage: "First",
    evolvesTo: "Pupitar",
    evolvesWith: "Training",
    moves: [
      { rank: "Starter", type: "Normal", name: "Tackle" },
      { rank: "Starter", type: "Dark", name: "Bite" },
      { rank: "Rookie", type: "Normal", name: "Leer" },
      { rank: "Standard", type: "Rock", name: "Rock Slide" },
      { rank: "Standard", type: "Ground", name: "Earthquake" },
      { rank: "Advanced", type: "Dark", name: "Crunch" },
    ],
    description: "Born deep underground, it makes its way to the surface by eating the soil above it, causing earthquakes as it goes.",
    weaknesses: ["Fight", "Grass", "Ground", "Ice", "Steel", "Water"],
    resistances: ["Fire", "Flying", "Normal", "Poison", "Rock"],
    immunities: ["Electric"],
  },
  {
    number: 261,
    name: "Poochyena",
    types: ["Dark"],
    height: "0.5m / 1'08\"",
    weight: "13kg / 30 lbs",
    baseHp: 3,
    attributes: { strength: 1, dexterity: 2, vitality: 1, special: 1, insight: 1 },
    attributeLimits: { strength: 3, dexterity: 4, vitality: 3, special: 3, insight: 3 },
    abilities: ["Quick Feet", "Run Away"],
    suggestedRank: "Rookie",
    evolutiveStage: "First",
    evolvesTo: "Mightyena",
    evolvesWith: "Medium",
    moves: [
      { rank: "Starter", type: "Normal", name: "Tackle" },
      { rank: "Starter", type: "Ground", name: "Sand Attack" },
      { rank: "Rookie", type: "Dark", name: "Bite" },
      { rank: "Rookie", type: "Dark", name: "Assurance" },
      { rank: "Standard", type: "Dark", name: "Crunch" },
      { rank: "Advanced", type: "Dark", name: "Sucker Punch" },
    ],
    description: "Poochyena will bite anything that moves. They chase people for dozens of miles without losing track. This Pokémon is persistent and tenacious.",
    weaknesses: ["Bug", "Fairy", "Fight"],
    resistances: ["Dark", "Ghost"],
    immunities: ["Psychic"],
  },
  {
    number: 353,
    name: "Shuppet",
    types: ["Ghost"],
    height: "0.6m / 2'00\"",
    weight: "2kg / 5 lbs",
    baseHp: 3,
    attributes: { strength: 1, dexterity: 2, vitality: 1, special: 2, insight: 1 },
    attributeLimits: { strength: 3, dexterity: 4, vitality: 3, special: 4, insight: 3 },
    abilities: ["Insomnia", "Frisk", "Cursed Body"],
    suggestedRank: "Rookie",
    evolutiveStage: "First",
    evolvesTo: "Banette",
    evolvesWith: "Medium",
    moves: [
      { rank: "Starter", type: "Ghost", name: "Astonish" },
      { rank: "Starter", type: "Normal", name: "Growl" },
      { rank: "Rookie", type: "Ghost", name: "Shadow Sneak" },
      { rank: "Standard", type: "Ghost", name: "Shadow Ball" },
      { rank: "Standard", type: "Psychic", name: "Psychic" },
      { rank: "Advanced", type: "Dark", name: "Foul Play" },
    ],
    description: "They feed on dark emotions like envy, jealousy and vengefulness. If they sting you, they fill you with a vindictive desire.",
    weaknesses: ["Dark", "Ghost"],
    resistances: ["Bug", "Poison"],
    immunities: ["Fight", "Normal"],
  },
  {
    number: 445,
    name: "Garchomp",
    types: ["Dragon", "Ground"],
    height: "1.9m / 6'03\"",
    weight: "95kg / 209 lbs",
    baseHp: 6,
    attributes: { strength: 4, dexterity: 4, vitality: 3, special: 2, insight: 3 },
    attributeLimits: { strength: 6, dexterity: 6, vitality: 5, special: 4, insight: 5 },
    abilities: ["Sand Veil", "Rough Skin"],
    suggestedRank: "Expert",
    evolutiveStage: "Final",
    moves: [
      { rank: "Starter", type: "Dragon", name: "Dragon Rage" },
      { rank: "Rookie", type: "Ground", name: "Sand Attack" },
      { rank: "Standard", type: "Dragon", name: "Dragon Claw" },
      { rank: "Standard", type: "Ground", name: "Earthquake" },
      { rank: "Advanced", type: "Dragon", name: "Dragon Rush" },
      { rank: "Expert", type: "Dragon", name: "Outrage" },
    ],
    description: "When it folds up its body and extends its wings, it looks like a jet plane. It flies at sonic speed from wing compression.",
    weaknesses: ["Dragon", "Fairy", "Ice"],
    resistances: ["Fire", "Poison", "Rock"],
    immunities: ["Electric"],
  },
];

// Core Moves list
export const MOVES: Move[] = [
  {
    name: "Tackle",
    type: "Normal",
    category: "Physical",
    power: "2",
    accuracy: "Dexterity + Athletic",
    damagePool: "Strength + 2",
    effect: "Single Target.",
    description: "A physical attack in which the user charges and slams into the target with its whole body.",
  },
  {
    name: "Ember",
    type: "Fire",
    category: "Special",
    power: "1",
    accuracy: "Dexterity + Channel",
    damagePool: "Special + 1",
    effect: "Single Target. Roll 1 Chance Die to inflict 1st Degree Burn on the Target.",
    description: "The target is attacked with small flames. This may also leave the target with a burn.",
  },
  {
    name: "Flamethrower",
    type: "Fire",
    category: "Special",
    power: "3",
    accuracy: "Dexterity + Channel",
    damagePool: "Special + 3",
    effect: "Single Target. Roll 1 Chance Die to inflict 2nd Degree Burn on the Target.",
    description: "The most emblematic fire attack, a seemingly endless stream of fire that reduces everything to ashes.",
  },
  {
    name: "Water Gun",
    type: "Water",
    category: "Special",
    power: "2",
    accuracy: "Dexterity + Channel",
    damagePool: "Special + 2",
    effect: "Single Target. Ranged.",
    description: "The target is blasted with a forceful shot of water.",
  },
  {
    name: "Hydro Pump",
    type: "Water",
    category: "Special",
    power: "6",
    accuracy: "Special + Channel",
    damagePool: "Special + 6",
    effect: "Single Target. Low Accuracy 1. Ranged.",
    description: "The target is blasted by a huge volume of water launched under great pressure.",
  },
  {
    name: "Thunder Shock",
    type: "Electric",
    category: "Special",
    power: "1",
    accuracy: "Dexterity + Channel",
    damagePool: "Special + 1",
    effect: "Single Target. Roll 1 Chance Die to Paralyze the Target.",
    description: "A jolt of electricity is hurled at the target to inflict damage. It may also leave the target with paralysis.",
  },
  {
    name: "Thunderbolt",
    type: "Electric",
    category: "Special",
    power: "4",
    accuracy: "Special + Channel",
    damagePool: "Special + 4",
    effect: "Single Target. Roll 2 Chance Dice to Paralyze the Target.",
    description: "A strong electric blast crashes down on the target. It may also leave the target with paralysis.",
  },
  {
    name: "Thunder",
    type: "Electric",
    category: "Special",
    power: "5",
    accuracy: "Special + Channel",
    damagePool: "Special + 5",
    effect: "Single Target. Low Accuracy 1. Never Misses in Rain.",
    description: "A wicked thunderbolt is dropped on the target to inflict damage. The user may also burn itself.",
  },
  {
    name: "Vine Whip",
    type: "Grass",
    category: "Physical",
    power: "2",
    accuracy: "Dexterity + Athletic",
    damagePool: "Strength + 2",
    effect: "Single Target.",
    description: "The target is struck with slender, whip-like vines to inflict damage.",
  },
  {
    name: "Razor Leaf",
    type: "Grass",
    category: "Physical",
    power: "3",
    accuracy: "Dexterity + Channel",
    damagePool: "Strength + 3",
    effect: "All Foes in Range. Ranged. High Critical.",
    description: "Sharp-edged leaves are launched to slash at opposing Pokémon. It has a high critical-hit ratio.",
  },
  {
    name: "Solar Beam",
    type: "Grass",
    category: "Special",
    power: "6",
    accuracy: "Special + Channel",
    damagePool: "Special + 6",
    effect: "Single Target. Charge Move. Does not need to charge in Sun.",
    description: "In the first turn, the user absorbs sunlight. In the next turn, a beam of light is fired.",
  },
  {
    name: "Ice Beam",
    type: "Ice",
    category: "Special",
    power: "4",
    accuracy: "Special + Channel",
    damagePool: "Special + 4",
    effect: "Single Target. Roll 1 Chance Die to Freeze the Target.",
    description: "The target is struck with an icy-cold beam of energy. It may also leave the target frozen.",
  },
  {
    name: "Blizzard",
    type: "Ice",
    category: "Special",
    power: "5",
    accuracy: "Special + Channel",
    damagePool: "Special + 5",
    effect: "All Foes in Range. Low Accuracy 2. Roll 2 Chance Dice to Freeze those affected.",
    description: "A howling blizzard is summoned to strike opposing Pokémon. It may also freeze them solid.",
  },
  {
    name: "Psychic",
    type: "Psychic",
    category: "Special",
    power: "4",
    accuracy: "Special + Channel",
    damagePool: "Special + 4",
    effect: "Single Target. Roll 1 Chance Die to Reduce Target's Sp. Defense by 1.",
    description: "The target is hit by a strong telekinetic force. This may also lower the target's Sp. Def stat.",
  },
  {
    name: "Shadow Ball",
    type: "Ghost",
    category: "Special",
    power: "4",
    accuracy: "Special + Channel",
    damagePool: "Special + 4",
    effect: "Single Target. Ranged. Roll 1 Chance Die to Reduce the Target's Sp. Defense by 1.",
    description: "The user hurls a shadowy blob at the target. This may also lower the target's Sp. Def stat.",
  },
  {
    name: "Earthquake",
    type: "Ground",
    category: "Physical",
    power: "5",
    accuracy: "Strength + Athletic",
    damagePool: "Strength + 5",
    effect: "All targets on the battlefield. Also hits targets using Dig.",
    description: "The user sets off an earthquake that strikes every Pokémon around it.",
  },
  {
    name: "Growl",
    type: "Normal",
    category: "Support",
    power: "-",
    accuracy: "Cute + Perform",
    damagePool: "-",
    effect: "All Foes in Range. Reduce all affected Targets' Strength by 1.",
    description: "The user growls in an endearing way, making opposing Pokémon less wary. This lowers their Attack stat.",
  },
  {
    name: "Rest",
    type: "Psychic",
    category: "Support",
    power: "-",
    accuracy: "Vitality + Channel",
    damagePool: "-",
    effect: "Target Self. The user sleeps for 2 Rounds. Fully restores HP and cures all Status Ailments.",
    description: "The user sleeps for two turns, fully restoring its HP and healing any status conditions.",
  },
  {
    name: "Crunch",
    type: "Dark",
    category: "Physical",
    power: "3",
    accuracy: "Strength + Brawl",
    damagePool: "Strength + 3",
    effect: "Single Target. Bite Move. Roll 1 Chance Die to Reduce the Target's Defense by 1.",
    description: "The user crunches up the target with sharp fangs. It may also lower the target's Defense stat.",
  },
  {
    name: "Dragon Claw",
    type: "Dragon",
    category: "Physical",
    power: "4",
    accuracy: "Dexterity + Brawl",
    damagePool: "Strength + 4",
    effect: "Single Target. Cutter Move.",
    description: "The user slashes the target with huge sharp claws.",
  },
  {
    name: "Outrage",
    type: "Dragon",
    category: "Physical",
    power: "6",
    accuracy: "Strength + Brawl",
    damagePool: "Strength + 6",
    effect: "Single Target. Rampage. The user becomes Confused after.",
    description: "The user rampages and attacks for two to three turns. It then becomes confused.",
  },
  {
    name: "Hyper Beam",
    type: "Normal",
    category: "Special",
    power: "6",
    accuracy: "Special + Channel",
    damagePool: "Special + 6",
    effect: "Single Target. Low Accuracy 1. Must Recharge.",
    description: "The target is attacked with a powerful beam. The user can't move on the next turn.",
  },
  {
    name: "Surf",
    type: "Water",
    category: "Special",
    power: "4",
    accuracy: "Special + Channel",
    damagePool: "Special + 4",
    effect: "All targets on the battlefield. Also hits targets using Dive.",
    description: "The user attacks everything around it by swamping its surroundings with a giant wave.",
  },
  {
    name: "Quick Attack",
    type: "Normal",
    category: "Physical",
    power: "1",
    accuracy: "Dexterity + Brawl",
    damagePool: "Strength + 1",
    effect: "Single Target. This Move has Priority 1.",
    description: "The user lunges at the target at a speed that makes it nearly invisible. It is sure to strike first.",
  },
  {
    name: "Body Slam",
    type: "Normal",
    category: "Physical",
    power: "4",
    accuracy: "Strength + Athletic",
    damagePool: "Strength + 4",
    effect: "Single Target. Roll 2 Chance Dice to Paralyze the Target.",
    description: "The user drops onto the target with its full body weight. It may also leave the target with paralysis.",
  },
];

// Abilities list
export const ABILITIES: Ability[] = [
  {
    name: "Blaze",
    effect: "At Half HP or less: Fire-Type Moves get +2 dice to Damage Pool. Pain Penalization won't reduce successes from Accuracy or Damage rolls of Fire-Type Moves.",
    description: "The inner and outer fire of this Pokémon's body will burn incredibly fierce just before fading.",
  },
  {
    name: "Overgrow",
    effect: "At Half HP or less: Grass-Type Moves get +2 dice to Damage Pool. Pain Penalization won't reduce successes from Accuracy or Damage rolls of Grass-Type Moves.",
    description: "When the Pokémon's life is in danger, it becomes filled with a desire to protect its territory and grows even more powerful.",
  },
  {
    name: "Torrent",
    effect: "At Half HP or less: Water-Type Moves get +2 dice to Damage Pool. Pain Penalization won't reduce successes from Accuracy or Damage rolls of Water-Type Moves.",
    description: "When the Pokémon finds itself in a pinch, it channels the power of the sea to unleash attacks of tremendous power.",
  },
  {
    name: "Static",
    effect: "When hit by a Non-Ranged Physical Move, this Pokémon rolls 3 Chance Dice to inflict Paralysis on the foe.",
    description: "This Pokémon's body is always ready to let off a jolt of static electricity at the slightest touch.",
  },
  {
    name: "Lightning Rod",
    effect: "Draws in all Electric-Type Moves. Immune to Electric-Type damage. Increase Special by 1 when hit.",
    description: "The Pokémon draws in all Electric-type moves. Instead of being hit by Electric-type moves, it boosts its Sp. Atk.",
  },
  {
    name: "Intimidate",
    effect: "When this Pokémon enters battle, reduce the Strength of all foes by 1.",
    description: "The Pokémon intimidates opposing Pokémon upon entering battle, lowering their Attack stat.",
  },
  {
    name: "Levitate",
    effect: "This Pokémon is immune to Ground-Type damage and Ground-Type entry hazards.",
    description: "By levitating, this Pokémon avoids all Ground-type attacks and hazards.",
  },
  {
    name: "Pressure",
    effect: "Whenever a foe successfully uses a Move against this Pokémon, that Move may not be used again for the rest of the Round.",
    description: "The Pokémon exerts its aura pressure, making foes expend more energy.",
    isUnique: false,
  },
  {
    name: "Guts",
    effect: "When this Pokémon has a Status Ailment, increase its Strength by 2 and it is immune to the reduction of Strength from Burn.",
    description: "It's so gutsy that having a status condition increases its Attack.",
  },
  {
    name: "Sand Veil",
    effect: "During Sandstorm, reduce successes to all Accuracy Rolls targeting this Pokémon by 2. This Pokémon is immune to Sandstorm damage.",
    description: "Boosts the Pokémon's evasiveness in a sandstorm.",
  },
  {
    name: "Inner Focus",
    effect: "This Pokémon cannot be made to Flinch.",
    description: "The Pokémon's intensely focused, and that protects the Pokémon from flinching.",
  },
  {
    name: "Multiscale",
    effect: "When at full HP, reduce by 2 all Damage this Pokémon receives.",
    description: "Reduces the damage the Pokémon takes when its HP is full.",
  },
  {
    name: "Rough Skin",
    effect: "When hit by a Non-Ranged Physical Move, this Pokémon deals 1 Typeless Damage to the foe, ignoring defenses.",
    description: "This Pokémon's rough, jagged skin damages the foe upon contact.",
  },
  {
    name: "Cursed Body",
    effect: "When hit by a Move, roll 2 Chance Dice. On success, the Move that hit this Pokémon cannot be used for the rest of the Scene.",
    description: "May disable a move used on the Pokémon.",
  },
  {
    name: "Wonder Guard",
    effect: "This Pokémon only receives damage from Status Ailments/Conditions, and Moves that deal Super Effective damage against it. Immune to all other damage sources.",
    description: "This Pokémon's body is protected by an incredible otherworldly aura. Most things get through as if nothing was there.",
    isUnique: true,
  },
  {
    name: "Chlorophyll",
    effect: "While Sunny Weather is active, Increase this Pokémon's Dexterity Attribute by 2.",
    description: "The Pokémon synthesizes sunlight to get energy. If it's kept in a sunny environment it will rarely need to eat.",
  },
  {
    name: "Solar Power",
    effect: "During Sun, increase Special by 2, but lose 1 HP per Round.",
    description: "Boosts the Sp. Atk stat in sunshine, but HP decreases every turn.",
  },
  {
    name: "Rain Dish",
    effect: "During Rain, restore 1 HP at the end of each Round.",
    description: "The Pokémon gradually regains HP in rain.",
  },
  {
    name: "Thick Fat",
    effect: "Reduce by 2 all Damage this Pokémon receives from Fire-Type and Ice-Type Moves.",
    description: "The Pokémon is protected by a thick layer of fat, which halves the damage taken from fire- and ice-type moves.",
  },
  {
    name: "Immunity",
    effect: "This Pokémon cannot be Poisoned, Badly Poisoned, or take damage from Poison-Type Moves.",
    description: "The Pokémon's ability to resist Poison keeps it from being poisoned.",
  },
  {
    name: "Adaptability",
    effect: "S.T.A.B. grants 2 Extra Dice to Damage Pool instead of 1.",
    description: "Powers up moves of the same type as the Pokémon even more.",
  },
  {
    name: "Run Away",
    effect: "This Pokémon can always flee from a Wild Pokémon battle, ignoring any effects or conditions that prevent fleeing.",
    description: "Enables a sure getaway from wild Pokémon.",
  },
  {
    name: "Water Absorb",
    effect: "This Pokémon is immune to Water-Type Moves. When hit by a Water-Type Move, restore 2 HP instead.",
    description: "Restores HP if hit by a water-type move, instead of taking damage.",
  },
  {
    name: "Shell Armor",
    effect: "This Pokémon cannot receive Critical Hits.",
    description: "A hard shell protects the Pokémon from critical hits.",
  },
];

// Items list  
export const ITEMS: Item[] = [
  {
    name: "Potion",
    description: "A spray-type medicine for wounds. It can be used to restore 10 HP to a single Pokémon.",
    effect: "Restore 10 HP to one Pokémon.",
    cost: 200,
  },
  {
    name: "Super Potion",
    description: "A spray-type medicine for wounds. It can be used to restore 25 HP to a single Pokémon.",
    effect: "Restore 25 HP to one Pokémon.",
    cost: 700,
  },
  {
    name: "Hyper Potion",
    description: "A spray-type medicine for wounds. It can be used to restore 50 HP to a single Pokémon.",
    effect: "Restore 50 HP to one Pokémon.",
    cost: 1200,
  },
  {
    name: "Max Potion",
    description: "A spray-type medicine that fully restores the HP of a single Pokémon.",
    effect: "Fully restore one Pokémon's HP.",
    cost: 2500,
  },
  {
    name: "Full Restore",
    description: "A spray-type medicine that can be used to fully restore the HP of a single Pokémon and eliminate any status condition it has contracted.",
    effect: "Fully restore HP and cure all Status Ailments.",
    cost: 3000,
  },
  {
    name: "Antidote",
    description: "A spray-type medicine for treating poisoning. It can be used to cure a single Pokémon of being poisoned.",
    effect: "Cure Poison and Bad Poison.",
    cost: 100,
  },
  {
    name: "Burn Heal",
    description: "A spray-type medicine for treating burns. It can be used to heal a single Pokémon of a burn.",
    effect: "Cure Burn.",
    cost: 250,
  },
  {
    name: "Ice Heal",
    description: "A spray-type medicine for treating freezing. It can be used to thaw a single Pokémon that has been frozen solid.",
    effect: "Cure Freeze.",
    cost: 250,
  },
  {
    name: "Awakening",
    description: "A spray-type medicine for treating sleep. It can be used to wake a single Pokémon that is sleeping.",
    effect: "Cure Sleep.",
    cost: 250,
  },
  {
    name: "Paralyze Heal",
    description: "A spray-type medicine for treating paralysis. It can be used to free a single Pokémon that has been paralyzed.",
    effect: "Cure Paralysis.",
    cost: 200,
  },
  {
    name: "Full Heal",
    description: "A spray-type medicine that is used on a Pokémon. It can cure any status condition a Pokémon has contracted.",
    effect: "Cure all Status Ailments.",
    cost: 600,
  },
  {
    name: "Revive",
    description: "A medicine that can be used to revive a single Pokémon that has fainted. It also restores half the Pokémon's max HP.",
    effect: "Revive a fainted Pokémon with half HP.",
    cost: 1500,
  },
  {
    name: "Max Revive",
    description: "A medicine that can be used to revive a single Pokémon that has fainted. It fully restores the Pokémon's HP.",
    effect: "Revive a fainted Pokémon with full HP.",
    cost: 4000,
  },
  {
    name: "Pokéball",
    description: "A device for catching wild Pokémon. It is thrown at a wild Pokémon to catch it.",
    effect: "+0 to catching roll.",
    cost: 200,
  },
  {
    name: "Great Ball",
    description: "A high-performance Ball that provides a higher Pokémon catch rate than a standard Poké Ball.",
    effect: "+1 to catching roll.",
    cost: 600,
  },
  {
    name: "Ultra Ball",
    description: "An ultra-high performance Ball that provides a higher Pokémon catch rate than a Great Ball.",
    effect: "+2 to catching roll.",
    cost: 1200,
  },
  {
    name: "Oran Berry",
    description: "If the holder's HP drops to half or below, this berry is consumed and restores 10 HP.",
    effect: "When HP drops to half or below: Restore 10 HP.",
    cost: 80,
  },
  {
    name: "Sitrus Berry",
    description: "If the holder's HP drops to half or below, this berry is consumed and restores 25 HP.",
    effect: "When HP drops to half or below: Restore 25 HP.",
    cost: 200,
  },
  {
    name: "Lum Berry",
    description: "This berry cures any status ailment when consumed by the holder. Works once per battle.",
    effect: "Cures any Status Ailment.",
    cost: 200,
  },
  {
    name: "Leftovers",
    description: "An item to be held by a Pokémon. The holder's HP is gradually restored during battle.",
    effect: "Restore 1 HP at the end of each Round.",
    cost: 1000,
  },
  {
    name: "Choice Band",
    description: "An item to be held by a Pokémon. It boosts Attack, but allows the use of only one move.",
    effect: "Increase Strength by 2. Can only use one Move per Scene.",
    cost: 1200,
  },
  {
    name: "Choice Specs",
    description: "An item to be held by a Pokémon. It boosts Sp. Atk, but allows the use of only one move.",
    effect: "Increase Special by 2. Can only use one Move per Scene.",
    cost: 1200,
  },
  {
    name: "Rocky Helmet",
    description: "If the holder of this item is hit by a physical attack, the attacker is also damaged.",
    effect: "When hit by a Non-Ranged Physical Move: deal 1 Damage to the foe ignoring defenses.",
    cost: 1000,
  },
  {
    name: "Life Orb",
    description: "An item to be held by a Pokémon. It boosts the power of moves but at the cost of some HP each use.",
    effect: "Add 2 Dice to all Damage Pools. Lose 1 HP each time a Move deals damage.",
    cost: 2000,
  },
];

// ─── Habitats ────────────────────────────────────────────────────────────────

export type Habitat = "Towns/Cities" | "Plains/Grassland" | "Forest/Jungle" | "Lakes/Rivers/Sea" | "Caves/Mountains" | "Desert/Volcanoes" | "Arctic Regions";

export interface HabitatData {
  name: Habitat;
  emoji: string;
  color: string;
  description: string;
  commonTypes: PokemonType[];
  uncommonTypes: PokemonType[];
  rareTypes: PokemonType[];
  pokemonNumbers: number[];
}

export const HABITATS: HabitatData[] = [
  {
    name: "Towns/Cities",
    emoji: "🏙️",
    color: "#a040a0",
    description: "Wild Pokémon living in or close to human settlements. Types are very varied — Normal, Electric, Flying, Dark, Poison, Psychic. Expect them to be resourceful and street-smart.",
    commonTypes: ["Normal", "Electric", "Flying", "Dark"],
    uncommonTypes: ["Poison", "Psychic", "Steel"],
    rareTypes: ["Ghost", "Fairy"],
    pokemonNumbers: [52, 39, 25, 133],
  },
  {
    name: "Plains/Grassland",
    emoji: "🌾",
    color: "#78c850",
    description: "Most Pokémon lurk hidden in tall grass so this habitat is perfect to find a variety of Pokémon Types. Though Normal and Flying may be the most commonly seen.",
    commonTypes: ["Normal", "Flying", "Ground", "Grass"],
    uncommonTypes: ["Fight", "Rock", "Dark", "Electric"],
    rareTypes: ["Fire", "Fairy", "Psychic"],
    pokemonNumbers: [1, 4, 7, 25, 39, 133, 261],
  },
  {
    name: "Forest/Jungle",
    emoji: "🌲",
    color: "#228b22",
    description: "Grass, Bug and Poison Types thrive in this environment. If you dare to travel after dusk, you may be surprised by a Ghost or Fairy Type lurking in the night.",
    commonTypes: ["Bug", "Grass", "Poison", "Flying"],
    uncommonTypes: ["Fight", "Electric", "Normal", "Rock"],
    rareTypes: ["Ghost", "Steel", "Dark"],
    pokemonNumbers: [1, 39, 52, 133, 353],
  },
  {
    name: "Lakes/Rivers/Sea",
    emoji: "🌊",
    color: "#6890f0",
    description: "Trying to find a Water Type Pokémon? Dive in or get a fishing rod! You may also find other Pokémon preying on fish-Pokémon or trying to cool themselves.",
    commonTypes: ["Water", "Ice"],
    uncommonTypes: ["Flying", "Normal", "Electric"],
    rareTypes: ["Dragon", "Psychic"],
    pokemonNumbers: [7, 131, 246],
  },
  {
    name: "Caves/Mountains",
    emoji: "⛰️",
    color: "#b8a038",
    description: "Rock and Steel Pokémon can blend easily in this environment. Due to the difficult living conditions, Fighting Types train here. Pokémon become stronger the deeper and higher you go.",
    commonTypes: ["Rock", "Ground", "Fight", "Steel"],
    uncommonTypes: ["Normal", "Poison", "Dark"],
    rareTypes: ["Dragon", "Ghost", "Ice"],
    pokemonNumbers: [94, 246, 445],
  },
  {
    name: "Desert/Volcanoes",
    emoji: "🌋",
    color: "#f08030",
    description: "Few Pokémon can resist the high temperature, but if you are looking for Ground, Fire and even Dragon Type Pokémon, these habitats should be explored carefully.",
    commonTypes: ["Fire", "Ground", "Rock"],
    uncommonTypes: ["Dragon", "Steel", "Normal"],
    rareTypes: ["Ice", "Psychic"],
    pokemonNumbers: [4, 445],
  },
  {
    name: "Arctic Regions",
    emoji: "❄️",
    color: "#98d8d8",
    description: "Ice Types are rarely seen away from their element. Just be careful as you explore these areas where the nearest Pokémon Center may be hundreds of kilometers away.",
    commonTypes: ["Ice", "Water"],
    uncommonTypes: ["Normal", "Steel"],
    rareTypes: ["Dragon", "Ghost"],
    pokemonNumbers: [131],
  },
];

// ─── Status Effects ───────────────────────────────────────────────────────────

export interface StatusEffect {
  name: string;
  color: string;
  description: string;
  modifiers: {
    accuracyPenalty?: number;
    strengthPenalty?: number;
    dexterityPenalty?: number;
    specialPenalty?: number;
    damageTaken?: number;
    cannotAct?: boolean;
    cannotEvade?: boolean;
  };
  endOfRound?: string;
}

export const STATUS_EFFECTS: Record<string, StatusEffect> = {
  Healthy: { name: "Healthy", color: "#00d4aa", description: "No status ailment.", modifiers: {} },
  Burned: {
    name: "Burned", color: "#f08030",
    description: "The Pokémon is on fire. Loses 1 HP at the end of each round. Physical move damage is reduced by 1.",
    modifiers: { strengthPenalty: 1 },
    endOfRound: "Take 1 Fire damage (ignoring defenses)",
  },
  Frozen: {
    name: "Frozen", color: "#98d8d8",
    description: "The Pokémon is frozen solid. Cannot act or evade. Thaws if hit by a Fire-Type move.",
    modifiers: { cannotAct: true, cannotEvade: true },
  },
  Paralyzed: {
    name: "Paralyzed", color: "#f8d030",
    description: "The Pokémon can barely move. Dexterity is reduced by 2 for accuracy rolls.",
    modifiers: { dexterityPenalty: 2 },
  },
  Poisoned: {
    name: "Poisoned", color: "#a040a0",
    description: "The Pokémon is mildly poisoned. Loses 1 HP at end of each round.",
    modifiers: {},
    endOfRound: "Take 1 Poison damage (ignoring defenses)",
  },
  "Badly Poisoned": {
    name: "Badly Poisoned", color: "#7038f8",
    description: "The Pokémon is badly poisoned. Loses 2 HP at end of each round.",
    modifiers: {},
    endOfRound: "Take 2 Poison damage (ignoring defenses)",
  },
  Asleep: {
    name: "Asleep", color: "#705898",
    description: "The Pokémon is asleep. Cannot act or evade. Wakes after 1-3 rounds or if hit.",
    modifiers: { cannotAct: true, cannotEvade: true },
  },
  Confused: {
    name: "Confused", color: "#f85888",
    description: "The Pokémon is confused. Before acting, roll 1 die — on a failure it hits itself.",
    modifiers: {},
  },
  Flinched: {
    name: "Flinched", color: "#e8eaf0",
    description: "The Pokémon flinched. Loses its action this turn. Clears at end of round.",
    modifiers: { cannotAct: true },
  },
};

// ─── Weather / Environment ────────────────────────────────────────────────────

export interface WeatherEffect {
  name: string;
  emoji: string;
  color: string;
  description: string;
  endOfRoundEffect?: string;
  modifiers: {
    typeBoost?: PokemonType;
    typeWeaken?: PokemonType;
    damagePerRound?: number;
    immuneTypes?: PokemonType[];
  };
  triggeredAbilities?: string[];
}

export const WEATHER_EFFECTS: WeatherEffect[] = [
  {
    name: "Clear",
    emoji: "☀️ (Normal)",
    color: "#e8eaf0",
    description: "No special weather conditions. Standard battle rules apply.",
    modifiers: {},
  },
  {
    name: "Sunny",
    emoji: "☀️",
    color: "#f8d030",
    description: "Strong sunlight boosts Fire-Type moves and weakens Water-Type moves. Solar Beam charges in one action.",
    modifiers: { typeBoost: "Fire", typeWeaken: "Water" },
    triggeredAbilities: ["Blaze", "Chlorophyll", "Solar Power", "Forecast", "Flower Gift"],
  },
  {
    name: "Rain",
    emoji: "🌧️",
    color: "#6890f0",
    description: "Rain boosts Water-Type moves and weakens Fire-Type moves. Thunder never misses.",
    modifiers: { typeBoost: "Water", typeWeaken: "Fire" },
    triggeredAbilities: ["Torrent", "Rain Dish", "Hydration", "Swift Swim", "Forecast", "Cloud Nine"],
  },
  {
    name: "Sandstorm",
    emoji: "🌪️",
    color: "#e0c068",
    description: "All non-Rock/Ground/Steel Pokémon take 1 damage at end of each round. Rock-Type Pokémon get +1 Sp. Defense.",
    modifiers: { damagePerRound: 1, immuneTypes: ["Rock", "Ground", "Steel"] },
    endOfRoundEffect: "Non-Rock/Ground/Steel Pokémon take 1 typeless damage",
    triggeredAbilities: ["Sand Veil", "Sand Stream", "Sand Rush", "Sand Force"],
  },
  {
    name: "Hail",
    emoji: "🧊",
    color: "#98d8d8",
    description: "All non-Ice Pokémon take 1 damage at end of each round.",
    modifiers: { damagePerRound: 1, immuneTypes: ["Ice"] },
    endOfRoundEffect: "Non-Ice Pokémon take 1 Ice damage",
    triggeredAbilities: ["Slush Rush", "Ice Body", "Forecast", "Blizzard never misses"],
  },
  {
    name: "Fog",
    emoji: "🌫️",
    color: "#8b90a8",
    description: "Accuracy rolls for all Pokémon are reduced by 1 success.",
    modifiers: {},
  },
  {
    name: "Electric Terrain",
    emoji: "⚡",
    color: "#f8d030",
    description: "Electric-Type Moves get +1 die to their Damage Pool. Pokémon on the ground cannot fall asleep.",
    modifiers: { typeBoost: "Electric" },
    triggeredAbilities: ["Electric Surge", "Hadron Engine"],
  },
  {
    name: "Misty Terrain",
    emoji: "🌸",
    color: "#EE99AC",
    description: "Fairy-Type Moves get +1 die to Damage Pool. Pokémon on the ground cannot be inflicted with status ailments.",
    modifiers: { typeBoost: "Fairy" },
    triggeredAbilities: ["Misty Surge"],
  },
];

// ─── Missingno ────────────────────────────────────────────────────────────────

export const MISSINGNO: PokemonEntry = {
  number: 0,
  name: "Missingno.",
  types: ["Normal"],
  height: "???",
  weight: "???",
  baseHp: 0,
  attributes: { strength: 0, dexterity: 0, vitality: 0, special: 0, insight: 0 },
  attributeLimits: { strength: 10, dexterity: 10, vitality: 10, special: 10, insight: 10 },
  abilities: [],
  suggestedRank: "Starter",
  evolutiveStage: "???",
  moves: [],
  description: "A blank entry. Use this to create custom creatures and encounters — edit all stats, moves, and abilities freely in the Battle Tracker.",
  weaknesses: [],
  resistances: [],
  immunities: [],
};

// ─── Trainer Types ────────────────────────────────────────────────────────────

export type TrainerAge = "Child" | "Teen" | "Adult" | "Senior";

export interface TrainerCharacter {
  id: string;
  name: string;
  playerName: string;
  concept: string;
  nature: string;
  age: TrainerAge;
  rank: Rank;
  hp: number;
  maxHp: number;
  willPoints: number;
  maxWillPoints: number;
  money: number;
  attributes: {
    strength: number;
    dexterity: number;
    vitality: number;
    insight: number;
  };
  socialAttributes: {
    tough: number;
    cool: number;
    beauty: number;
    cute: number;
    clever: number;
  };
  skills: {
    brawl: number;
    channel: number;
    clash: number;
    evasion: number;
    alert: number;
    athletic: number;
    nature: number;
    stealth: number;
    etiquette: number;
    intimidate: number;
    perform: number;
  };
  achievements: string[];
  notes: string;
  gymBadges: boolean[];
  pokemon: string[]; // IDs of Pokemon in party
  favoriteId?: string;
}

export const AGE_BONUSES: Record<TrainerAge, { attributes: number; social: number }> = {
  Child: { attributes: 0, social: 0 },
  Teen: { attributes: 2, social: 2 },
  Adult: { attributes: 4, social: 4 },
  Senior: { attributes: 3, social: 6 },
};

export const RANK_BONUSES: Record<Rank, { attributes: number; social: number; skills: number; skillLimit: number }> = {
  Starter: { attributes: 0, social: 0, skills: 5, skillLimit: 1 },
  Rookie: { attributes: 2, social: 2, skills: 10, skillLimit: 2 },
  Standard: { attributes: 4, social: 4, skills: 14, skillLimit: 3 },
  Advanced: { attributes: 6, social: 6, skills: 17, skillLimit: 4 },
  Expert: { attributes: 8, social: 8, skills: 19, skillLimit: 5 },
  Ace: { attributes: 10, social: 10, skills: 20, skillLimit: 5 },
  Master: { attributes: 10, social: 10, skills: 22, skillLimit: 5 },
  Champion: { attributes: 14, social: 14, skills: 25, skillLimit: 5 },
};

export const NATURES = [
  "Hardy","Lonely","Brave","Adamant","Naughty",
  "Bold","Docile","Relaxed","Impish","Lax",
  "Timid","Hasty","Serious","Jolly","Naive",
  "Modest","Mild","Quiet","Bashful","Rash",
  "Calm","Gentle","Sassy","Careful","Quirky",
];
