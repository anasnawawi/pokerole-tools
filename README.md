# PokeRole Tools — TTRPG Reference

A complete digital reference tool for the [PokeRole 3.0](https://pokeroleproject.com/) TTRPG system, inspired by 5etools and Pf2eTools.

## Features

- **Pokédex** — Browse all Pokémon with full stats, type matchups, abilities, and learnable moves. Filter by type or search by name.
- **Moves** — Complete Movedex with Power, Accuracy rolls, Damage Pools, and Added Effects. Filter by type and category.
- **Abilities** — Full Abilitydex including unique abilities and which Pokémon carry them.
- **Items** — Items reference with effects and costs.
- **⚔️ Battle Tracker** — DM tool to pin multiple Pokémon mid-session and track HP, Will Points, Status Conditions, and notes live.

## Design

Dark Pokédex-terminal aesthetic — fast navigation, dense reference layout, always-visible battle tracker panel.

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Or push to GitHub and import the repo at vercel.com.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Save and restore your game

Open **Save & backup** from the home screen or any tool page. Games save in this browser on this device, and do not sync between devices or different deployment URLs. Clearing browser data removes the local game.

- **Download backup** exports trainers, party and PC Pokémon (including care progress), and GM notes and layout as a JSON file.
- **Choose backup file** validates the file and shows its date and trainer/Pokémon counts before you confirm replacement. Close other PokeRole tabs before restoring.
- Restoring clears active battles and queued encounters. Those temporary states are not included in backups.
- After a successful restore, **Review previous save** lets you recover the previous local game. Keep a downloaded backup as well, since browser recovery is also removed when browser data is cleared.

On the party sheet, vitals and moves are shown first. Expand **View attributes, social stats & skills** for the full summary, or **Edit [Pokémon] — stats, moves & care** to make changes.

Run backup validation, restore, and storage-failure tests with `npm run test:backup`.
