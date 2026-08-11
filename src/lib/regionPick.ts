import { unwrapRing, type Polygon, type Ring } from './globeShapes';
import { angularDistanceDeg } from './geo';

/**
 * Resolving a point on the globe to a region. Free of three.js so the region
 * sweep can exercise exactly the code the renderer uses.
 *
 * Nearest-centroid alone is not enough once outlines are drawn: the `US`
 * centroid sits in Kansas, so a click on Oklahoma resolved to "United States".
 *
 * Order: a shapeless region inside the same shape as the pointer (`US` within
 * the states, Scotland within the UK), then the shape containing the point,
 * then the nearest centroid for clicks in open water.
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
   * The drawn region whose shape contains this one's centroid, if any. This is
   * what separates a sub-national region from a small neighbour: Scotland's
   * centroid falls inside the UK, so it may claim UK clicks; Guadeloupe's falls
   * on no shape, so it may not claim clicks on Montserrat.
   */
  container: string | null;
}

export interface PickIndex {
  polygons: PickPolygon[];
  shapeless: ShapelessRegion[];
}

/** How close a pointer must come to a shapeless region's centroid to claim it.
 *  Small on purpose, so it cannot swallow the shape underneath. */
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
    // Antarctica is drawn and has an ISO code but no folklore entry. Indexing
    // it would let a click land on a region the panel cannot open.
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

  // 1. A shapeless region inside whatever the pointer is over, which keeps
  //    `US`, Scotland and Siberia reachable.
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

  // 3. Open water: the nearest centroid, so a click off a coast still opens
  //    its country and undrawn islands stay reachable.
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

    // The ring's longitudes may be unwrapped past ±180, so the point is tested
    // in each equivalent position.
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
  // Inside the outer ring but inside a hole means outside the shape.
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
