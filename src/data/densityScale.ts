/**
 * The heatmap ramp: sparse regions read cool, dense ones burn red. Density is
 * an integer 1..5 straight from the data file.
 *
 * Not a plain hue rotation — saturation and lightness climb with the hue, so a
 * 5 reads as hot against a 1 receding. The globe reuses these same colours.
 */

export interface DensityStop {
  /** Fill for the 2D map. */
  fill: string;
  /** Same colour as linear RGB in 0..1, for the three.js shaders. */
  rgb: readonly [number, number, number];
  label: string;
}

const STOPS: Record<number, DensityStop> = {
  1: { fill: '#2b4a63', rgb: [0.169, 0.29, 0.388], label: 'Sparse' },
  2: { fill: '#2f7a86', rgb: [0.184, 0.478, 0.525], label: 'Quiet' },
  3: { fill: '#4aa96c', rgb: [0.29, 0.663, 0.424], label: 'Alive' },
  4: { fill: '#e8b73a', rgb: [0.91, 0.718, 0.227], label: 'Rich' },
  5: { fill: '#e0453a', rgb: [0.878, 0.271, 0.227], label: 'Teeming' },
};

/** Colour for a region with no data at all. Never clickable. */
export const NO_DATA_FILL = '#161b22';

/** Same colour in linear RGB, for the globe's shaders. */
export const NO_DATA_RGB: readonly [number, number, number] = [0.086, 0.106, 0.133];

/** Returns null for any density outside 1..5 rather than falling through to the
 *  sparse-but-present colour, so an unexpected value reads as "no data". */
export function densityStop(density: number): DensityStop | null {
  return STOPS[density] ?? null;
}

export function densityFill(density: number | null): string {
  if (density === null) return NO_DATA_FILL;
  return densityStop(density)?.fill ?? NO_DATA_FILL;
}

/** Colour for the globe's splotches and fills, falling back to the unlit slate
 *  rather than to density 1. */
export function densityRgb(density: number | null): readonly [number, number, number] {
  if (density === null) return NO_DATA_RGB;
  return densityStop(density)?.rgb ?? NO_DATA_RGB;
}

/** Ordered 1..5, for the legend. */
export const DENSITY_STOPS: ReadonlyArray<{ density: number; stop: DensityStop }> = (
  [1, 2, 3, 4, 5] as const
).map((density) => ({ density, stop: STOPS[density] }));
