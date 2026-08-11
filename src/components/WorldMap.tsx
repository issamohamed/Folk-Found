import { useMemo } from 'react';
import { ComposableMap, Geographies, Marker, ZoomableGroup } from 'react-simple-maps';
import RegionShape from './RegionShape';
import type { Dataset, EraId } from '../data/types';
import {
  OCCLUDED_BY_DETAIL_LAYER,
  countryIdToRegionCode,
  stateIdToRegionCode,
} from '../data/regionCodes';
import { claimedCodes, useTopologies } from '../hooks/useTopologies';
import { densityFill } from '../data/densityScale';
import { densityFor, hasContent } from '../data/folklore';

interface WorldMapProps {
  data: Dataset;
  era: EraId;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

/** A region with no shape of its own, reached by a centroid dot instead:
 *  territories absent at 50m resolution, sub-national regions inside a larger
 *  shape, and anything occluded by a detail layer. */
interface MarkerRegion {
  code: string;
  name: string;
  coordinates: [number, number]; // [lng, lat] — Marker's order, not the data's
}

export default function WorldMap({ data, era, selectedCode, onSelect }: WorldMapProps) {
  // ~850 kB of atlases, fetched here rather than by the app shell so the globe
  // never pays for them.
  const { topologies, error } = useTopologies();

  // Computed from the atlases rather than hardcoded, so it survives a change
  // to either the data or an atlas.
  const markerRegions = useMemo<MarkerRegion[]>(() => {
    if (!topologies) return [];
    const claimed = claimedCodes(topologies, countryIdToRegionCode, stateIdToRegionCode);
    return Object.entries(data.regions)
      .filter(([code]) => !claimed.has(code) || OCCLUDED_BY_DETAIL_LAYER.has(code))
      .map(([code, region]) => ({
        code,
        name: region.name,
        // The data stores [lat, lng]; react-simple-maps wants [lng, lat].
        coordinates: [region.centroid[1], region.centroid[0]] as [number, number],
      }));
  }, [data, topologies]);

  const renderShape = (
    geo: { rsmKey: string; id?: string | number },
    resolve: (id: string | number) => string | null,
  ) => {
    const code = geo.id === undefined ? null : resolve(geo.id);
    // Interactive only when the region holds something in this era and is not
    // covered by a more detailed layer, so a click can never come back empty.
    const interactive =
      !!code && hasContent(data, code, era) && !OCCLUDED_BY_DETAIL_LAYER.has(code);

    return (
      <RegionShape
        key={geo.rsmKey}
        geo={geo}
        code={code}
        interactive={interactive}
        selected={!!code && code === selectedCode}
        fill={densityFill(densityFor(data, code, era))}
        onSelect={onSelect}
      />
    );
  };

  if (error) {
    return (
      <p className="state state--error">Could not load the map shapes: {error.message}</p>
    );
  }
  if (!topologies) {
    return <p className="state">Unrolling the map…</p>;
  }

  return (
    // Equal Earth is 2.055:1; the viewBox and scale are fitted to it.
    <ComposableMap
      projection="geoEqualEarth"
      projectionConfig={{ scale: 166 }}
      width={900}
      height={440}
      className="map"
    >
      <ZoomableGroup center={[0, 0]} zoom={1} maxZoom={12}>
        <Geographies geography={topologies.countries}>
          {({ geographies }) =>
            geographies.map((geo) => renderShape(geo, countryIdToRegionCode))
          }
        </Geographies>

        <Geographies geography={topologies.states}>
          {({ geographies }) =>
            geographies.map((geo) => renderShape(geo, stateIdToRegionCode))
          }
        </Geographies>

        {markerRegions.map((region) => {
          const density = densityFor(data, region.code, era);
          // Nothing recorded here in this era: no dot to click.
          if (density === null) return null;
          return (
            <Marker
              key={region.code}
              coordinates={region.coordinates}
              onClick={() => onSelect(region.code)}
              className="marker"
              data-region={region.code}
              data-selected={region.code === selectedCode ? 'true' : undefined}
            >
              {/* Sized as well as coloured, so these read as the same signal
                  as the filled shapes rather than as pins. */}
              <circle
                r={1.8 + density * 0.5}
                fill={densityFill(density)}
                className="marker__dot"
              />
              <title>{`${region.name} — density ${density}`}</title>
            </Marker>
          );
        })}
      </ZoomableGroup>
    </ComposableMap>
  );
}
