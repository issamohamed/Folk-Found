import * as THREE from 'three';

/**
 * Sphere <-> geographic coordinate conversion.
 *
 * folklore.json stores centroids as [lat, lng]. Everything here takes and
 * returns that order so the data never has to be flipped at call sites — the
 * one place the order changes is the 2D map, where react-simple-maps wants
 * [lng, lat].
 */

export function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Inverse of latLngToVector3. Longitude is normalised to [-180, 180). */
export function vector3ToLatLng(point: THREE.Vector3): { lat: number; lng: number } {
  const radius = point.length();
  const lat = 90 - (Math.acos(point.y / radius) * 180) / Math.PI;
  const raw = (Math.atan2(point.z, -point.x) * 180) / Math.PI - 180;
  const lng = ((((raw + 180) % 360) + 360) % 360) - 180;
  return { lat, lng };
}

/** Great-circle separation in degrees. Used to decide which region a click on
 *  the globe belongs to. */
export function angularDistanceDeg(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h))) * 180) / Math.PI;
}
