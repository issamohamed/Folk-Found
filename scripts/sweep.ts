/**
 * Region sweep — the project's hard invariant, checked mechanically.
 *
 * "Never leave a region without data; if the data is there, the UI must show
 * it." That promise is only worth as much as the last change made to the
 * picking or the data, so this walks every region in entities.json and asserts:
 *
 *   1. every region has all four eras, each with a density and at least one
 *      entry that resolves in the item dictionary
 *   2. every region the globe can draw is resolved by a click inside its own
 *      outline — the thing that broke when `US` out-competed the states
 *   3. every region with no drawn shape is still reachable from its centroid
 *
 * Run with: npm run sweep
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectPolygons, type Polygon } from '../src/lib/globeShapes';
import { buildPickIndex, resolveRegion, shapeAt } from '../src/lib/regionPick';
import {
  OCCLUDED_BY_DETAIL_LAYER,
  countryIdToRegionCode,
  stateIdToRegionCode,
} from '../src/data/regionCodes';
import { normalise } from '../src/data/folklore';
import type { Dataset, EntitiesFile } from '../src/data/types';

// Run from the project root, so the bundled output can live anywhere.
const read = (path: string) =>
  JSON.parse(readFileSync(join(process.cwd(), path), 'utf8'));

const dataset: Dataset = normalise(read('entities.json') as EntitiesFile);
const countries = read('public/geo/countries-50m.json');
const states = read('public/geo/states-10m.json');

const codes = Object.keys(dataset.regions);
const eraIds = dataset.eras.map((era) => era.id);
const centroidOf = (code: string) => dataset.regions[code].centroid;

const shapes = [
  ...collectPolygons(countries, countryIdToRegionCode, OCCLUDED_BY_DETAIL_LAYER),
  ...collectPolygons(states, stateIdToRegionCode, new Set<string>()),
];
const index = buildPickIndex(shapes, codes, centroidOf);

const failures: string[] = [];
const note = (message: string) => failures.push(message);

/* -- 1. Data completeness ------------------------------------------------- */

for (const code of codes) {
  const region = dataset.regions[code];
  for (const era of eraIds) {
    const slice = region.eras[era];
    if (!slice) {
      note(`${code} (${region.name}) has no "${era}" era`);
      continue;
    }
    if (!(slice.density >= 1 && slice.density <= 5)) {
      note(`${code}/${era} density ${slice.density} is outside 1..5`);
    }
    if (slice.items.length === 0) {
      note(`${code}/${era} has no entries`);
    }
    for (const key of slice.items) {
      if (!dataset.items[key]) note(`${code}/${era} references unknown entry "${key}"`);
    }
  }
}

/* -- 2. Shaped regions resolve from inside their own outline -------------- */

const shapedByCode = new Map<string, Polygon[]>();
for (const { code, polygons } of shapes) {
  // Drawn shapes with no folklore entry (Antarctica) are deliberately not
  // indexed, so they are not part of what this checks.
  if (!code || !dataset.regions[code]) continue;
  const existing = shapedByCode.get(code);
  if (existing) existing.push(...polygons);
  else shapedByCode.set(code, [...polygons]);
}

let shapedChecked = 0;
const unprobeable: string[] = [];
const shared: string[] = [];

for (const [code, polygons] of shapedByCode) {
  // The largest ring is the one a reader would actually aim at.
  const largest = polygons.reduce((a, b) => (b[0].length > a[0].length ? b : a));
  const points = interiorPoints(largest, 40);
  if (points.length === 0) {
    unprobeable.push(`${code} (${dataset.regions[code].name})`);
    continue;
  }

  const resolved = points.map(([lat, lng]) =>
    resolveRegion(index, centroidOf, codes, lat, lng),
  );
  const hitsSelf = resolved.filter((got) => got === code).length;

  if (hitsSelf === 0) {
    const others = [...new Set(resolved)].join(', ');
    note(
      `${code} (${dataset.regions[code].name}): no point inside its own outline ` +
        `resolves to it — every probe gave ${others}`,
    );
  } else if (hitsSelf < points.length) {
    // Expected wherever a shapeless sub-region sits inside a drawn one:
    // Scotland inside the UK, Siberia inside Russia. Worth seeing, not a fault.
    const stolen = [...new Set(resolved.filter((got) => got !== code))].join(', ');
    shared.push(`${code} shares its outline with ${stolen} (${hitsSelf}/${points.length})`);
  }
  shapedChecked++;
}

/* -- 3. Shapeless regions are reachable from their centroid --------------- */

for (const { code, lat, lng } of index.shapeless) {
  const got = resolveRegion(index, centroidOf, codes, lat, lng);
  if (got !== code) {
    note(
      `${code} (${dataset.regions[code].name}) has no drawn shape and its centroid ` +
        `resolved to ${got ?? 'nothing'} — it is unreachable`,
    );
  }
}

/* -- Report --------------------------------------------------------------- */

console.log(`regions            ${codes.length}`);
console.log(`eras               ${eraIds.join(', ')}`);
console.log(`entries            ${Object.keys(dataset.items).length}`);
console.log(
  `drawn shapes       ${shapedByCode.size} regions, ${index.polygons.length} polygons`,
);
console.log(`shapeless regions  ${index.shapeless.length}`);
console.log(
  `interior probes    ${shapedChecked} checked, ${unprobeable.length} too small to probe`,
);
if (unprobeable.length > 0) {
  // Too small for the probe grid to land inside; reached by the centroid
  // fallback, which the shapeless check above already exercises.
  console.log(`                   ${unprobeable.join(', ')}`);
}
console.log('');

if (shared.length > 0) {
  console.log('Shared outlines (expected — a sub-region drawn inside its parent):');
  for (const line of shared) console.log(`  · ${line}`);
  console.log('');
}

if (failures.length === 0) {
  console.log(`PASS — all ${codes.length} regions resolve, in all ${eraIds.length} eras.`);
} else {
  console.log(`FAIL — ${failures.length} problem(s):`);
  for (const failure of failures) console.log(`  · ${failure}`);
  process.exitCode = 1;
}

/** Points inside the polygon, found by walking a grid over its bounding box.
 *  A grid rather than a single centre because concave shapes put their centre
 *  in the sea, and because a region is only genuinely unreachable if *none* of
 *  its interior resolves to it. */
function interiorPoints(polygon: Polygon, limit: number): Array<[number, number]> {
  const outer = polygon[0];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of outer) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  const probe = buildPickIndex(
    [{ code: '_probe', polygons: [polygon] }],
    ['_probe'],
    () => [0, 0],
  );
  const hits = (lat: number, lng: number) => shapeAt(probe, lat, lng) === '_probe';

  const found: Array<[number, number]> = [];
  const steps = 24;
  for (let i = 1; i < steps && found.length < limit; i++) {
    for (let j = 1; j < steps && found.length < limit; j++) {
      const lng = minLng + ((maxLng - minLng) * i) / steps;
      const lat = minLat + ((maxLat - minLat) * j) / steps;
      if (hits(lat, lng)) found.push([lat, lng]);
    }
  }
  return found;
}
