// Colour-contrast helpers shared by the badge components.
//
// The type and rank palettes are the real Pokémon colours, so they can't be
// changed. What can change is the ink drawn on top of them, and which variant
// of a rank colour is safe to use as text on a light page.

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return 0;
  const [r, g, b] = m.map(h => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pick the label colour that actually reads best on `bg`.
 *
 * Roughly half the type colours (Normal, Grass, Electric, Ice, Ground, Fairy…)
 * are light enough that white sits near 2:1 against them. Comparing both inks
 * beats a fixed luminance threshold — Normal (#A8A878) lands right on the fence
 * at 0.38 luminance but is far more legible dark (7.6:1) than white (2.3:1).
 */
export function readableInk(bg: string): "#181818" | "#FFFFFF" {
  return contrast("#181818", bg) > contrast("#FFFFFF", bg) ? "#181818" : "#FFFFFF";
}

/**
 * Darken a decorative colour just enough to be legible as text on a light page,
 * preserving its hue. Used for palette colours that come from data (habitats)
 * and so can't be hand-corrected one by one.
 */
export function inkOn(hex: string, bg = "#F8F8F0", target = 4.5): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return "#202020";
  let [r, g, b] = m.map(h => parseInt(h, 16));
  const hexOf = () => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  // Step the colour toward black until it clears the target ratio.
  for (let i = 0; i < 24 && contrast(hexOf(), bg) < target; i++) {
    r *= 0.88; g *= 0.88; b *= 0.88;
  }
  return hexOf();
}

/**
 * Rank colours, darkened for use as *text* on the light page background.
 *
 * The originals are pastels chosen against a near-black background; on cream
 * they fall to 1.4–2.5:1. These keep each rank's hue while clearing 4.5:1.
 * Still safe as low-alpha tint fills (`+"20"`), which only get lighter.
 */
export const RANK_INK: Record<string, string> = {
  Starter:  "#2F6B1E",
  Rookie:   "#2A54B8",
  Standard: "#7A6100",
  Advanced: "#99450A",
  Expert:   "#7A2E7A",
  Ace:      "#B02525",
  Master:   "#4C3B6B",
  Champion: "#7D6800",
};
