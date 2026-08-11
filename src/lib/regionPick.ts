import { unwrapRing, type Polygon, type Ring } from './globeShapes';
import { angularDistanceDeg } from './geo';

/**
 * Resolving a point on the globe to a region.
 *
 * Deliberately free of three.js so the region sweep can exercise exactly the
 * code the renderer uses, rather than a re-implementation of it.
 *
 * Nearest-centroid alone stops being good enough the moment outlines are drawn.
 * folklore.json holds country-level data for `US` alongside all fifty states,
 * and the `US` centroid sits in Kansas — so a click on Oklahoma, whose outline
 * the reader can now plainly see, resolved to "United States". Testing the point
 * against the shape it is actually inside removes that whole class of surprise.
 *
 * Order of resolution:
 *   1. a shapeless region sitting inside the same shape as the pointer
 *      (`US` within the states, Scotland within the UK)
 *   2. the drawn shape containing the point
 *   3. the nearest centroid, for clicks that land in open water
 */

export interface PickPolygon {
  code: string;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
  /** Rings with longitudes unwrapped — see unwrapRing. */
  rings: Ring[];
}

export interface ShapelessRegion {
  code: string;
  lat: number;
  lng: number;
  /**
   * The drawn region whose shape contains this one's centroid, if any.
   *
   * This is what separates a sub-national region from a small neighbour.
   * Scotland's centroid falls inside the UK's outline, so Scotland may claim
   * clicks that land on the UK. Guadeloupe's centroid falls on no drawn shape
   * at all, so it may not claim clicks that land on Montserrat — which is a
   * different island a few dozen miles away, and has its own entry.
   */
  container: string | null;
}

export interface PickIndex {
  polygons: PickPolygon[];
  shapeless: ShapelessRegion[];
}

/** How close a pointer must come to a shapeless region's centroid to claim it.
 *  Small on purpose: this is the globe's equivalent of the flat map's centroid
 *  marker dot, so it must not swallow the shape underneath it. */
export const CENTROID_CLAIM_DEGREES = 2.2;

/** How far a click may land from a centroid and still count as that region. */
export const MAX_PICK_DEGREES = 18;

export function buildPickIndex(
  shapes: Array<{ code: string | null; polygons: Polygon[] }>,
  allCodes: readonly string[],
  centroidOf: (code: string) => readonly [number, number],
): PickIndex {
  const polygons: PickPolygon[] = [];
  const shaped = new Set<string>();
  const known = new Set(allCodes);

  for (const { code, polygons: shapePolygons } of shapes) {
    // Antarctica is drawn, and resolves to a tidy ISO code, but folklore.json
    // holds no entry for it. Indexing it would let a click land on a region the
    // panel cannot open; leaving it out means such a click falls through to the
    // nearest-centroid rule, exactly as it did before shapes existed.
    if (!code || !known.has(code)) continue;
    shaped.add(code);

    for (const polygon of shapePolygons) {
      if (!polygon[0] || polygon[0].length < 4) continue;

      const rings = polygon.map(unwrapRing);
      const outer = rings[0];

      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const [lng, lat] of outer) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      polygons.push({ code, minLng, maxLng, minLat, maxLat, rings });
    }
  }

  const index: PickIndex = { polygons, shapeless: [] };

  index.shapeless = allCodes
    .filter((code) => !shaped.has(code))
    .map((code) => {
      const [lat, lng] = centroidOf(code);
      return { code, lat, lng, container: shapeAt(index, lat, lng) };
    });

  return index;
}

export function resolveRegion(
  index: PickIndex,
  centroidOf: (code: string) => readonly [number, number],
  allCodes: readonly string[],
  lat: number,
  lng: number,
): string | null {
  const here = shapeAt(index, lat, lng);

  // 1. A shapeless region that lives inside whatever the pointer is over. This
  //    keeps `US`, Scotland and Siberia reachable even though they lie wholly
  //    within a shape that would otherwise claim every click on them.
  let claimed: string | null = null;
  let claimedDist = CENTROID_CLAIM_DEGREES;
  for (const region of index.shapeless) {
    if (region.container !== here) continue;
    const dist = angularDistanceDeg(lat, lng, region.lat, region.lng);
    if (dist < claimedDist) {
      claimedDist = dist;
      claimed = region.code;
    }
  }
  if (claimed) return claimed;

  // 2. The shape the point is actually inside.
  if (here) return here;

  // 3. Open water: the nearest centroid, so a click just off a coast still
  //    opens the country it belongs to, and an island too small to be drawn at
  //    this resolution is still reachable.
  let best: string | null = null;
  let bestDist = Infinity;
  for (const code of allCodes) {
    const [cLat, cLng] = centroidOf(code);
    const dist = angularDistanceDeg(lat, lng, cLat, cLng);
    if (dist < bestDist) {
      bestDist = dist;
      best = code;
    }
  }
  return best && bestDist <= MAX_PICK_DEGREES ? best : null;
}

/** The drawn region containing a point, or null if the point is over water or
 *  over a region no atlas draws. */
export function shapeAt(index: PickIndex, lat: number, lng: number): string | null {
  for (const entry of index.polygons) {
    if (lat < entry.minLat || lat > entry.maxLat) continue;

    // The ring's longitudes may have been unwrapped past ±180, so the point is
    // offered in each equivalent position and tested in whichever one the
    // ring's own range covers.
    const candidate =
      lng >= entry.minLng && lng <= entry.maxLng
        ? lng
        : lng + 360 >= entry.minLng && lng + 360 <= entry.maxLng
          ? lng + 360
          : lng - 360 >= entry.minLng && lng - 360 <= entry.maxLng
            ? lng - 360
            : null;
    if (candidate === null) continue;

    if (pointInPolygon(candidate, lat, entry.rings)) return entry.code;
  }
  return null;
}

function pointInPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (!pointInRing(lng, lat, rings[0])) return false;
  // Inside the outer ring but inside a hole means outside the shape — the
  // Caspian within Kazakhstan, Lesotho within South Africa.
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false;
  }
  return true;
}

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
