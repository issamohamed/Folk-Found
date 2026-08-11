import { memo } from 'react';
import { Geography } from 'react-simple-maps';

interface RegionShapeProps {
  geo: object;
  /** Folklore region key, or null when the shape maps to no data. */
  code: string | null;
  interactive: boolean;
  selected: boolean;
  /** Density colour for the active era, already resolved. */
  fill: string;
  onSelect: (code: string) => void;
}

/**
 * One country or state path, filled by its density for the active era.
 *
 * Memoised: the map draws ~300 shapes, and every prop here is a primitive or a
 * stable reference, so an era switch only repaints the shapes that changed.
 */
const RegionShape = memo(function RegionShape({
  geo,
  code,
  interactive,
  selected,
  fill,
  onSelect,
}: RegionShapeProps) {
  return (
    <Geography
      geography={geo}
      onClick={interactive && code ? () => onSelect(code) : undefined}
      className={interactive ? 'shape shape--live' : 'shape shape--inert'}
      data-region={interactive ? code : undefined}
      data-selected={selected ? 'true' : undefined}
      style={{
        default: { fill, outline: 'none' },
        hover: { fill, outline: 'none' },
        pressed: { fill, outline: 'none' },
      }}
    />
  );
});

export default RegionShape;
