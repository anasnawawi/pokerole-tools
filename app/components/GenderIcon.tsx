import { PokemonGender, TrainerGender } from "../lib/trainer";

/* The classic ♂/♀ glyphs in the games' own blue/pink, everywhere a
   Pokémon's or trainer's gender is known — Genderless/Unspecified render
   nothing rather than a placeholder, so the icon only ever appears where
   it actually carries information. */
const MALE_COLOR = "#6890F0";
const FEMALE_COLOR = "#F85888";

export function GenderIcon({ gender, size = 11 }: { gender: PokemonGender | TrainerGender; size?: number }) {
  if (gender === "Male") return <span title="Male" style={{color: MALE_COLOR, fontSize: size, lineHeight: 1, fontWeight: 700}}>♂</span>;
  if (gender === "Female") return <span title="Female" style={{color: FEMALE_COLOR, fontSize: size, lineHeight: 1, fontWeight: 700}}>♀</span>;
  return null;
}
