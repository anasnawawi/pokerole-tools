"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C } from "./PokedexFrame";
import { PokemonSheetData } from "../lib/trainer";
import { BattleLite, Session, partyOf, useSession } from "../lib/session";

/* Species name and base HP for the party display. The Pokémon dataset is
   ~2MB, so it's imported lazily and only once a party actually exists —
   every page carries this bar, and none of them should pay for the whole dex
   just to label six sprites. Cached at module scope so navigating between
   tools doesn't re-import it. */
type Dex = Map<number, { name: string; baseHp: number }>;
let dexCache: Dex | null = null;
let dexPending: Promise<Dex> | null = null;

function loadDex(): Promise<Dex> {
  if (dexCache) return Promise.resolve(dexCache);
  dexPending ??= import("../data/pokerole-data").then(m => {
    const map: Dex = new Map();
    for (const p of m.POKEMON) if (!map.has(p.number)) map.set(p.number, { name: p.name, baseHp: p.baseHp });
    dexCache = map;
    return map;
  });
  return dexPending;
}

const RANK_TINT: Record<string, string> = {
  Starter:"#78C850", Rookie:"#6890F0", Standard:"#F8D030", Advanced:"#F08030",
  Expert:"#A040A0", Ace:"#E04040", Master:"#705898", Champion:"#FFD700",
};

const PIXEL = "'Press Start 2P',monospace";

/* What the party display knows about one Pokémon. If the sheet is on the
   battle tracker, its live HP is the truthful "currently"; otherwise the
   sheet only knows the mon's maximum. The formulas are the battle tracker's
   own, so the two screens can't disagree. */
function vitals(sheetKey: string, sheet: PokemonSheetData, dex: Dex | null, battle: BattleLite[]) {
  const species = dex?.get(sheet.number);
  const vit = sheet.attributes.vitality + sheet.trainingAttributes.vitality;
  const ins = sheet.attributes.insight + sheet.trainingAttributes.insight;
  const live = battle.find(b => b.linkedPokemonSheetKey === sheetKey);
  const maxHp = live?.maxHp ?? (species ? species.baseHp + vit : 0);
  const curHp = live?.currentHp ?? maxHp;
  const maxWill = live?.maxWill ?? ins + 3;
  const curWill = live?.currentWill ?? maxWill;
  return {
    species, maxHp, curHp, maxWill, curWill,
    known: !!species || !!live,
    statuses: (live?.statuses ?? []).filter(s => s && s !== "Healthy"),
    name: sheet.nickname.trim() || species?.name || `#${sheet.number}`,
  };
}

/**
 * The active party.
 *
 * `compact` is the thin strip every tool page carries under its chrome: six
 * equal tiles side by side, sized to stay legible at ~100px tall.
 *
 * Full size — the landing device's lower screen, which has a whole half of
 * the window to itself — instead reproduces the FRLG "Choose a Pokémon"
 * party list: one plate per Pokémon (sprite, name, rank, HP bar), stacked
 * top to bottom, using the same `.frw` plate token the rest of the app's
 * FireRed chrome already draws battle dialogue boxes from.
 */
export default function PartyBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const session = useSession();
  const party = partyOf(session);
  const [dex, setDex] = useState<Dex | null>(dexCache);

  useEffect(() => {
    if (dex || party.length === 0) return;
    let live = true;
    loadDex().then(d => { if (live) setDex(d); });
    return () => { live = false; };
  }, [dex, party.length]);

  const registered = !!session?.trainer;
  const onOpen = () => router.push("/characters");

  if (!compact) {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:0,width:"100%"}}>
        {Array.from({length:6},(_,i)=>{
          const member = party[i];
          if (!member) return <EmptyRow key={i} dim={!registered}/>;
          return (
            <Row key={member.key} sheetKey={member.key} sheet={member.sheet}
              dex={dex} battle={session?.battle ?? []} onClick={onOpen}/>
          );
        })}
        <PartyNote compact={false} registered={registered} count={party.length} session={session}
          onClick={()=>router.push(registered ? "/characters" : "/")}/>
      </div>
    );
  }

  const sprite = 34;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:0}}>
      {/* Six equal columns whether or not they're filled, so the party reads
          as a party — empty slots are part of the information. */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4,minWidth:0}}>
        {Array.from({length:6},(_,i)=>{
          const member = party[i];
          if (!member) return <EmptySlot key={i} compact sprite={sprite} dim={!registered}/>;
          return (
            <Slot key={member.key} sheetKey={member.key} sheet={member.sheet}
              dex={dex} battle={session?.battle ?? []} compact sprite={sprite}
              onClick={onOpen}/>
          );
        })}
      </div>

      {/* One line of context, rather than a caption per slot */}
      <PartyNote compact registered={registered} count={party.length} session={session}
        onClick={()=>router.push(registered ? "/characters" : "/")}/>
    </div>
  );
}

function PartyNote({ compact, registered, count, session, onClick }: {
  compact: boolean; registered: boolean; count: number;
  session: Session | null; onClick: () => void;
}) {
  const text = session === null ? "Reading save…"
    : !registered ? "No trainer registered — set one up on the Pokédex home screen."
    : count === 0 ? "No Pokémon in your party yet — add one on the Characters page."
    : null;
  if (!text) return null;
  return (
    <button onClick={onClick}
      style={{alignSelf:"flex-start",background:"none",border:"none",padding:0,
        cursor:"pointer",textAlign:"left",
        fontSize:compact?10:11,color:compact?"#FFFFFF":"#5A6280",
        textDecoration:"underline",textUnderlineOffset:2}}>
      {text}
    </button>
  );
}

function EmptySlot({ compact, sprite, dim }: { compact: boolean; sprite: number; dim: boolean }) {
  return (
    <div aria-hidden style={{display:"flex",flexDirection:"column",alignItems:"center",
      gap:compact?3:4,padding:compact?"5px 3px":"7px 5px",borderRadius:5,minWidth:0,
      border:`2px dashed ${compact?"rgba(255,255,255,0.35)":"rgba(24,32,60,0.28)"}`,
      opacity:dim?0.45:0.75}}>
      <span style={{width:sprite,height:sprite,borderRadius:"50%",
        border:`2px dashed ${compact?"rgba(255,255,255,0.4)":"rgba(24,32,60,0.3)"}`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:compact?13:17,opacity:0.6}}>◦</span>
      <span style={{fontFamily:PIXEL,fontSize:compact?6:7,
        color:compact?"rgba(255,255,255,0.65)":"rgba(24,32,60,0.5)"}}>—</span>
    </div>
  );
}

function Slot({ sheetKey, sheet, dex, battle, compact, sprite, onClick }: {
  sheetKey: string; sheet: PokemonSheetData; dex: Dex | null; battle: BattleLite[];
  compact: boolean; sprite: number; onClick: () => void;
}) {
  const v = vitals(sheetKey, sheet, dex, battle);
  const pct = v.maxHp > 0 ? Math.max(0, Math.min(1, v.curHp / v.maxHp)) : 1;
  // FireRed's HP bar: green, amber under half, red under a quarter.
  const hpColor = pct > 0.5 ? "#48C048" : pct > 0.25 ? "#F0B028" : "#E04038";
  const fainted = v.known && v.curHp <= 0;
  const tint = RANK_TINT[sheet.rank] ?? C.cyan;

  return (
    <button onClick={onClick} title={`${v.name} — ${sheet.rank}${v.known?` — ${v.curHp}/${v.maxHp} HP`:""}`}
      aria-label={`${v.name}, ${sheet.rank}${v.known?`, ${v.curHp} of ${v.maxHp} HP`:""}${
        fainted?", fainted":v.statuses.length?`, ${v.statuses.join(", ")}`:""}`}
      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:compact?2:3,
        minWidth:0,padding:compact?"4px 2px":"6px 4px",borderRadius:5,cursor:"pointer",
        touchAction:"manipulation",
        /* Fainted greys the tile rather than fading it — at reduced opacity
           the crimson shell showed through and the slot read pink. */
        background:fainted?"#D6D8DE":"#FFFFFF",
        border:`2px solid ${C.outline}`,
        borderTop:`4px solid ${fainted?"#8A90A4":tint}`}}>

      <span style={{width:sprite,height:sprite,flexShrink:0,borderRadius:"50%",
        background:"rgba(111,220,240,0.28)",border:"2px solid rgba(24,32,60,0.22)",
        display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local pixel
            art at a fixed tiny size; next/image would resample and blur it. */}
        <img src={`/sprites/pokemon/${sheet.number}.png`} alt="" width={sprite-6} height={sprite-6}
          draggable={false}
          style={{imageRendering:"pixelated",objectFit:"contain",
            filter:fainted?"grayscale(1)":undefined}}
          onError={e=>{(e.currentTarget as HTMLImageElement).style.visibility="hidden";}}/>
      </span>

      {/* Status sits directly under its own sprite, so it reads as belonging
          to this Pokémon instead of stretching across the whole bar. Only the
          first is shown — the rest are in the tooltip and the label. */}
      <span style={{height:compact?9:11,display:"flex",alignItems:"center",justifyContent:"center",
        maxWidth:"100%",overflow:"hidden"}}>
        {fainted
          ? <Chip label="FNT" bg="#8A1010" compact={compact}/>
          : v.statuses.length
            ? <Chip label={short(v.statuses[0])} bg="#C05010" compact={compact}
                more={v.statuses.length>1?v.statuses.length-1:0}/>
            : sheet.isPartner
              ? <span title="Partner Pokémon" style={{fontSize:compact?8:10,lineHeight:1}}>⭐</span>
              : null}
      </span>

      <span style={{width:"100%",minWidth:0,fontFamily:PIXEL,fontSize:compact?6:7,
        color:C.navy,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",
        whiteSpace:"nowrap"}}>{v.name}</span>

      <span style={{width:"100%",height:compact?5:6,borderRadius:3,overflow:"hidden",
        background:"#20304A",border:"1px solid rgba(24,32,60,0.6)"}}>
        <span style={{display:"block",height:"100%",width:`${pct*100}%`,background:hpColor,
          transition:"width 240ms"}}/>
      </span>

      <span style={{fontSize:compact?8:9,fontWeight:700,color:"#2B3350",
        fontVariantNumeric:"tabular-nums",lineHeight:1.2}}>
        {v.known ? `${v.curHp}/${v.maxHp}` : "—"}
      </span>
    </button>
  );
}

function EmptyRow({ dim }: { dim: boolean }) {
  return (
    <div aria-hidden style={{display:"flex",alignItems:"center",gap:12,
      padding:"10px 14px",borderRadius:7,minHeight:60,
      border:"2px dashed rgba(24,32,60,0.28)",opacity:dim?0.4:0.65}}>
      <span style={{width:40,height:40,flexShrink:0,borderRadius:"50%",
        border:"2px dashed rgba(24,32,60,0.3)",display:"flex",alignItems:"center",
        justifyContent:"center",fontSize:17,opacity:0.6,color:C.navy}}>◦</span>
      <span style={{fontFamily:PIXEL,fontSize:9,color:"rgba(24,32,60,0.5)"}}>— empty —</span>
    </div>
  );
}

/* One plate per Pokémon, styled after the FRLG party-select screen: sprite,
   name + rank (this game's stand-in for a level), an HP bar, the numbers.
   Reuses `.frw` — the same blue-plate token the battle dialogue boxes use —
   so the landing device's party list and the rest of the FireRed chrome
   read as one system rather than two different UIs bolted together. */
function Row({ sheetKey, sheet, dex, battle, onClick }: {
  sheetKey: string; sheet: PokemonSheetData; dex: Dex | null; battle: BattleLite[];
  onClick: () => void;
}) {
  const v = vitals(sheetKey, sheet, dex, battle);
  const pct = v.maxHp > 0 ? Math.max(0, Math.min(1, v.curHp / v.maxHp)) : 1;
  const hpColor = pct > 0.5 ? "#48C048" : pct > 0.25 ? "#F0B028" : "#E04038";
  const fainted = v.known && v.curHp <= 0;

  return (
    <button onClick={onClick} className="frw"
      title={`${v.name} — ${sheet.rank}${v.known?` — ${v.curHp}/${v.maxHp} HP`:""}`}
      aria-label={`${v.name}, ${sheet.rank}${v.known?`, ${v.curHp} of ${v.maxHp} HP`:""}${
        fainted?", fainted":v.statuses.length?`, ${v.statuses.join(", ")}`:""}`}
      style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",
        padding:"9px 14px",cursor:"pointer",touchAction:"manipulation",
        // Fainted greys the plate rather than fading it, same reasoning as the
        // compact tile: at reduced opacity the page behind shows through and
        // the plate stops reading as "down", just as pale.
        background:fainted?"linear-gradient(180deg, #9AA0AE 0%, #7A8090 100%)":undefined}}>

      <span style={{width:40,height:40,flexShrink:0,borderRadius:"50%",
        background:"rgba(255,255,255,0.18)",border:"2px solid rgba(255,255,255,0.55)",
        display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local pixel
            art at a fixed tiny size; next/image would resample and blur it. */}
        <img src={`/sprites/pokemon/${sheet.number}.png`} alt="" width={34} height={34}
          draggable={false}
          style={{imageRendering:"pixelated",objectFit:"contain",
            filter:fainted?"grayscale(1) brightness(1.3)":undefined}}
          onError={e=>{(e.currentTarget as HTMLImageElement).style.visibility="hidden";}}/>
      </span>

      <span style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:4}}>
        <span style={{display:"flex",alignItems:"baseline",gap:7}}>
          <span style={{fontFamily:PIXEL,fontSize:11,flex:1,minWidth:0,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.name}</span>
          {sheet.isPartner&&<span title="Partner Pokémon" style={{fontSize:11,lineHeight:1}}>⭐</span>}
          <span style={{fontFamily:PIXEL,fontSize:8,opacity:0.85,flexShrink:0}}>{sheet.rank}</span>
        </span>

        <span style={{display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontFamily:PIXEL,fontSize:7,opacity:0.85,flexShrink:0}}>HP</span>
          <span style={{flex:1,height:7,borderRadius:3,overflow:"hidden",
            background:"rgba(0,0,0,0.35)",border:"1px solid rgba(0,0,0,0.4)"}}>
            <span style={{display:"block",height:"100%",width:`${pct*100}%`,background:hpColor,
              transition:"width 240ms"}}/>
          </span>
          <span style={{fontFamily:PIXEL,fontSize:9,fontVariantNumeric:"tabular-nums",flexShrink:0}}>
            {v.known ? `${v.curHp}/${v.maxHp}` : "—"}
          </span>
        </span>

        {(fainted || v.statuses.length > 0) && (
          <span style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {fainted
              ? <Chip label="FAINTED" bg="#5A0A0A" compact={false}/>
              : v.statuses.map(s => <Chip key={s} label={s.toUpperCase()} bg="#8A3C0A" compact={false}/>)}
          </span>
        )}
      </span>
    </button>
  );
}

/* Status names are long and the slots are a sixth of the bar. Trim to a
   readable stub rather than letting one condition set every slot's width. */
function short(status: string) {
  const s = status.toUpperCase();
  return s.length > 5 ? s.slice(0, 4) + "." : s;
}

function Chip({ label, bg, compact, more = 0 }: {
  label: string; bg: string; compact: boolean; more?: number;
}) {
  return (
    <span style={{fontFamily:PIXEL,fontSize:compact?5:6,color:"#FFFFFF",background:bg,
      border:"1px solid rgba(0,0,0,0.5)",padding:compact?"1px 3px":"2px 4px",borderRadius:2,
      whiteSpace:"nowrap",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis"}}>
      {label}{more ? `+${more}` : ""}
    </span>
  );
}
