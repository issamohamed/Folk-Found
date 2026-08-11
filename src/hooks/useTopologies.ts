import { useEffect, useState } from 'react';

/** Minimal shape of the TopoJSON we consume. Both files were pre-processed to
 *  hold exactly one object, because react-simple-maps converts whichever object
 *  key comes first. */
export interface Topology {
  type: 'Topology';
  objects: Record<string, { geometries: Array<{ id?: string | number }> }>;
}

export interface Topologies {
  countries: Topology;
  states: Topology;
}

/** Loads both atlases once. Held in state so the object references stay stable —
 *  react-simple-maps re-converts the topology whenever the reference changes. */
export function useTopologies(): {
  topologies: Topologies | null;
  error: Error | null;
} {
  const [topologies, setTopologies] = useState<Topologies | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch('/geo/countries-50m.json').then((r) => r.json() as Promise<Topology>),
      fetch('/geo/states-10m.json').then((r) => r.json() as Promise<Topology>),
    ])
      .then(([countries, states]) => {
        if (!cancelled) setTopologies({ countries, states });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { topologies, error };
}

/** Every folklore region code that some rendered shape can resolve to. Used to
 *  find the regions that need a centroid marker so nothing is unreachable. */
export function claimedCodes(
  topologies: Topologies,
  countryIdToCode: (id: string | number) => string | null,
  stateIdToCode: (id: string | number) => string | null,
): Set<string> {
  const claimed = new Set<string>();

  const collect = (topology: Topology, resolve: (id: string | number) => string | null) => {
    for (const object of Object.values(topology.objects)) {
      for (const geometry of object.geometries) {
        if (geometry.id === undefined) continue;
        const code = resolve(geometry.id);
        if (code) claimed.add(code);
      }
    }
  };

  collect(topologies.countries, countryIdToCode);
  collect(topologies.states, stateIdToCode);
  return claimed;
}
