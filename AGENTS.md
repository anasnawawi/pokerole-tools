<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project notes

Audited 2026-11-20 from the code, the git history (53 commits, 2026-08-22 to 2026-11-19) and the Vercel deployment log. Tags: [Certain] = read in code or logs. [Likely] = inferred from evidence. [Guessing] = hypothesis to check.

## What this is

A browser app for the PokeRole 3.0 tabletop RPG. It started as a reference tool (Pokédex, moves, abilities, items) and is now also a playable game. It is styled as a Pokédex device. It has no backend. [Certain]

Stack: Next.js 16.2.9, React 19.2.4, TypeScript, Tailwind v4 (barely used), `fuse.js` search, `@dnd-kit` drag and drop. Live site: `pokerole-tools.vercel.app`. Repo: `anasnawawi/pokerole-tools`.

Run it: `npm install`, then `npm run dev` (port 3000). Lint: `npm run lint`. There are no tests. [Certain]

## Direction of the work

[Likely] The project moved through four phases:

| Dates | Focus | Examples |
|---|---|---|
| Aug 22–24 | GM battle tracker and the battle stage UI, plus mobile fixes | sprite scaling by species height, Transform, Illusion, Schooling, nameplates, encounter difficulty picker |
| Aug 24–26 | Make the device a player tool | start menu, starter picker, trainer and Pokémon cards inside `/characters`, auto and manual dice, capture and ball rules |
| Aug 27–28 | Solo play loop | TamaPoke care screen (`/care`), Walk encounters, HP and damage balance |
| Nov 19 | Save modes and polish | Mystery Dungeon mode (the player is a Pokémon), Hall of Fame entry, one-column Pokémon sheet on phones |

The goal looks like a PokeRole game that one person can play alone on a phone, with the GM tools kept beside it. [Likely]

## Routes (`app/`)

| Route | File | Purpose |
|---|---|---|
| `/` | `page.tsx` | Landing Pokédex device, start menu, new game (Trainer or Mystery Dungeon), Hall of Fame |
| `/characters` | `characters/page.tsx` | Trainer sheet, party sheets, PC Box (`?tab=sheet\|pokemon\|pcbox`) |
| `/reference` | `reference/` | Pokédex, moves, abilities, items, types, status, weather (`?tab=`) |
| `/reference/quick-ref` | `reference/quick-ref` | Static rules cheat sheet |
| `/battle-tracker` | `battle-tracker/page.tsx` | GM combat tracker. Very large file. Holds capture, Mega, Dynamax, Tera, Z-moves, hazards, weather |
| `/gm-screen` | `gm-screen/page.tsx` | Configurable panel grid (`PANEL_CATALOG`) |
| `/encounter` | `encounter/` | Older habitat and rank encounter roller. Pushes `encounter_queue` |
| `/care` | `care/page.tsx` | TamaPoke real-time care. The "Walk" encounter lives here, not in `/encounter` |
| `/trainer-card` | `trainer-card/` | Redirects to `/characters` |

## Code map

- `app/components/PokedexFrame.tsx`: shell chrome for every tool page. Exports the palette `C`, `SITE_LINKS` and the `HallOfFame` easter egg (lens click, fixed entries).
- `app/components/`: also `PartyBar` (party strip), `StarterPicker`, `TrainerCards`, `HintBar`, `GenderIcon`.
- `app/lib/trainer.ts`: `TrainerData`, `PokemonSheetData`, `normalizeTrainer`, `resolveGender`. Keep it free of the dex import.
- `app/lib/storage.ts`: `pokerole_`-prefixed localStorage wrappers.
- `app/lib/session.ts`: `useSession()` and `notifySession()`.
- `app/lib/care.ts`: pure care engine. `app/lib/training.ts`: shared training dice and `applyHappinessGain`.
- `app/data/`: species in `pokemon-chunk-1..4.ts` (about 480 KB each, #0 to #1025), merged by `pokerole-data.ts` and `data-index.ts`. Also moves, abilities, items, natures, egg groups and `game-rules`. The dex is about 2 MB, so `trainer.ts` and `PartyBar` avoid importing it.
- `public/sprites/` (about 2,000 files): `pokemon/{n}.png`, `trainers/{id}.png`, plus `back/` variants. `scripts/fetch-sprites.mjs` refills them.

## Persistence

All state is browser localStorage. Keys use the `pokerole_` prefix. [Certain]

- Keys: `trainers`, `pokemon_sheets`, `active_trainer_id`, `bt_entries`, `bt_hazards`, `bt_started`, `encounter_queue`, `pending_link`, `gm_notes`, `gm_grid`, `gm_dims`.
- Several trainers can exist. `active_trainer_id` picks the one in play.
- Save mode is `TrainerData.mode`: `"trainer"` (default, also when missing) or `"pokemon"` (Mystery Dungeon).
- In `"pokemon"` mode, `party[0]` is the player. There is no separate trainer sheet.
- A sheet's care data (`care?: CareState`) is created lazily on `/care`.

## Conventions

- Styling is almost all inline `style={{}}`. Shared tokens and `.fr-*` classes are in `globals.css`. Palette source: `C` in `PokedexFrame.tsx`.
- Every page and component is `"use client"`. Pages that read `useSearchParams` wrap in `Suspense`.
- Fonts: Exo 2 and Inter (`layout.tsx`), Press Start 2P (`globals.css`).
- The `react-hooks/purity` lint rule explains the top-level `rand()` and `nowMs()` wrappers. Keep using them.
- Phone width matters. Use `minmax(0,1fr)` or an auto-fit grid with a floor. A fixed two-column grid overlapped on phones.

## Deploy and git

- Vercel project `pokerole-tools` builds from GitHub. `vercel.json` is minimal.
- [Certain] The merge of PR #1 into `master` was built as a preview (target `null`), not production. It was promoted by hand with a redeploy that set target `production`. Check this after every merge to `master`.
- [Guessing] The production-branch setting in Vercel is the cause. Nobody has checked it yet.
- Production state on 2026-11-20: latest production deployment is `master` at `4d06fbe`. No runtime errors in the last 7 days. [Certain]
- Work happens on a feature branch and goes to `master` through a pull request.

## Known issues

- `gm-screen/page.tsx` listens for the storage key `bt_entries`, but the real key is `pokerole_bt_entries`. Cross-tab sync from the tracker likely never fires there. [Certain]
- `lib/storage.ts` hardcodes `pokerole_` in two places and ignores `STORAGE_PREFIX`.
- `components/DiceRoller` and `lib/battle-utils.ts` have no importers (dead code). The tracker and GM screen each redefine the same helpers and `BattleEntry`.
- Data files say "AUTO-GENERATED", but no generator is in the repo. [Likely] They were edited by hand. Edit them directly.
- `.claude/launch.json` points at the alias `pokerole-tools-git-main-…`, but the branch is `master`. It also has Windows paths. [Certain]
- `.claude/settings.local.json` is committed. It is a personal file and should not be tracked. [Certain]
- `/reference` "Track" writes `sessionStorage.track_pokemon`, and no reader was found. [Likely] dead.
- The README does not list care, encounter or save-mode features.
