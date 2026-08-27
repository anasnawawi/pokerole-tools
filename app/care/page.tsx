"use client";
/* TamaPoke — the real-time care screen. See app/lib/care.ts for the decay
   engine this page is a thin UI over, and the "TamaPoke Roadmap" artifact
   for the full design writeup (prior art, formulas, what got cut for v1).

   Scope trimmed from that roadmap for this first pass: every party
   Pokémon gets care-tracked here (not poketama's 3-active/rest-frozen
   split) — simpler to ship, and nothing about the data shape stops that
   cap from being added later without a migration. */
import { useEffect, useMemo, useState } from "react";
import { POKEMON, TYPE_COLORS, PokemonType } from "../data/pokerole-data";
import {
  PokemonSheetData, TrainerData, SHEETS_KEY, TRAINERS_KEY,
  loadTrainers, loadPokemonSheets, getActiveTrainer,
} from "../lib/trainer";
import { saveToStorage } from "../lib/storage";
import { notifySession } from "../lib/session";
import { GenderIcon } from "../components/GenderIcon";
import PokedexFrame, { C } from "../components/PokedexFrame";
import * as Care from "../lib/care";

const pixel = "'Press Start 2P',monospace";

/* Re-ticks every open Care page on an interval, not just once on mount, so
   a Pokémon left on-screen and ignored actually decays in real time (see
   care.ts's LIVE_TICK_MAX_MS) instead of only catching up the next time
   someone opens this page. Two minutes is frequent enough that the bars
   visibly move during a session without hammering localStorage. */
const LIVE_RETICK_MS = 2 * 60 * 1000;

function GaugeBar({ label, value, color }: { label: string; value: number; color: string }) {
  const critical = value <= Care.CRITICAL_THRESHOLD;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 60, flexShrink: 0, fontSize: 10, color: "#585858", letterSpacing: "0.5px" }}>{label}</span>
      <span style={{ flex: 1, height: 10, borderRadius: 5, background: "#E4E4D0", overflow: "hidden", border: "1px solid #C8C8B0" }}>
        <span style={{ display: "block", height: "100%", width: `${value}%`,
          background: critical ? "#D82808" : value < 50 ? "#E8B018" : "#3d9d4a", transition: "width 0.3s" }} />
      </span>
      <span style={{ width: 30, textAlign: "right", fontSize: 11, fontWeight: 700, color: critical ? "#D82808" : "#383838" }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

function PokemonCareCard({ sheetKey, sheet, onChange }: {
  sheetKey: string; sheet: PokemonSheetData; onChange: (s: PokemonSheetData) => void;
}) {
  const species = useMemo(() => POKEMON.find(p => p.number === sheet.number), [sheet.number]);
  const care = sheet.care ?? Care.blankCare();
  const name = sheet.nickname.trim() || species?.name || `#${sheet.number}`;

  const applyCare = (next: Care.CareState) => onChange({ ...sheet, care: next });
  const doFeed = () => applyCare(Care.feed(care));
  const doGroom = () => applyCare(Care.groom(care));
  const doWalk = () => applyCare(Care.walk(care));

  return (
    <div style={{ background: "#F8F8E8", border: `3px solid ${care.inconsolable ? "#D82808" : "#181818"}`,
      borderRadius: 8, boxShadow: "3px 3px 0 #787878", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
        background: "linear-gradient(180deg,#3868C0 0%,#284C9C 100%)", color: "#F8F8F8" }}>
        <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%",
          background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local pixel art, next/image would blur it */}
          <img src={`/sprites/pokemon/${sheet.number}.png`} alt="" width={34} height={34}
            style={{ imageRendering: "pixelated", objectFit: "contain" }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: pixel, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <GenderIcon gender={sheet.gender} size={11} />
        </div>
        {(species?.types ?? []).map(t => (
          <span key={t} style={{ fontSize: 8, fontFamily: pixel, padding: "2px 4px", border: "1px solid #181818",
            background: TYPE_COLORS[t as PokemonType] ?? "#787878" }}>{t}</span>
        ))}
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {care.inconsolable ? (
          <div style={{ background: "#FCE1E8", border: "2px solid #D82808", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8A0000", marginBottom: 4 }}>💔 Inconsolable</div>
            <p style={{ fontSize: 11, color: "#6E1330", margin: 0, lineHeight: 1.5 }}>
              {name} has been neglected too long — Happiness and Loyalty are at rock bottom,
              and nothing here will reach them. Take {name} into the <strong>Battle Tracker</strong> and
              actually heal them (a Potion, Full Restore, anything that raises their HP) to bring them back.
            </p>
          </div>
        ) : (
          <>
            <GaugeBar label="Hunger" value={care.gauges.hunger} color="#3d9d4a" />
            <GaugeBar label="Clean" value={care.gauges.cleanliness} color="#3d9d4a" />
            <GaugeBar label="Bond" value={care.gauges.affection} color="#3d9d4a" />
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button onClick={doFeed} style={careButtonStyle}>🍎 Feed</button>
              <button onClick={doGroom} style={careButtonStyle}>✨ Groom</button>
              <button onClick={doWalk} style={careButtonStyle}>🚶 Walk</button>
            </div>
          </>
        )}
        <div style={{ fontSize: 10, color: "#8b8b70", display: "flex", justifyContent: "space-between" }}>
          <span>Happiness {sheet.happiness}/5</span>
          <span>Loyalty {sheet.loyalty}/5</span>
        </div>
      </div>
    </div>
  );
}

const careButtonStyle: React.CSSProperties = {
  flex: 1, fontSize: 11, fontWeight: 700, padding: "7px 4px", borderRadius: 5,
  border: "2px solid #181818", background: "#F0ECD4", cursor: "pointer",
};

export default function CarePage() {
  const [trainer, setTrainer] = useState<TrainerData | null>(null);
  const [sheets, setSheets] = useState<Record<string, PokemonSheetData>>({});
  const [mounted, setMounted] = useState(false);

  // Bring every party Pokémon's care state up to date the moment this page
  // opens — this is the "welcome back" catch-up, applied silently rather
  // than as its own interstitial screen for v1 (see the roadmap doc).
  useEffect(() => {
    const trainers = loadTrainers();
    const active = getActiveTrainer(trainers);
    const loadedSheets = loadPokemonSheets();
    if (active) {
      let changed = false;
      const next = { ...loadedSheets };
      for (const key of active.pokemon) {
        const sheet = next[key];
        if (!sheet) continue;
        const wasInconsolable = sheet.care?.inconsolable ?? false;
        const ticked = Care.tick(sheet.care ?? Care.blankCare());
        next[key] = wasInconsolable
          ? { ...sheet, care: ticked }
          : ticked.inconsolable
            ? { ...sheet, care: ticked, happiness: 0, loyalty: 0 }
            : { ...sheet, care: ticked };
        changed = true;
      }
      if (changed) { saveToStorage(SHEETS_KEY, next); notifySession(); }
      setSheets(next);
    } else {
      setSheets(loadedSheets);
    }
    setTrainer(active);
    setMounted(true);
  }, []);

  // Keep ticking while the page stays open — see LIVE_RETICK_MS above.
  useEffect(() => {
    if (!trainer) return;
    const id = setInterval(() => {
      setSheets(prev => {
        let changed = false;
        const next = { ...prev };
        for (const key of trainer.pokemon) {
          const sheet = next[key];
          if (!sheet || !sheet.care) continue;
          const wasInconsolable = sheet.care.inconsolable;
          const ticked = Care.tick(sheet.care);
          if (ticked === sheet.care) continue;
          changed = true;
          next[key] = (!wasInconsolable && ticked.inconsolable)
            ? { ...sheet, care: ticked, happiness: 0, loyalty: 0 }
            : { ...sheet, care: ticked };
        }
        if (changed) { saveToStorage(SHEETS_KEY, next); notifySession(); }
        return changed ? next : prev;
      });
    }, LIVE_RETICK_MS);
    return () => clearInterval(id);
  }, [trainer]);

  const updateSheet = (key: string, updated: PokemonSheetData) => {
    setSheets(prev => {
      const next = { ...prev, [key]: updated };
      saveToStorage(SHEETS_KEY, next);
      return next;
    });
    notifySession();
  };

  const party = (trainer?.pokemon ?? []).map(key => ({ key, sheet: sheets[key] })).filter(p => !!p.sheet);

  return (
    <PokedexFrame active="care">
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, background: C.bezel }}>
        {!mounted ? (
          <div style={{ fontFamily: pixel, fontSize: 10, color: "#585858", textAlign: "center", padding: 30 }}>Loading…</div>
        ) : !trainer ? (
          <div style={{ background: "#F8F8E8", border: "3px solid #181818", boxShadow: "3px 3px 0 #787878",
            padding: 18, maxWidth: 460, margin: "20px auto", textAlign: "center" }}>
            <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>Register a trainer on the Pokédex home screen first.</p>
          </div>
        ) : party.length === 0 ? (
          <div style={{ background: "#F8F8E8", border: "3px solid #181818", boxShadow: "3px 3px 0 #787878",
            padding: 18, maxWidth: 460, margin: "20px auto", textAlign: "center" }}>
            <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>No Pokémon in your party yet — catch one first, then come back here to look after them.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", maxWidth: 900, margin: "0 auto" }}>
            {party.map(({ key, sheet }) => (
              <PokemonCareCard key={key} sheetKey={key} sheet={sheet} onChange={s => updateSheet(key, s)} />
            ))}
          </div>
        )}
      </div>
    </PokedexFrame>
  );
}
