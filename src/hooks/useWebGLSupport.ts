import { useState } from 'react';

/**
 * Whether this browser can actually run the globe. Checked once, lazily, by
 * trying for a real context rather than sniffing the user agent — software
 * blocklists and headless environments both show up here and nowhere else.
 */
function detect(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    if (!gl) return false;
    // Release the context immediately; the globe will make its own.
    const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function useWebGLSupport(): boolean {
  const [supported] = useState(detect);
  return supported;
}
