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
 * One country or state path, filled by its folklore density for the active era.
 *
 * Memoised because the map draws ~300 shapes and both selecting a region and
 * switching eras would otherwise re-render every one of them. All props are
 * primitives or stable references, so React skips the shapes that did not
 * change — on an era switch only the regions whose density actually moved get
 * repainted.
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
