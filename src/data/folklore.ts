import type { Dataset, EntitiesFile, EraId, Item, Region, RegionView } from './types';

/**
 * entities.json is loaded exactly once and then treated as immutable truth.
 * Nothing in the app mutates it, patches it, or supplies fallback content for
 * it.
 */

let pending: Promise<Dataset> | null = null;

export function loadDataset(): Promise<Dataset> {
  if (!pending) {
    pending = fetch('/entities.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load entities.json (HTTP ${res.status})`);
        return res.json() as Promise<EntitiesFile>;
      })
      .then(normalise)
      .catch((err: unknown) => {
        pending = null; // let a later attempt retry rather than caching the failure
        throw err;
      });
  }
  return pending;
}

/** Exported so the region sweep can normalise exactly as the app does, rather
 *  than re-implementing it and testing something subtly different. */
export function normalise(file: EntitiesFile): Dataset {
  const regions: Record<string, Region> = {};
  for (const [code, region] of Object.entries(file.regions)) {
    const eras = {} as Region['eras'];
    for (const [eraId, slice] of Object.entries(region.eras) as Array<
      [EraId, { density: number; entries: string[] }]
    >) {
      eras[eraId] = { density: slice.density, items: slice.entries };
    }
    regions[code] = { name: region.name, centroid: region.centroid, eras };
  }

  const items: Record<string, Item> = {};
  for (const [key, entry] of Object.entries(file.entries)) {
    items[key] = {
      key,
      title: entry.label,
      kind: entry.type,
      wiki: entry.wiki,
      seed: entry.seed,
      sensitive: entry.sensitive === true,
      needsStory: entry.needs_story === true,
    };
  }

  return { eras: file.eras, regions, items };
}

/* ------------------------------------------------------------------------- */

/** Resolve item keys to full items, preserving the order given in the data. A
 *  key with no matching item would be a data defect, so it is dropped rather
 *  than rendered as a blank row. */
function resolveItems(dataset: Dataset, keys: string[]): Item[] {
  const out: Item[] = [];
  for (const key of keys) {
    const item = dataset.items[key];
    if (item) out.push(item);
  }
  return out;
}

/** Everything the UI needs about one region in one era, or null if the region
 *  code is not in the data at all. */
export function buildRegionView(
  dataset: Dataset,
  code: string,
  eraId: EraId,
): RegionView | null {
  const region = dataset.regions[code];
  if (!region) return null;

  const slice = region.eras[eraId];
  const era = dataset.eras.find((e) => e.id === eraId);
  if (!slice || !era) return null;

  const items = resolveItems(dataset, slice.items);
  if (items.length === 0) return null;

  return {
    code,
    name: region.name,
    centroid: region.centroid,
    era,
    density: slice.density,
    items,
  };
}

/** Whether a region has anything to open in this era. Drives which shapes are
 *  clickable, so a click can never come back empty. */
export function hasContent(dataset: Dataset, code: string | null, eraId: EraId): boolean {
  if (!code) return false;
  const slice = dataset.regions[code]?.eras[eraId];
  return !!slice && slice.items.length > 0;
}

/** Density for a region in an era, or null when the region has nothing there.
 *  Used by the map to colour shapes without building a full view. */
export function densityFor(
  dataset: Dataset,
  code: string | null,
  eraId: EraId,
): number | null {
  if (!code) return null;
  const slice = dataset.regions[code]?.eras[eraId];
  if (!slice || slice.items.length === 0) return null;
  return slice.density;
}
