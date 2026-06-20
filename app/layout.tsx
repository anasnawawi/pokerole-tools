import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PokeRole Tools — TTRPG Reference",
  description: "Complete reference tool for PokeRole 3.0 TTRPG — Pokédex, Moves, Abilities, Items, and DM Battle Tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
