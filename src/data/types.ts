// Shapes mirroring entities.json exactly. That file is the source of truth;
// nothing here invents, defaults, or derives data that is not already in it.

export type EraId = 'ancient' | 'medieval' | 'early_modern' | 'modern';

export interface Era {
  id: EraId;
  label: string;
  range: string;
}

/* ---------------------------------------------------------------------------
   The file as it is on disk
   ------------------------------------------------------------------------- */

/** density is authoritative for colour, entries for content. The two
 *  deliberately disagree in places (US/medieval is density 2 with 3 entries) —
 *  never derive one from the other. */
export interface EntityEraSlice {
  density: number; // 1..5
  entries: string[];
}

export interface EntityRegion {
  name: string;
  centroid: [number, number]; // [lat, lng]
  eras: Record<EraId, EntityEraSlice>;
}

export interface Entry {
  label: string;
  type: string;
  wiki: string; // Wikipedia page title, already URL-encoded
  seed: string;
  needs_story?: boolean;
  sensitive?: boolean;
}

export interface GenerationDirective {
  role: string;
  instructions: string[];
  story_summary_rule: string;
  output_format: string;
}

export interface EntitiesFile {
  eras: Era[];
  regions: Record<string, EntityRegion>;
  entries: Record<string, Entry>;
  generation_directive: GenerationDirective;
}

/* ---------------------------------------------------------------------------
   The shape the app actually renders
   ------------------------------------------------------------------------- */

/**
 * One creature, normalised.
 *
 * The globe, the heatmap, the search and the panel all read this rather than
 * the raw file, so a change to the file's field names touches one place.
 */
export interface Item {
  key: string;
  title: string;
  kind: string;
  wiki: string;
  /** The ground-truth line, always present. */
  seed: string;
  sensitive: boolean;
  /** This one needs its defining tale told, not just its name. */
  needsStory: boolean;
}

export interface RegionSlice {
  density: number;
  items: string[];
}

export interface Region {
  name: string;
  centroid: [number, number];
  eras: Record<EraId, RegionSlice>;
}

/** The loaded, normalised dataset. */
export interface Dataset {
  eras: Era[];
  regions: Record<string, Region>;
  items: Record<string, Item>;
}

/** Everything the UI needs about one region in one era. */
export interface RegionView {
  code: string;
  name: string;
  centroid: [number, number];
  era: Era;
  density: number;
  items: Item[];
}
