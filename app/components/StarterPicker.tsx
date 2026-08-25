"use client";
/* The launch screen's own starter-picking flow — search a species, fill in
   the handful of details a fresh sheet actually needs (nickname, nature,
   gender), then hand off to the real Trainer sheet to finish attribute and
   skill allocation for both trainer and Pokémon. Split out of app/page.tsx
   and loaded with next/dynamic (see there) specifically so the ~2MB
   Pokémon dataset this needs never loads for a trainer who already has a
   party — only the moment they're actually choosing a starter. */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { POKEMON, NATURES, TYPE_COLORS, PokemonType } from "../data/pokerole-data";
import { Rank, getRankIndex } from "../data/game-rules";
import {
  TrainerData, PokemonSheetData, PokemonGender, resolveGender,
  TRAINERS_KEY, SHEETS_KEY, loadTrainers, loadPokemonSheets,
} from "../lib/trainer";
import { saveToStorage } from "../lib/storage";
import { notifySession } from "../lib/session";
import { GenderIcon } from "./GenderIcon";
import { C } from "./PokedexFrame";

const RANK_COLORS: Record<Rank, string> = {
  Starter: "#78c850", Rookie: "#6890f0", Standard: "#f8d030", Advanced: "#f08030",
  Expert: "#a040a0", Ace: "#e04040", Master: "#705898", Champion: "#ffd700",
};
const GENDER_CHOICES: PokemonGender[] = ["Male", "Female", "Genderless"];
const pixel = "'Press Start 2P',monospace";

export default function StarterPicker({ trainer, narrow, onCancel }: {
  trainer: TrainerData; narrow: boolean; onCancel: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [rankFiltered, setRankFiltered] = useState(true);
  const [selected, setSelected] = useState<typeof POKEMON[number] | null>(null);
  const [nickname, setNickname] = useState("");
  const [nature, setNature] = useState("Hardy");
  const [gender, setGender] = useState<PokemonGender>("Male");

  const list = useMemo(() => {
    let arr = POKEMON;
    if (rankFiltered) arr = arr.filter(p => getRankIndex(p.suggestedRank) <= getRankIndex(trainer.rank));
    const q = search.trim().toLowerCase();
    if (q) arr = arr.filter(p => p.name.toLowerCase().includes(q) || String(p.number).includes(q.replace("#", "")));
    return arr;
  }, [search, rankFiltered, trainer.rank]);

  const pick = (p: typeof POKEMON[number]) => {
    setSelected(p);
    setNickname("");
    setNature(NATURES[Math.floor(Math.random() * NATURES.length)]);
    const resolved = resolveGender(p.number, "Unknown");
    setGender(resolved === "Unknown" ? "Male" : resolved);
  };

  const confirm = () => {
    if (!selected) return;
    const key = `${trainer.id}_${selected.number}_${Date.now()}`;
    const sheet: PokemonSheetData = {
      number: selected.number, nickname: nickname.trim(), gender, rank: selected.suggestedRank,
      loyalty: 1, happiness: 1,
      attributes: { ...selected.attributes },
      trainingAttributes: { strength: 0, dexterity: 0, vitality: 0, special: 0, insight: 0 },
      socialAttributes: { tough: 1, cool: 1, beauty: 1, cute: 1, clever: 1 },
      skills: { brawl: 0, channel: 0, clash: 0, evasion: 0, alert: 0, athletic: 0, nature: 0, stealth: 0, charm: 0, etiquette: 0, intimidate: 0, perform: 0 },
      moves: selected.moves.filter(m => getRankIndex(m.rank) <= getRankIndex(trainer.rank)).slice(0, 4).map(m => m.name),
      partnerMoves: [], isPartner: false, nature, origin: "wild",
      heldItem: "", cruelty: false, inPokeball: false, happinessPending: 0, notes: "",
    };
    const trainers = loadTrainers();
    const idx = trainers.findIndex(t => t.id === trainer.id);
    if (idx >= 0) {
      const next = [...trainers];
      next[idx] = { ...next[idx], pokemon: [...next[idx].pokemon, key] };
      saveToStorage(TRAINERS_KEY, next);
    }
    saveToStorage(SHEETS_KEY, { ...loadPokemonSheets(), [key]: sheet });
    notifySession();
    // Only now does the device leave the launch screen — straight to the
    // sheet that has both the trainer's own remaining points and (via its
    // party tab, one click away) the Pokémon's, matching every other todo
    // this page already jumps a GM to.
    router.push("/characters?tab=sheet");
  };

  const field: React.CSSProperties = {
    width: "100%", padding: narrow ? "6px 7px" : "7px 9px", borderRadius: 3,
    border: `2px solid ${C.navy}`, background: "#FFFFFF", color: C.navy,
    fontSize: narrow ? 11 : 12, fontFamily: "inherit",
  };

  return (
    <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: narrow ? 8 : 12 }}>
      {!selected ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexShrink: 0 }}>
            <button onClick={onCancel} title="Back" aria-label="Back"
              style={{ flexShrink: 0, background: C.bezel, border: `2px solid ${C.outline}`, borderRadius: 4,
                width: narrow ? 22 : 26, height: narrow ? 22 : 26, cursor: "pointer", fontSize: narrow ? 11 : 13, color: C.navy }}>‹</button>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or #…" style={{ ...field, flex: 1 }} />
          </div>
          <button onClick={() => setRankFiltered(f => !f)}
            style={{ flexShrink: 0, marginBottom: 8, alignSelf: "flex-start", cursor: "pointer",
              padding: narrow ? "3px 8px" : "4px 10px", borderRadius: 4, border: `2px solid ${C.navy}`,
              background: rankFiltered ? C.navy : "#FFFFFF", color: rankFiltered ? "#FFFFFF" : C.navy,
              fontSize: narrow ? 9 : 10, fontFamily: pixel }}>
            {rankFiltered ? `${trainer.rank.toUpperCase()} & BELOW` : "ALL POKéMON"}
          </button>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#F8F8F0",
            border: `3px solid ${C.navy}`, borderRadius: 4, boxShadow: `inset 0 0 0 2px #FFFFFF`, padding: 4 }}>
            {list.length === 0 && (
              <div style={{ padding: 12, fontSize: narrow ? 10 : 11, color: "#5A6280", textAlign: "center" }}>
                No Pokémon match — try a different search or turn off the rank filter.
              </div>
            )}
            {list.map(p => (
              // Regional/alt forms can share a national dex number (see
              // e.g. Rattata vs. Alolan Rattata) — pair it with the name,
              // which is what actually distinguishes them, for a real key.
              <button key={`${p.number}-${p.name}`} onClick={() => pick(p)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                  cursor: "pointer", padding: narrow ? "5px 6px" : "6px 8px", borderRadius: 3, background: "transparent" }}>
                <span style={{ fontSize: narrow ? 9 : 10, color: "#4A5470", width: 30, flexShrink: 0, fontFamily: pixel }}>
                  #{String(p.number).padStart(3, "0")}
                </span>
                <span style={{ fontSize: narrow ? 11 : 12, color: C.navy, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {p.types.map(t => <span key={t} title={t} style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_COLORS[t as PokemonType] }} />)}
                </span>
                <span style={{ fontSize: narrow ? 8 : 9, color: RANK_COLORS[p.suggestedRank], width: 52, textAlign: "right", flexShrink: 0 }}>{p.suggestedRank}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexShrink: 0 }}>
            <button onClick={() => setSelected(null)} title="Back to search" aria-label="Back to search"
              style={{ flexShrink: 0, background: C.bezel, border: `2px solid ${C.outline}`, borderRadius: 4,
                width: narrow ? 22 : 26, height: narrow ? 22 : 26, cursor: "pointer", fontSize: narrow ? 11 : 13, color: C.navy }}>‹</button>
            <span style={{ fontFamily: pixel, fontSize: narrow ? 10 : 12, color: C.navy }}>#{String(selected.number).padStart(3, "0")} {selected.name}</span>
            <span style={{ display: "flex", gap: 3 }}>
              {selected.types.map(t => <span key={t} title={t} style={{ width: 9, height: 9, borderRadius: "50%", background: TYPE_COLORS[t as PokemonType] }} />)}
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ background: "#F8F8F0", border: `3px solid ${C.navy}`, borderRadius: 4,
              boxShadow: `inset 0 0 0 2px #FFFFFF`, padding: narrow ? 10 : 14, display: "flex", flexDirection: "column", gap: narrow ? 9 : 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: narrow ? 10 : 11, color: "#4A5470" }}>Nickname</span>
                <input autoFocus value={nickname} onChange={e => setNickname(e.target.value)}
                  maxLength={24} placeholder={selected.name} style={field} />
              </label>
              <div style={{ display: "flex", gap: narrow ? 8 : 10 }}>
                <label style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: narrow ? 10 : 11, color: "#4A5470" }}>Nature</span>
                  <select value={nature} onChange={e => setNature(e.target.value)} style={field}>
                    {NATURES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: narrow ? 10 : 11, color: "#4A5470", display: "flex", alignItems: "center", gap: 5 }}>
                    Gender <GenderIcon gender={gender} size={11} />
                  </span>
                  <select value={gender} onChange={e => setGender(e.target.value as PokemonGender)} style={field}>
                    {GENDER_CHOICES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
              </div>
              <button onClick={confirm}
                style={{ padding: narrow ? "9px 10px" : "11px 12px", borderRadius: 3,
                  border: `3px solid ${C.outline}`, background: C.navy, color: "#FFFFFF",
                  fontFamily: pixel, fontSize: narrow ? 9 : 10, cursor: "pointer", touchAction: "manipulation",
                  boxShadow: `0 3px 0 ${C.shellDeep}` }}>
                ✓ CHOOSE {selected.name.toUpperCase()}
              </button>
              <span style={{ fontSize: narrow ? 10 : 11, lineHeight: 1.5, color: "#5A6280" }}>
                Attribute and skill points, moves and everything else are filled in next, on the trainer sheet.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
