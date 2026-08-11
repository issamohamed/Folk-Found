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

/** A region that no rendered shape can resolve to, reached by a centroid dot
 *  instead. Covers small territories absent at 50m resolution (Tuvalu, Tokelau,
 *  Christmas I.), sub-national regions inside a larger shape (Scotland,
 *  Siberia), overseas départements merged into their parent, and any region
 *  occluded by a detail layer. */
interface MarkerRegion {
  code: string;
  name: string;
  coordinates: [number, number]; // [lng, lat] — Marker's order, not the data's
}

export default function WorldMap({ data, era, selectedCode, onSelect }: WorldMapProps) {
  // The two atlases are ~850 kB together and only this view needs them, so they
  // are fetched here rather than by the app shell — a visitor who stays on the
  // globe never downloads them.
  const { topologies, error } = useTopologies();

  // Which regions have no clickable shape, computed from the atlases rather
  // than hardcoded, so it stays correct if either the data or an atlas changes.
  const markerRegions = useMemo<MarkerRegion[]>(() => {
    if (!topologies) return [];
    const claimed = claimedCodes(topologies, countryIdToRegionCode, stateIdToRegionCode);
    return Object.entries(data.regions)
      .filter(([code]) => !claimed.has(code) || OCCLUDED_BY_DETAIL_LAYER.has(code))
      .map(([code, region]) => ({
        code,
        name: region.name,
        // folklore.json stores [lat, lng]; react-simple-maps wants [lng, lat].
        coordinates: [region.centroid[1], region.centroid[0]] as [number, number],
      }));
  }, [data, topologies]);

  const renderShape = (
    geo: { rsmKey: string; id?: string | number },
    resolve: (id: string | number) => string | null,
  ) => {
    const code = geo.id === undefined ? null : resolve(geo.id);
    // A shape is interactive only when it actually holds something in this era
    // and is not covered by a more detailed layer. In myth mode most regions
    // hold nothing, so this is what keeps a click from coming back empty.
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
    // Equal Earth renders the world at a 2.055:1 aspect; the viewBox and scale
    // are fitted to it so the map neither overflows nor floats in dead space.
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
              {/* Sized as well as coloured by density, so these read as the same
                  signal as the filled shapes rather than as separate pins. */}
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
