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

/* ── Pixel-grid primitives ─────────────────────────────────────────────────
   The party card's frame used to be a CSS gradient + border-radius, which
   reads as a modern rounded card no matter how the colors are tuned — real
   GBA UI panels are built from a handful of solid-color pixel rows stacked
   into a stepped (chamfered) corner, never a smooth curve or a blend. These
   render that directly as SVG rects on a small integer-unit grid, with
   shapeRendering="crispEdges" so the edges stay hard at any display size —
   sturdier than a raster image + `image-rendering:pixelated`, which only
   stays crisp at exact integer scale factors and this bar's width is
   whatever the panel's flex layout gives it. */

/** A rectangle whose corners step inward by `corner[i]` units per row, top and
 * bottom mirrored — the classic GBA window chamfer instead of a rounded
 * corner. `corner:[2,1]` staircases two pixels, `[]` is a plain rectangle. */
function steppedBands(x: number, y: number, w: number, h: number, corner: number[]) {
  const n = corner.length;
  const bands: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < n; i++) bands.push({ x: x + corner[i], y: y + i, width: w - corner[i] * 2, height: 1 });
  bands.push({ x, y: y + n, width: w, height: Math.max(0, h - n * 2) });
  for (let i = 0; i < n; i++) bands.push({ x: x + corner[n - 1 - i], y: y + h - n + i, width: w - corner[n - 1 - i] * 2, height: 1 });
  return bands;
}

function PixelRect({ x, y, w, h, corner, fill }: { x: number; y: number; w: number; h: number; corner: number[]; fill: string }) {
  return <>{steppedBands(x, y, w, h, corner).map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} fill={fill} shapeRendering="crispEdges"/>)}</>;
}

/* The card's frame only — sprite, name and HP bar are ordinary DOM content
   layered on top, so they stay real text (selectable, screen-reader visible)
   rather than baked into the bitmap. Three nested stepped bands: dark outer
   edge, a structural color band, the flat main fill, then a one-pixel
   highlight stripe along the top-left the way GBA panels catch a light
   source. (An earlier pass textured the fill with scanlines; that read as
   visual noise once real content sat on top, so the fill is flat.) */
function PixelCardFrame({ w, h, palette }: { w: number; h: number; palette: { edge: string; band: string; fill: string; highlight: string } }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden
      style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}>
      <PixelRect x={0} y={0} w={w} h={h} corner={[2,1]} fill={palette.edge}/>
      <PixelRect x={1} y={1} w={w-2} h={h-2} corner={[1,1]} fill={palette.band}/>
      <PixelRect x={2} y={2} w={w-4} h={h-4} corner={[1]} fill={palette.fill}/>
      <rect x={3} y={3} width={w-6} height={1} fill={palette.highlight} shapeRendering="crispEdges"/>
      <rect x={3} y={3} width={1} height={h-6} fill={palette.highlight} shapeRendering="crispEdges"/>
    </svg>
  );
}

/* HP bar: dark outline / pale inner rim / dark empty track / colored fill —
   four flat layers, no rounded modern progress-bar treatment, fill width
   computed straight from the live percentage. Colors and layer order are the
   reference spec's exact HP-bar construction, not the card frame's palette —
   the bar is its own nested component, not a tint of the card it sits on. */
function PixelHPBar({ pct, color }: { pct: number; color: string }) {
  const W = 110, H = 10;
  const trackX = 2, trackY = 2, trackW = W - 4, trackH = H - 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden
      style={{width:"100%",height:11,display:"block",flexShrink:1,minWidth:0}}>
      <PixelRect x={0} y={0} w={W} h={H} corner={[1]} fill="#45475F"/>
      <PixelRect x={1} y={1} w={W-2} h={H-2} corner={[1]} fill="#C8D0C5"/>
      <rect x={trackX} y={trackY} width={trackW} height={trackH} fill="#62656D" shapeRendering="crispEdges"/>
      <rect x={trackX} y={trackY} width={trackW*Math.max(0,Math.min(1,pct))} height={trackH} fill={color} shapeRendering="crispEdges"/>
    </svg>
  );
}

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
 * Full size — the landing device in landscape, where the party owns a whole
 * half of the window — instead reproduces the FRLG "Choose a Pokémon" party
 * list: one plate per Pokémon (sprite, name, rank, HP bar), stacked top to
 * bottom, using the same `.frw` plate token the rest of the app's FireRed
 * chrome already draws battle dialogue boxes from.
 *
 * `onPanel` is the surface, which is a separate question from the density:
 * the compact strip rides the crimson shell inside PokedexFrame but a pale
 * bezel panel on the landing device, and the empty slots have to ink
 * themselves for whichever one they're actually sitting on.
 */
export default function PartyBar({ compact = false, onPanel = false }: {
  compact?: boolean; onPanel?: boolean;
}) {
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
        <PartyNote compact={false} onPanel registered={registered} count={party.length} session={session}
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
          if (!member) return <EmptySlot key={i} compact sprite={sprite} dim={!registered} onPanel={onPanel}/>;
          return (
            <Slot key={member.key} sheetKey={member.key} sheet={member.sheet}
              dex={dex} battle={session?.battle ?? []} compact sprite={sprite}
              onClick={onOpen}/>
          );
        })}
      </div>

      {/* One line of context, rather than a caption per slot */}
      <PartyNote compact onPanel={onPanel} registered={registered} count={party.length} session={session}
        onClick={()=>router.push(registered ? "/characters" : "/")}/>
    </div>
  );
}

function PartyNote({ compact, onPanel, registered, count, session, onClick }: {
  compact: boolean; onPanel: boolean; registered: boolean; count: number;
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
        fontSize:compact?10:11,color:onPanel?"#5A6280":"#FFFFFF",
        textDecoration:"underline",textUnderlineOffset:2}}>
      {text}
    </button>
  );
}

function EmptySlot({ compact, sprite, dim, onPanel }: {
  compact: boolean; sprite: number; dim: boolean; onPanel: boolean;
}) {
  /* Ink follows the surface, not the density — a dashed white outline is
     invisible on the landing's pale bezel, and a navy one vanishes on the
     crimson shell. */
  const line   = onPanel ? "rgba(24,32,60,0.28)" : "rgba(255,255,255,0.35)";
  const ring   = onPanel ? "rgba(24,32,60,0.30)" : "rgba(255,255,255,0.40)";
  const ink    = onPanel ? "rgba(24,32,60,0.50)" : "rgba(255,255,255,0.65)";
  return (
    <div aria-hidden style={{display:"flex",flexDirection:"column",alignItems:"center",
      gap:compact?3:4,padding:compact?"5px 3px":"7px 5px",borderRadius:5,minWidth:0,
      border:`2px dashed ${line}`,opacity:dim?0.45:0.75}}>
      <span style={{width:sprite,height:sprite,borderRadius:"50%",
        border:`2px dashed ${ring}`,color:ink,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:compact?13:17,opacity:0.6}}>◦</span>
      <span style={{fontFamily:PIXEL,fontSize:compact?6:7,color:ink}}>—</span>
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

/* Card palette, straight from the reference spec — blue/cyan family for a
   healthy plate, the orange/cream family for a fainted one (the spec didn't
   give fainted colors explicitly; these are its own "orange" palette group,
   so the down state stays inside the same system rather than introducing an
   unlisted color). */
const CARD_PALETTE = {
  // fill/stripe are the exact hex the reference screenshot was sampled at;
  // edge/band/highlight are the reference spec's outer-frame layer stack.
  healthy:  { edge:"#404861", band:"#40728A", fill:"#3993DF", highlight:"#83C6DE", stripe:"#84C6DE" },
  fainted:  { edge:"#404861", band:"#C16921", fill:"#DCAE56", highlight:"#E3E1BC", stripe:"#E3E1BC" },
};

/* One plate per Pokémon, built as a pixel-grid panel rather than a CSS
   gradient card — see PixelCardFrame above for why. Sprite, name and the HP
   bar are real DOM content laid over that frame, positioned to match the
   FRLG "Choose a Pokémon" screen: sprite floating free on the left, name top,
   rank/HP bar stacked below it. */
function Row({ sheetKey, sheet, dex, battle, onClick }: {
  sheetKey: string; sheet: PokemonSheetData; dex: Dex | null; battle: BattleLite[];
  onClick: () => void;
}) {
  const v = vitals(sheetKey, sheet, dex, battle);
  const pct = v.maxHp > 0 ? Math.max(0, Math.min(1, v.curHp / v.maxHp)) : 1;
  // The spec's exact HP tri-color, not the app's usual green/amber/red.
  const hpColor = pct > 0.5 ? "#62D34A" : pct > 0.25 ? "#F0C52D" : "#E97830";
  const wpPct = v.maxWill > 0 ? Math.max(0, Math.min(1, v.curWill / v.maxWill)) : 1;
  const fainted = v.known && v.curHp <= 0;
  const palette = fainted ? CARD_PALETTE.fainted : CARD_PALETTE.healthy;

  return (
    <button onClick={onClick}
      title={`${v.name} — ${sheet.rank}${v.known?` — ${v.curHp}/${v.maxHp} HP, ${v.curWill}/${v.maxWill} WP`:""}`}
      aria-label={`${v.name}, ${sheet.rank}${v.known?`, ${v.curHp} of ${v.maxHp} HP, ${v.curWill} of ${v.maxWill} WP`:""}${
        fainted?", fainted":v.statuses.length?`, ${v.statuses.join(", ")}`:""}`}
      style={{position:"relative",display:"flex",alignItems:"stretch",width:"100%",height:76,
        textAlign:"left",padding:"0 10px 0 6px",cursor:"pointer",touchAction:"manipulation",
        border:"none",borderRadius:0,color:"#FFFFFF",textShadow:"2px 2px 0 #59647A"}}>

      <PixelCardFrame w={380} h={76} palette={palette}/>

      {/* Sprite zone — the sprite floats directly on the plate rather than
          sitting in its own bordered sub-card; it's allowed to overlap the
          frame's edge slightly, the way the reference does. */}
      <span style={{position:"relative",flex:"0 0 17%",display:"flex",
        alignItems:"center",justifyContent:"center",minWidth:0}}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local pixel
            art at a fixed tiny size; next/image would resample and blur it. */}
        <img src={`/sprites/pokemon/${sheet.number}.png`} alt="" width={56} height={56}
          draggable={false} style={{imageRendering:"pixelated",objectFit:"contain",
            filter:fainted?"grayscale(1) brightness(1.15)":undefined}}
          onError={e=>{(e.currentTarget as HTMLImageElement).style.visibility="hidden";}}/>
      </span>

      {/* Identity zone — name over a thin separator over the rank/status
          row. The separator belongs to this zone only, not the full card
          width, matching the reference's frame-as-divider rather than a
          conventional full-bleed border-bottom. */}
      <span style={{position:"relative",flex:"0 0 36%",minWidth:0,display:"flex",
        flexDirection:"column",justifyContent:"center",gap:5,padding:"0 6px 0 2px"}}>
        <span style={{fontFamily:PIXEL,fontSize:10,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.name}</span>
        <span style={{height:2,background:palette.stripe,opacity:0.85}}/>
        <span style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
          <span style={{fontFamily:PIXEL,fontSize:8,color:"#E3E1BC",flexShrink:0}}>{sheet.rank}</span>
          {sheet.isPartner&&<span title="Partner Pokémon" style={{fontSize:9,lineHeight:1}}>⭐</span>}
          {fainted
            ? <Chip label="FNT" bg="#8A1010" compact/>
            : v.statuses.length > 0 &&
              <Chip label={v.statuses[0].toUpperCase()} bg="#8A3C0A" compact
                more={v.statuses.length>1?v.statuses.length-1:0}/>}
        </span>
      </span>

      {/* HP/WP zone — one stat per line, label + bar + numbers all inline,
          matching how the battle tracker's own nameplate stacks the two
          bars (see SceneNameplate in battle-tracker/page.tsx). Each bar is
          its own nested component (see PixelHPBar), not a tint of the card
          frame. */}
      <span style={{position:"relative",flex:"1 1 auto",minWidth:0,display:"flex",
        flexDirection:"column",justifyContent:"center",gap:4,padding:"0 2px"}}>
        <span style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
          <span style={{fontFamily:PIXEL,fontSize:9,color:"#FFE04A",flexShrink:0,width:16}}>HP</span>
          <PixelHPBar pct={pct} color={hpColor}/>
          <span style={{fontFamily:PIXEL,fontSize:9,fontWeight:700,flexShrink:0,
            fontVariantNumeric:"tabular-nums",minWidth:38,textAlign:"right"}}>
            {v.known ? `${v.curHp}/${v.maxHp}` : "—"}
          </span>
        </span>
        <span style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
          <span style={{fontFamily:PIXEL,fontSize:9,color:"#9FE8FF",flexShrink:0,width:16}}>WP</span>
          <PixelHPBar pct={wpPct} color="#4878F8"/>
          <span style={{fontFamily:PIXEL,fontSize:9,fontWeight:700,flexShrink:0,
            fontVariantNumeric:"tabular-nums",minWidth:38,textAlign:"right"}}>
            {v.known ? `${v.curWill}/${v.maxWill}` : "—"}
          </span>
        </span>
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
