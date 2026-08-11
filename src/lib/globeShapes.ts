import * as THREE from 'three';
import { feature } from 'topojson-client';
import type { Feature, GeoJsonProperties, Position } from 'geojson';
import type { Objects, Topology } from 'topojson-specification';
import { latLngToVector3 } from './geo';

/**
 * Country and US-state outlines, projected from the flat map's TopoJSON onto
 * the globe.
 *
 * The same two atlases feed both views, so a shape the reader clicks on the
 * flat map is the shape they see on the globe. Rings arrive as [lng, lat] —
 * GeoJSON's order — and are handed to latLngToVector3 in the data's [lat, lng]
 * order at the point of projection.
 *
 * Everything is merged into one geometry per layer with a per-vertex region
 * index. That keeps the whole world to two draw calls, and lets an era change
 * or a hover be a uniform update rather than a rebuild: the shaders look each
 * region's colour up in a small texture indexed by that attribute.
 */

/** A closed ring of [lng, lat] pairs. */
export type Ring = Position[];
/** Outer ring first, then any holes. */
export type Polygon = Ring[];

/** Region index written into geometry for shapes with no folklore data —
 *  Antarctica, Kosovo, Siachen Glacier. Drawn, never lit, never clickable. */
export const NO_REGION = -1;

/**
 * Longest edge, in degrees, before a segment is subdivided.
 *
 * Interpolation is linear in lng/lat rather than along a great circle, which is
 * what makes a border that follows a parallel — the US/Canada 49th, Egypt's
 * southern edge — stay on that parallel instead of bowing poleward. At two
 * degrees the sag of a chord below the sphere is under 2e-4 of the radius,
 * well inside the offset the lines are already lifted by.
 */
const MAX_STEP_DEG = 2;

/**
 * Pull every polygon out of a topology, keyed by the folklore region its id
 * resolves to. Shapes that resolve to nothing are kept under NO_REGION so the
 * continents stay whole; shapes covered by a more detailed layer are dropped so
 * their borders are not drawn twice.
 */
export function collectPolygons(
  topology: unknown,
  resolve: (id: string | number) => string | null,
  occluded: ReadonlySet<string>,
): Array<{ code: string | null; polygons: Polygon[] }> {
  const topo = topology as Topology<Objects<GeoJsonProperties>>;
  const objectKey = Object.keys(topo.objects)[0];
  const collection = feature(topo, topo.objects[objectKey]);
  const features: Array<Feature> =
    collection.type === 'FeatureCollection' ? collection.features : [collection];

  const out: Array<{ code: string | null; polygons: Polygon[] }> = [];

  for (const f of features) {
    const code = f.id === undefined || f.id === null ? null : resolve(f.id);
    if (code && occluded.has(code)) continue;

    const geom = f.geometry;
    if (geom.type === 'Polygon') {
      out.push({ code, polygons: [geom.coordinates] });
    } else if (geom.type === 'MultiPolygon') {
      out.push({ code, polygons: geom.coordinates });
    }
  }

  return out;
}

/**
 * Merged line segments for every ring, lifted to `radius`.
 *
 * Segments rather than line loops: one geometry can then hold every ring of
 * every region, and a ring that was split at the antimeridian simply drops the
 * segment that would otherwise streak all the way around the globe.
 */
export function buildBorderGeometry(
  shapes: Array<{ code: string | null; polygons: Polygon[] }>,
  regionIndex: ReadonlyMap<string, number>,
  radius: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const regions: number[] = [];

  for (const { code, polygons } of shapes) {
    const index = code ? (regionIndex.get(code) ?? NO_REGION) : NO_REGION;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        appendRingSegments(ring, radius, index, positions, regions);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute('aRegion', new THREE.BufferAttribute(new Float32Array(regions), 1));
  return geometry;
}

function appendRingSegments(
  ring: Ring,
  radius: number,
  index: number,
  positions: number[],
  regions: number[],
): void {
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];

    // A jump of more than half the world means the ring was cut at the
    // antimeridian. Joining those two points would draw a line straight across
    // the globe, so the seam segment is skipped.
    if (Math.abs(lng2 - lng1) > 180) continue;

    const span = Math.max(Math.abs(lng2 - lng1), Math.abs(lat2 - lat1));
    const steps = Math.max(1, Math.ceil(span / MAX_STEP_DEG));

    let prev = latLngToVector3(lat1, lng1, radius);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const next = latLngToVector3(
        lat1 + (lat2 - lat1) * t,
        lng1 + (lng2 - lng1) * t,
        radius,
      );
      positions.push(prev.x, prev.y, prev.z, next.x, next.y, next.z);
      regions.push(index, index);
      prev = next;
    }
  }
}

/**
 * Merged filled triangles for every region, at `radius`.
 *
 * Rings are triangulated flat in lng/lat with three's earcut, then each
 * triangle is subdivided until its edges are short enough that projecting the
 * corners onto the sphere leaves no visible chord sag, and only then projected.
 * Triangulating first and subdividing after keeps the earcut input small — the
 * alternative, densifying rings before triangulation, multiplies the hardest
 * part of the work for no gain in the interior.
 */
export function buildFillGeometry(
  shapes: Array<{ code: string | null; polygons: Polygon[] }>,
  regionIndex: ReadonlyMap<string, number>,
  radius: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const regions: number[] = [];
  const contour: THREE.Vector2[] = [];

  for (const { code, polygons } of shapes) {
    const index = code ? (regionIndex.get(code) ?? NO_REGION) : NO_REGION;

    for (const polygon of polygons) {
      if (!polygon[0] || polygon[0].length < 4) continue;

      // Longitudes are unwrapped past ±180 so a country straddling the
      // antimeridian triangulates as one connected shape rather than two halves
      // joined across the whole map. Projection is trigonometric, so a
      // longitude of 190 lands in exactly the same place as -170.
      const rings = polygon.map(unwrapRing);

      // Earcut wants open rings; GeoJSON closes them.
      contour.length = 0;
      const flat: Position[] = [];
      for (let i = 0; i < rings[0].length - 1; i++) {
        contour.push(new THREE.Vector2(rings[0][i][0], rings[0][i][1]));
        flat.push(rings[0][i]);
      }

      const holes: THREE.Vector2[][] = [];
      for (let h = 1; h < rings.length; h++) {
        const hole: THREE.Vector2[] = [];
        for (let i = 0; i < rings[h].length - 1; i++) {
          hole.push(new THREE.Vector2(rings[h][i][0], rings[h][i][1]));
          flat.push(rings[h][i]);
        }
        if (hole.length >= 3) holes.push(hole);
      }
      if (contour.length < 3) continue;

      let faces: number[][];
      try {
        faces = THREE.ShapeUtils.triangulateShape(contour, holes);
      } catch {
        // A self-intersecting ring is a defect in the atlas, not something to
        // crash the globe over. The outline still draws.
        continue;
      }

      for (const [a, b, c] of faces) {
        if (!flat[a] || !flat[b] || !flat[c]) continue;
        emitTriangle(flat[a], flat[b], flat[c], 0, radius, index, positions, regions);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute('aRegion', new THREE.BufferAttribute(new Float32Array(regions), 1));
  return geometry;
}

/** Longest edge, in degrees, a fill triangle may keep before it is split. */
const MAX_FILL_EDGE_DEG = 5;
/** Each level quarters a triangle, so this caps one source face at 256. */
const MAX_FILL_DEPTH = 4;

function emitTriangle(
  a: Position,
  b: Position,
  c: Position,
  depth: number,
  radius: number,
  index: number,
  positions: number[],
  regions: number[],
): void {
  if (
    depth < MAX_FILL_DEPTH &&
    Math.max(edgeSpanDeg(a, b), edgeSpanDeg(b, c), edgeSpanDeg(c, a)) > MAX_FILL_EDGE_DEG
  ) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    emitTriangle(a, ab, ca, depth + 1, radius, index, positions, regions);
    emitTriangle(ab, b, bc, depth + 1, radius, index, positions, regions);
    emitTriangle(ca, bc, c, depth + 1, radius, index, positions, regions);
    emitTriangle(ab, bc, ca, depth + 1, radius, index, positions, regions);
    return;
  }

  for (const [lng, lat] of [a, b, c]) {
    const v = latLngToVector3(lat, lng, radius);
    positions.push(v.x, v.y, v.z);
    regions.push(index);
  }
}

/** Angular span of an edge. Longitude is weighted by latitude so shapes near
 *  the poles are not subdivided far past what they are worth. */
function edgeSpanDeg(a: Position, b: Position): number {
  const dLat = b[1] - a[1];
  const dLng = (b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function midpoint(a: Position, b: Position): Position {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Carry a ring's longitudes continuously past ±180 rather than letting them
 * wrap, so a shape crossing the antimeridian stays one piece.
 *
 * Russia's mainland is a single ring that runs east into Chukotka, so its raw
 * coordinates jump from +179 to -180 and back. Unwrapped, it reads as a
 * continuous 19..190 instead — which is what lets both the fill triangulate as
 * one shape and the hit test bound it to somewhere smaller than the planet.
 */
export function unwrapRing(ring: Ring): Ring {
  const out: Ring = new Array(ring.length);
  let offset = 0;
  out[0] = ring[0];
  for (let i = 1; i < ring.length; i++) {
    const delta = ring[i][0] - ring[i - 1][0];
    if (delta > 180) offset -= 360;
    else if (delta < -180) offset += 360;
    out[i] = offset === 0 ? ring[i] : [ring[i][0] + offset, ring[i][1]];
  }
  return out;
}

/**
 * A 1-pixel-tall RGB texture holding one colour per region, looked up by the
 * `aRegion` attribute. Recolouring the whole world on an era change is then a
 * few hundred bytes uploaded once, rather than a pass over every vertex.
 */
export function createRegionColorTexture(count: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array(count * 4),
    count,
    1,
    THREE.RGBAFormat,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
