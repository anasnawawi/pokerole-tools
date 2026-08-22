import { PokemonGender, TrainerGender } from "../lib/trainer";

/* The ♂/♀ glyphs, everywhere a Pokémon's or trainer's gender is known —
   Genderless/Unspecified render nothing rather than a placeholder, so the
   icon only ever appears where it actually carries information. A dark
   drop shadow keeps them legible against light backgrounds, where the flat
   glyph alone tended to disappear. */
const MALE_COLOR = "#42CBFF";
const FEMALE_COLOR = "#FF9A94";

export function GenderIcon({ gender, size = 11 }: { gender: PokemonGender | TrainerGender; size?: number }) {
  if (gender === "Male") return <span title="Male" style={{color: MALE_COLOR, fontSize: size, lineHeight: 1, fontWeight: 700, textShadow: "0 0 2px rgba(0,0,0,0.75), 1px 1px 0 rgba(0,0,0,0.55)"}}>♂</span>;
  if (gender === "Female") return <span title="Female" style={{color: FEMALE_COLOR, fontSize: size, lineHeight: 1, fontWeight: 700, textShadow: "0 0 2px rgba(0,0,0,0.75), 1px 1px 0 rgba(0,0,0,0.55)"}}>♀</span>;
  return null;
}
