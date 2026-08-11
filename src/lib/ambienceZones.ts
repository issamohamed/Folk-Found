/**
 * Sonic zones: the 294 regions grouped into fifteen musical moods.
 *
 * A zone fixes a scale, a register and a set of timbres. Nothing is transcribed
 * from real music — every pitch is computed from the interval tables below, so
 * the whole atlas is covered without audio files or licensing.
 *
 * Membership is by region code first, centroid second. Codes are listed
 * explicitly because culture does not follow bounding boxes: Réunion belongs
 * with Africa, Martinique with the Caribbean rather than with France.
 */

/** Semitone offsets from the zone root. Fractional steps are intentional — the
 *  near-equidistant island scales do not sit on the twelve-tone grid. */
export type Scale = readonly number[];

export type TimbreId =
  | 'pluck' // plucked string: bright attack, quick decay
  | 'mallet' // wood or metal bar: round attack, medium decay
  | 'bell' // inharmonic partials, long ring
  | 'reed' // sustained reed colour with slight vibrato
  | 'bowed' // two detuned saws, slow swell
  | 'air' // breath tone: sine plus filtered noise
  | 'drone' // root and fifth held underneath
  | 'pulse'; // filtered noise stroke, the only rhythmic layer

export type ZoneId =
  | 'east_asian'
  | 'southeast_asian'
  | 'south_asian'
  | 'central_asian'
  | 'middle_eastern'
  | 'sub_saharan_african'
  | 'mediterranean'
  | 'celtic'
  | 'western_european'
  | 'nordic'
  | 'slavic_eastern'
  | 'oceanic_pacific'
  | 'north_american'
  | 'latin_american'
  | 'caribbean';

export interface Zone {
  id: ZoneId;
  label: string;
  /** Scale root in Hz. The region seed shifts it a few semitones, so zone-mates
   *  share a register without sharing a pitch. */
  root: number;
  scale: Scale;
  /** Timbre of the melodic line. */
  lead: TimbreId;
  /** Timbre of the doubled line added at density 3. */
  harmony: TimbreId;
  /** Timbre of the high, sparse layer added at density 4. */
  shimmer: TimbreId;
  /** Harmony doubles a fifth above instead of an octave below. Reads as open
   *  and archaic rather than close and intimate. */
  openFifth: boolean;
  /** Multiplier on the gap between notes. Above 1 the zone breathes. */
  pace: number;
}

const ZONES: Record<ZoneId, Zone> = {
  // Major pentatonic, plucked. No semitone steps, so it never sounds plaintive.
  east_asian: {
    id: 'east_asian',
    label: 'East Asian',
    root: 261.63,
    scale: [0, 2, 4, 7, 9],
    lead: 'pluck',
    harmony: 'pluck',
    shimmer: 'bell',
    openFifth: false,
    pace: 1.1,
  },
  // Five near-equal steps on inharmonic metal: the shimmer of tuned gongs.
  southeast_asian: {
    id: 'southeast_asian',
    label: 'Southeast Asian',
    root: 233.08,
    scale: [0, 2.4, 4.8, 7.2, 9.6],
    lead: 'bell',
    harmony: 'mallet',
    shimmer: 'bell',
    openFifth: false,
    pace: 1.15,
  },
  // Flat second and raised seventh over a tonic that never moves.
  south_asian: {
    id: 'south_asian',
    label: 'South Asian',
    root: 220,
    scale: [0, 1, 4, 5, 7, 8, 11],
    lead: 'reed',
    harmony: 'bowed',
    shimmer: 'air',
    openFifth: true,
    pace: 1.0,
  },
  // Steppe: an open fifth underneath, a modal line circling it.
  central_asian: {
    id: 'central_asian',
    label: 'Central Asian',
    root: 174.61,
    scale: [0, 2, 3, 5, 7, 9, 10],
    lead: 'bowed',
    harmony: 'drone',
    shimmer: 'air',
    openFifth: true,
    pace: 1.2,
  },
  // Hijāz: the augmented second between flat second and major third.
  middle_eastern: {
    id: 'middle_eastern',
    label: 'Middle Eastern & North African',
    root: 196,
    scale: [0, 1, 4, 5, 7, 8, 10],
    lead: 'reed',
    harmony: 'bowed',
    shimmer: 'air',
    openFifth: false,
    pace: 1.05,
  },
  // Wooden bars, pentatonic. The one zone that gets its pulse layer at
  // density 4 rather than 5.
  sub_saharan_african: {
    id: 'sub_saharan_african',
    label: 'Sub-Saharan African',
    root: 246.94,
    scale: [0, 2, 4, 7, 9],
    lead: 'mallet',
    harmony: 'mallet',
    shimmer: 'pluck',
    openFifth: false,
    pace: 0.92,
  },
  // Phrygian: the flat second gives it the melancholy.
  mediterranean: {
    id: 'mediterranean',
    label: 'Mediterranean',
    root: 220,
    scale: [0, 1, 3, 5, 7, 8, 10],
    lead: 'pluck',
    harmony: 'pluck',
    shimmer: 'air',
    openFifth: false,
    pace: 1.0,
  },
  // Mixolydian over a held fifth; the flat seventh stops it resolving.
  celtic: {
    id: 'celtic',
    label: 'Celtic & Insular',
    root: 233.08,
    scale: [0, 2, 4, 5, 7, 9, 10],
    lead: 'air',
    harmony: 'bowed',
    shimmer: 'air',
    openFifth: true,
    pace: 1.05,
  },
  // Plain major, bowed and close — deliberately the least accented zone.
  western_european: {
    id: 'western_european',
    label: 'Western European',
    root: 196,
    scale: [0, 2, 4, 5, 7, 9, 11],
    lead: 'bowed',
    harmony: 'bowed',
    shimmer: 'bell',
    openFifth: false,
    pace: 1.1,
  },
  // Minor with the sixth left out: stacked fifths in cold air.
  nordic: {
    id: 'nordic',
    label: 'Nordic',
    root: 174.61,
    scale: [0, 2, 3, 7, 10],
    lead: 'bowed',
    harmony: 'drone',
    shimmer: 'air',
    openFifth: true,
    pace: 1.25,
  },
  // Harmonic minor: the gap between flat sixth and natural seventh.
  slavic_eastern: {
    id: 'slavic_eastern',
    label: 'Slavic & Eastern European',
    root: 185,
    scale: [0, 2, 3, 5, 7, 8, 11],
    lead: 'bowed',
    harmony: 'reed',
    shimmer: 'bell',
    openFifth: false,
    pace: 1.05,
  },
  // Breath over a held root, in the lowest register of any zone.
  oceanic_pacific: {
    id: 'oceanic_pacific',
    label: 'Oceanic & Pacific',
    root: 164.81,
    scale: [0, 2, 4, 7, 9],
    lead: 'air',
    harmony: 'drone',
    shimmer: 'mallet',
    openFifth: true,
    pace: 1.2,
  },
  // Open-string plucking with a lot of space around it.
  north_american: {
    id: 'north_american',
    label: 'North American',
    root: 207.65,
    scale: [0, 2, 4, 7, 9],
    lead: 'pluck',
    harmony: 'pluck',
    shimmer: 'air',
    openFifth: false,
    pace: 1.15,
  },
  // Natural minor, a little quicker than its neighbours.
  latin_american: {
    id: 'latin_american',
    label: 'Latin American',
    root: 220,
    scale: [0, 2, 3, 5, 7, 8, 10],
    lead: 'pluck',
    harmony: 'mallet',
    shimmer: 'bell',
    openFifth: false,
    pace: 0.95,
  },
  // Bright bars, major, the fastest pace on the map.
  caribbean: {
    id: 'caribbean',
    label: 'Caribbean',
    root: 261.63,
    scale: [0, 2, 4, 5, 7, 9, 11],
    lead: 'mallet',
    harmony: 'pluck',
    shimmer: 'bell',
    openFifth: false,
    pace: 0.88,
  },
};

/* ------------------------------------------------------------------------- */

/** Every non-US-state code in entities.json, by zone. US states are matched by
 *  their prefix rather than listed fifty-five times. */
const MEMBERS: Record<ZoneId, readonly string[]> = {
  east_asian: ['CN', 'JP', 'KR', 'KP', 'TW', 'HK', 'MO'],
  southeast_asian: ['TH', 'VN', 'ID', 'MY', 'PH', 'SG', 'KH', 'LA', 'MM', 'BN', 'TL'],
  south_asian: ['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV'],
  // Siberia sits here rather than with Russia: its folklore is shamanic and
  // Turkic-Mongolic, which an overtone drone carries better than a fiddle.
  central_asian: ['KZ', 'KG', 'TJ', 'TM', 'UZ', 'MN', 'AF', 'RU-SIB'],
  middle_eastern: [
    'IR',
    'IQ',
    'TR',
    'SA',
    'IL',
    'PS',
    'LB',
    'SY',
    'JO',
    'YE',
    'OM',
    'AE',
    'KW',
    'QA',
    'BH',
    'AZ',
    'AM',
    'GE',
    // The Maghreb and the Nile share this zone's modal material.
    'EG',
    'DZ',
    'MA',
    'TN',
    'LY',
    'SD',
    'MR',
    'EH',
  ],
  sub_saharan_african: [
    'NG',
    'GH',
    'CD',
    'GM',
    'ET',
    'ZA',
    'SS',
    'SO',
    'KE',
    'TZ',
    'UG',
    'RW',
    'BI',
    'ER',
    'DJ',
    'CM',
    'CG',
    'GA',
    'GQ',
    'CF',
    'TD',
    'NE',
    'ML',
    'BF',
    'SN',
    'GN',
    'GW',
    'SL',
    'LR',
    'CI',
    'TG',
    'BJ',
    'AO',
    'ZM',
    'ZW',
    'MW',
    'MZ',
    'NA',
    'BW',
    'LS',
    'SZ',
    'MG',
    'MU',
    'SC',
    'KM',
    'CV',
    'ST',
    'SH',
    'RE',
    'YT',
  ],
  mediterranean: ['GR', 'IT', 'ES', 'PT', 'MT', 'SM', 'VA', 'GR-CY', 'AD', 'MC', 'GI'],
  celtic: ['IE', 'SCT', 'IM', 'JE', 'GG'],
  western_european: ['GB', 'DE', 'FR', 'NL', 'BE', 'AT', 'CH', 'LU', 'LI'],
  // Greenland is here for its register, not its politics.
  nordic: ['IS', 'NO', 'SE', 'DK', 'FI', 'FO', 'GL', 'AX'],
  slavic_eastern: [
    'RU',
    'PL',
    'UA',
    'BY',
    'CZ',
    'SK',
    'BG',
    'RS',
    'HR',
    'BA',
    'ME',
    'MK',
    'SI',
    'AL',
    'RO',
    'HU',
    'LT',
    'LV',
    'EE',
    'MD',
  ],
  oceanic_pacific: [
    'NZ',
    'AU',
    'PG',
    'FJ',
    'SB',
    'VU',
    'WS',
    'TO',
    'KI',
    'FM',
    'MH',
    'PW',
    'NR',
    'TV',
    'CK',
    'NU',
    'TK',
    'WF',
    'AS',
    'NF',
    'CX',
    'CC',
    'PN',
    'PF',
    'NC',
  ],
  north_american: ['US', 'CA', 'BM', 'PM'],
  latin_american: [
    'MX',
    'GT',
    'SV',
    'HN',
    'NI',
    'CR',
    'PA',
    'CO',
    'VE',
    'EC',
    'PE',
    'BO',
    'BR',
    'AR',
    'CL',
    'PY',
    'UY',
    'GY',
    'SR',
    'GF',
    'FK',
    'BZ',
  ],
  caribbean: [
    'JM',
    'TT',
    'BS',
    'HT',
    'CU',
    'DO',
    'BB',
    'GD',
    'LC',
    'VC',
    'AG',
    'DM',
    'KN',
    'AW',
    'CW',
    'SX',
    'BQ',
    'TC',
    'KY',
    'VG',
    'AI',
    'MS',
    'BL',
    'MF',
    'GP',
    'MQ',
  ],
};

const ZONE_BY_CODE: ReadonlyMap<string, ZoneId> = new Map(
  (Object.entries(MEMBERS) as Array<[ZoneId, readonly string[]]>).flatMap(([zone, codes]) =>
    codes.map((code) => [code, zone] as [string, ZoneId]),
  ),
);

/** Fallback for a code the table does not list, decided from the centroid.
 *  Ordered tightest box first. */
function zoneFromCentroid(lat: number, lng: number): ZoneId {
  if (lat > 54 && lng > -25 && lng < 40) return 'nordic';
  if (lat > 35 && lng >= 100) return 'east_asian';
  if (lat > 30 && lng >= 60 && lng < 100) return 'central_asian';
  if (lat >= 5 && lng >= 60 && lng < 92) return 'south_asian';
  if (lng >= 92 && lat > -12 && lat <= 35) return 'southeast_asian';
  if (lat > 12 && lng >= 24 && lng < 60) return 'middle_eastern';
  if (lat > 20 && lng >= -18 && lng < 40) return 'middle_eastern';
  if (lat <= 20 && lat > -40 && lng >= -20 && lng < 55) return 'sub_saharan_african';
  if (lat > 34 && lat <= 48 && lng >= -10 && lng < 30) return 'mediterranean';
  if (lat > 40 && lng >= 14 && lng < 60) return 'slavic_eastern';
  if (lat > 40 && lng >= -12 && lng < 14) return 'western_european';
  if (lng >= 110 || lng < -140) return 'oceanic_pacific';
  if (lat > 24 && lng < -50) return 'north_american';
  if (lat > 7 && lat <= 26 && lng >= -86 && lng < -58) return 'caribbean';
  return 'latin_american';
}

/** The zone a region belongs to. The `US-` prefix wins first, then the code
 *  table, then the centroid. */
export function zoneFor(code: string, centroid: readonly [number, number]): Zone {
  if (code.startsWith('US-')) return ZONES.north_american;
  const listed = ZONE_BY_CODE.get(code);
  return ZONES[listed ?? zoneFromCentroid(centroid[0], centroid[1])];
}

/** All fifteen zones, for anything that needs the set rather than one lookup. */
export const ALL_ZONES: readonly Zone[] = Object.values(ZONES);
