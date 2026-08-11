import { ISO_NUMERIC_TO_ALPHA2 } from './isoNumeric';

/**
 * Atlas ids to region keys. Neither atlas uses the data file's keys:
 * countries-50m is ISO 3166-1 numeric, states-10m is FIPS.
 *
 * Pure translation — no region data lives here.
 */

/** Country codes where the atlas and folklore.json disagree on the key. */
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  // folklore.json files Cyprus under the Greek-language grouping.
  CY: 'GR-CY',
  // US territories are filed as US-XX. The states atlas also carries these
  // shapes, at higher resolution; both paths resolve to the same region.
  PR: 'US-PR',
  GU: 'US-GU',
  VI: 'US-VI',
  MP: 'US-MP',
};

/** FIPS state id -> folklore.json region key. 56 shapes in us-atlas states-10m:
 *  50 states, DC, four US territories, and American Samoa — which folklore.json
 *  files as a country (AS), not a US region. */
const FIPS_TO_REGION: Readonly<Record<string, string>> = {
  '01': 'US-AL',
  '02': 'US-AK',
  '04': 'US-AZ',
  '05': 'US-AR',
  '06': 'US-CA',
  '08': 'US-CO',
  '09': 'US-CT',
  '10': 'US-DE',
  '11': 'US-DC',
  '12': 'US-FL',
  '13': 'US-GA',
  '15': 'US-HI',
  '16': 'US-ID',
  '17': 'US-IL',
  '18': 'US-IN',
  '19': 'US-IA',
  '20': 'US-KS',
  '21': 'US-KY',
  '22': 'US-LA',
  '23': 'US-ME',
  '24': 'US-MD',
  '25': 'US-MA',
  '26': 'US-MI',
  '27': 'US-MN',
  '28': 'US-MS',
  '29': 'US-MO',
  '30': 'US-MT',
  '31': 'US-NE',
  '32': 'US-NV',
  '33': 'US-NH',
  '34': 'US-NJ',
  '35': 'US-NM',
  '36': 'US-NY',
  '37': 'US-NC',
  '38': 'US-ND',
  '39': 'US-OH',
  '40': 'US-OK',
  '41': 'US-OR',
  '42': 'US-PA',
  '44': 'US-RI',
  '45': 'US-SC',
  '46': 'US-SD',
  '47': 'US-TN',
  '48': 'US-TX',
  '49': 'US-UT',
  '50': 'US-VT',
  '51': 'US-VA',
  '53': 'US-WA',
  '54': 'US-WV',
  '55': 'US-WI',
  '56': 'US-WY',
  '60': 'AS', // American Samoa — a country-level key in folklore.json
  '66': 'US-GU',
  '69': 'US-MP',
  '72': 'US-PR',
  '78': 'US-VI',
};

/**
 * Regions whose shape is completely covered by a more detailed layer and so can
 * never take a click. The US landmass is fully tiled by the states layer, yet
 * `US` has its own country-level data; its shape is drawn inert and the region
 * is reached through the centroid marker instead.
 */
export const OCCLUDED_BY_DETAIL_LAYER: ReadonlySet<string> = new Set(['US']);

/** Resolve a country geography id (ISO numeric) to a folklore region key.
 *  Returns null for shapes with no ISO numeric (Kosovo, Somaliland, N. Cyprus,
 *  Siachen Glacier, Indian Ocean Ter.) — those are rendered inert. */
export function countryIdToRegionCode(id: string | number): string | null {
  const numeric = String(id).padStart(3, '0');
  const alpha2 = ISO_NUMERIC_TO_ALPHA2[numeric];
  if (!alpha2) return null;
  return COUNTRY_ALIASES[alpha2] ?? alpha2;
}

/** Resolve a US states geography id (FIPS) to a folklore region key. */
export function stateIdToRegionCode(id: string | number): string | null {
  return FIPS_TO_REGION[String(id).padStart(2, '0')] ?? null;
}
