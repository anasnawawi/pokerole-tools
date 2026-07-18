"use client";
import { useState, useEffect, useRef } from "react";

export function rollDice(pool: number): { successes: number; rolls: number[]; total: number } {
  const rolls = Array.from({ length: Math.max(0, pool) }, () => Math.floor(Math.random() * 6) + 1);
  const successes = rolls.filter(r => r >= 4).length;
  return { successes, rolls, total: pool };
}

interface DiceResult {
  pool: number;
  rolls: number[];
  successes: number;
  label: string;
}

export function DiceRollButton({
  label,
  pool,
  onResult,
  color = "#00d4aa",
  size = "sm",
}: {
  label: string;
  pool: number;
  onResult?: (result: DiceResult) => void;
  color?: string;
  size?: "sm" | "md";
}) {
  const [last, setLast] = useState<DiceResult | null>(null);
  const [flash, setFlash] = useState(false);

  const roll = () => {
    const result = rollDice(pool);
    const r: DiceResult = { pool, ...result, label };
    setLast(r);
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
    onResult?.(r);
  };

  const pad = size === "sm" ? "3px 8px" : "5px 12px";
  const fs = size === "sm" ? 11 : 13;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        onClick={roll}
        style={{
          background: color + "20",
          border: `1px solid ${color}60`,
          borderRadius: 4,
          color,
          padding: pad,
          fontSize: fs,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "'Exo 2'",
          transition: "all 0.15s",
          outline: flash ? `2px solid ${color}` : "none",
        }}
      >
        🎲 {label} ({pool}d)
      </button>
      {last && (
        <span style={{
          fontSize: 11,
          color: last.successes > 0 ? "#00d4aa" : "#ff4757",
          fontFamily: "'Exo 2'",
          fontWeight: 700,
        }}>
          [{last.rolls.join(",")}] = <strong>{last.successes}</strong> hit{last.successes !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// Floating popup overlay
export function Popup({
  title,
  children,
  onClose,
  width = 420,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", esc); };
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div ref={ref} style={{
        background: "#1e2235", border: "1px solid #3a4060",
        borderRadius: 10, width, maxWidth: "95vw", maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderBottom: "1px solid #2a2f45",
        }}>
          <h3 style={{ fontFamily: "'Exo 2'", fontWeight: 700, fontSize: 16, color: "#e8eaf0", margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a6080", cursor: "pointer", fontSize: 18, padding: 2 }}>✕</button>
        </div>
        <div style={{ padding: 16, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

// Inline tooltip popup (appears on hover/click for ability/move names)
export function InlinePopup({
  trigger,
  children,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{ cursor: "pointer", borderBottom: "1px dashed #00d4aa", color: "#00d4aa" }}
      >
        {trigger}
      </span>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)",
          background: "#13151f", border: "1px solid #3a4060", borderRadius: 6,
          padding: "10px 12px", width: 280, zIndex: 500,
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        }}>
          {children}
        </div>
      )}
    </span>
  );
}
