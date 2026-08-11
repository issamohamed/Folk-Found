import type { EntitiesFile, EraId, GenerationDirective } from '../../src/data/types';
import entitiesJson from '../../entities.json';

/**
 * entities.json is bundled into the Worker rather than fetched or trusted from
 * the request body. That keeps one source of truth across the whole stack and,
 * more importantly, means a caller cannot hand us invented creatures or a
 * rewritten directive and get them cached under a real region's key.
 */
const file = entitiesJson as unknown as EntitiesFile;

/** One creature, flattened to the fields the prompts need. */
export interface Item {
  key: string;
  title: string;
  kind: string;
  wiki: string;
  seed: string;
  sensitive: boolean;
  needsStory: boolean;
}

export interface Data {
  eras: { id: EraId; label: string; range: string }[];
  regions: Record<
    string,
    { name: string; centroid: [number, number]; eras: Record<EraId, string[]> }
  >;
  items: Record<string, Item>;
  directive: GenerationDirective;
}

function build(): Data {
  const regions: Data['regions'] = {};
  for (const [code, region] of Object.entries(file.regions)) {
    const eras = {} as Record<EraId, string[]>;
    for (const [eraId, slice] of Object.entries(region.eras) as Array<
      [EraId, { entries: string[] }]
    >) {
      eras[eraId] = slice.entries;
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

  return { eras: file.eras, regions, items, directive: file.generation_directive };
}

export const data: Data = build();

export interface Env {
  /** Groq API key. Lives only here — never in the frontend bundle. */
  GROQ_API_KEY: string;
  /** KV namespace for cached prose, images and wiki summaries. */
  FOLKLORE_CACHE: KVNamespace;
}

export function json(
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

/**
 * Catch-all for API routes. Without this, a non-POST request falls through to
 * the static asset handler and gets served the SPA's index.html, which is a
 * confusing thing for an API endpoint to return.
 */
export function methodNotAllowed(allow: string): Response {
  return json({ error: `Method not allowed. Use ${allow}.` }, 405, { Allow: allow });
}

export function isEraId(value: unknown): value is EraId {
  return typeof value === 'string' && data.eras.some((era) => era.id === value);
}

/**
 * The authoritative item list for a region and era, read from the bundled data.
 * Callers send their own copy (that is the documented request shape), but what
 * actually reaches the model is resolved here. Every region has entries in every
 * era, so this is never empty for a valid region.
 */
export function authoritativeItems(regionCode: string, era: EraId): Item[] | null {
  const keys = data.regions[regionCode]?.eras[era];
  if (!keys) return null;

  const items: Item[] = [];
  for (const key of keys) {
    const item = data.items[key];
    if (item) items.push(item);
  }
  return items;
}

/**
 * A short stable fingerprint of the generation directive. It is stored inside
 * each cached record so that editing the directive retires the old prose
 * automatically, without needing to change the cache key or purge KV by hand.
 * FNV-1a: tiny, synchronous, and sufficient for change detection.
 */
export const DIRECTIVE_VERSION = fnv1a(JSON.stringify(data.directive));

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
