// AUTO-GENERATED index - imports all data chunks
import { POKEMON_CHUNK_1 } from "./pokemon-chunk-1";
import { POKEMON_CHUNK_2 } from "./pokemon-chunk-2";
import { POKEMON_CHUNK_3 } from "./pokemon-chunk-3";
import { POKEMON_CHUNK_4 } from "./pokemon-chunk-4";
import { MOVES_DATA } from "./moves-data";
import { ABILITIES_DATA } from "./abilities-data";
import { NATURES_DATA, NATURE_NAMES } from "./natures-data";

export const ALL_POKEMON_DATA = [...POKEMON_CHUNK_1, ...POKEMON_CHUNK_2, ...POKEMON_CHUNK_3, ...POKEMON_CHUNK_4];
export const ALL_MOVES_DATA = MOVES_DATA;
export const ALL_ABILITIES_DATA = ABILITIES_DATA;
export const ALL_NATURES_DATA = NATURES_DATA;
export { NATURE_NAMES };

// ── Move type lookup (hydrate pokemon moves with correct types at runtime) ──
let _moveTypeMap: Record<string, string> | null = null;
export function getMoveTypeMap(): Record<string, string> {
  if (!_moveTypeMap) {
    _moveTypeMap = {};
    for (const m of MOVES_DATA) {
      _moveTypeMap[m.name.toLowerCase()] = m.type;
    }
  }
  return _moveTypeMap;
}
