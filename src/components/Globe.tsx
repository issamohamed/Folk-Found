import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Dataset, EraId } from '../data/types';
import { densityRgb } from '../data/densityScale';
import { angularDistanceDeg, latLngToVector3, vector3ToLatLng } from '../lib/geo';
import { useTopologies } from '../hooks/useTopologies';
import {
  OCCLUDED_BY_DETAIL_LAYER,
  countryIdToRegionCode,
  stateIdToRegionCode,
} from '../data/regionCodes';
import {
  buildBorderGeometry,
  buildFillGeometry,
  collectPolygons,
  createRegionColorTexture,
} from '../lib/globeShapes';
import {
  MAX_PICK_DEGREES,
  buildPickIndex,
  resolveRegion,
  type PickIndex,
} from '../lib/regionPick';

const GLOBE_RADIUS = 1;
/** Coastlines and borders, lifted clear of the wireframe shell. */
const BORDER_RADIUS = GLOBE_RADIUS * 1.006;
/** Region fills sit just under their own outlines. */
const FILL_RADIUS = GLOBE_RADIUS * 1.002;
/** Where the camera points on load. */
const OPENING_VIEW = { lat: 30, lng: 26 };
/** Splotches float clear of the shell to avoid z-fighting. */
const SPLOTCH_RADIUS = GLOBE_RADIUS * 1.004;

interface GlobeProps {
  data: Dataset;
  era: EraId;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

/* ---------------------------------------------------------------------------
   Shaders
   ------------------------------------------------------------------------- */

/** Shared by the wireframe shell and its point cloud: displaces each vertex
 *  along its normal by a standing wave, and fades the far side of the sphere. */
const SHELL_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uPointSize;
  varying float vElevation;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  float standingWave(vec3 n, float t) {
    return sin(n.x * 3.0 + t * 0.35) * 0.5
         + sin(n.y * 4.0 - t * 0.27) * 0.3
         + sin(n.z * 3.5 + t * 0.21) * 0.2;
  }

  void main() {
    vec3 n = normalize(position);
    float elevation = standingWave(n, uTime);
    vElevation = elevation;

    vec3 displaced = position + n * elevation * uAmplitude;
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vPositionW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);

    vec4 mv = viewMatrix * world;
    gl_PointSize = uPointSize * (1.0 / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  uniform float uOpacity;
  uniform float uRound;
  varying float vElevation;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    // Round off point sprites; lines pass through untouched.
    if (uRound > 0.5) {
      if (length(gl_PointCoord - 0.5) > 0.5) discard;
    }

    vec3 viewDir = normalize(cameraPosition - vPositionW);
    float facing = dot(normalize(vNormalW), viewDir);

    // The far hemisphere stays faintly visible, so the globe reads as a shell
    // rather than a solid ball.
    float alpha = smoothstep(-0.6, 0.85, facing) * uOpacity;
    vec3 color = mix(uColorLow, uColorHigh, vElevation * 0.5 + 0.5);

    gl_FragColor = vec4(color, alpha);
  }
`;

/** One additive glow per region centroid, sized and coloured by density. */
const SPLOTCH_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vColor = aColor;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normalize(position));

    vec4 mv = viewMatrix * world;
    gl_PointSize = aSize * uPixelRatio * (1.0 / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const SPLOTCH_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;

    // Soft radial falloff — a splotch, not a dot.
    float glow = pow(1.0 - d, 2.6);

    // Hidden by facing rather than depth, which keeps the additive pass free
    // of z-fighting.
    vec3 viewDir = normalize(cameraPosition - vPositionW);
    float front = smoothstep(-0.02, 0.3, dot(vNormalW, viewDir));

    gl_FragColor = vec4(vColor, glow * front);
  }
`;

/** Country and US-state outlines. Every vertex carries its region index, so
 *  hovering is one uniform write rather than a geometry rebuild. */
const BORDER_VERTEX = /* glsl */ `
  attribute float aRegion;
  uniform float uHovered;
  uniform float uSelected;
  varying float vLit;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    // -1 marks a shape with no folklore data; it is drawn but never lit.
    float hovered = (aRegion >= 0.0 && abs(aRegion - uHovered) < 0.5) ? 1.0 : 0.0;
    float selected = (aRegion >= 0.0 && abs(aRegion - uSelected) < 0.5) ? 1.0 : 0.0;
    vLit = max(hovered, selected);

    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normalize(position));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BORDER_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLitColor;
  uniform float uOpacity;
  varying float vLit;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPositionW);
    float facing = dot(normalize(vNormalW), viewDir);

    // Far-side borders fade instead of being clipped, so the back of the world
    // does not crowd the front.
    float front = smoothstep(-0.05, 0.32, facing);

    gl_FragColor = vec4(
      mix(uColor, uLitColor, vLit),
      uOpacity * front * mix(1.0, 4.5, vLit)
    );
  }
`;

/** The heatmap as territory: each region's surface tinted by its colour for
 *  the active era. Splotches show where folklore is thickest, fills show whose. */
const FILL_VERTEX = /* glsl */ `
  attribute float aRegion;
  uniform sampler2D uRegionColors;
  uniform float uRegionCount;
  uniform float uHovered;
  uniform float uSelected;
  varying vec3 vColor;
  varying float vLit;
  varying float vHasData;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vHasData = aRegion >= 0.0 ? 1.0 : 0.0;
    vColor = texture2D(
      uRegionColors,
      vec2((max(aRegion, 0.0) + 0.5) / uRegionCount, 0.5)
    ).rgb;

    float hovered = (aRegion >= 0.0 && abs(aRegion - uHovered) < 0.5) ? 1.0 : 0.0;
    float selected = (aRegion >= 0.0 && abs(aRegion - uSelected) < 0.5) ? 1.0 : 0.0;
    vLit = max(hovered, selected);

    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normalize(position));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FILL_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uNoDataColor;
  varying vec3 vColor;
  varying float vLit;
  varying float vHasData;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPositionW);
    float facing = dot(normalize(vNormalW), viewDir);
    float front = smoothstep(-0.05, 0.35, facing);

    // Land with no data (Antarctica) stays a dim slate rather than a hole.
    vec3 color = mix(uNoDataColor, vColor, vHasData);
    float alpha = uOpacity * front * mix(1.0, 2.6, vLit) * mix(0.45, 1.0, vHasData);

    gl_FragColor = vec4(color, alpha);
  }
`;

/* ------------------------------------------------------------------------- */

export default function Globe({ data, era, selectedCode, onSelect }: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // ~850 kB of atlases. The hook caches nothing; the browser's HTTP cache is
  // what keeps switching views from refetching.
  const { topologies } = useTopologies();

  // Mutable scene handles that the update effects need to reach.
  const sceneRef = useRef<THREE.Scene | null>(null);
  const splotchRef = useRef<THREE.Points | null>(null);
  const codesRef = useRef<string[]>([]);
  const regionIndexRef = useRef<ReadonlyMap<string, number>>(new Map());
  const pickIndexRef = useRef<PickIndex | null>(null);
  const regionColorsRef = useRef<THREE.DataTexture | null>(null);
  /** Shared with the border material so hover survives its async construction. */
  const hoverUniformRef = useRef({ value: -1 });
  const selectedUniformRef = useRef({ value: -1 });
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef<string | null>(selectedCode);
  selectedRef.current = selectedCode;

  // ---- Scene: built once ------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    // Open on the eastern Mediterranean. The default orientation faces 90°W —
    // open Pacific — so the first thing anyone saw was ocean. From here most of
    // the ancient era's density-5 regions are already in frame.
    camera.position.copy(latLngToVector3(OPENING_VIEW.lat, OPENING_VIEW.lng, 3.05));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.55;
    controls.minDistance = 1.45;
    controls.maxDistance = 6;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    // The idle drift gives way in two stages: the pointer entering the globe
    // pauses it, so hovering a country and clicking it aim at the same place,
    // and any real interaction stops it for good.
    let userEngaged = false;
    let pointerOverGlobe = false;
    const stopIdleSpin = () => {
      userEngaged = true;
    };
    controls.addEventListener('start', stopIdleSpin);

    /* -- Starfield -------------------------------------------------------- */
    const starCount = 2600;
    const starPos = new Float32Array(starCount * 3);
    const starSize = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      // Even spread over a sphere well outside the camera's orbit.
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 22;
      const s = Math.sqrt(1 - u * u);
      starPos[i * 3] = r * s * Math.cos(theta);
      starPos[i * 3 + 1] = r * u;
      starPos[i * 3 + 2] = r * s * Math.sin(theta);
      starSize[i] = 0.6 + Math.random() * 2.4;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(starSize, 1));
    const starMat = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    /* -- Globe shell: wireframe + points ---------------------------------- */
    const shellUniforms = {
      uTime: { value: 0 },
      uAmplitude: { value: 0.016 },
      uPointSize: { value: 2.6 },
      uColorLow: { value: new THREE.Color('#1b4a6b') },
      uColorHigh: { value: new THREE.Color('#58b0cc') },
      // Held down: the icosahedron gives the sphere a body, but at full
      // strength its triangles compete with the coastlines.
      uOpacity: { value: 0.16 },
      uRound: { value: 0 },
    };

    const wireGeo = new THREE.WireframeGeometry(
      new THREE.IcosahedronGeometry(GLOBE_RADIUS, 4),
    );
    const wireMat = new THREE.ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      uniforms: shellUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    scene.add(wireframe);

    const pointGeo = new THREE.IcosahedronGeometry(GLOBE_RADIUS, 5);
    const pointMat = new THREE.ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      uniforms: {
        ...shellUniforms,
        uPointSize: { value: 3.4 },
        uOpacity: { value: 0.55 },
        uRound: { value: 1 },
        uColorLow: { value: new THREE.Color('#2b5f7a') },
        uColorHigh: { value: new THREE.Color('#9fe8ff') },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const shellPoints = new THREE.Points(pointGeo, pointMat);
    scene.add(shellPoints);

    /* -- Density splotches ------------------------------------------------ */
    const codes = Object.keys(data.regions);
    codesRef.current = codes;
    // One numbering shared by splotches, borders and fills.
    regionIndexRef.current = new Map(codes.map((code, i) => [code, i]));
    const regionColors = createRegionColorTexture(codes.length);
    regionColorsRef.current = regionColors;

    const splotchPos = new Float32Array(codes.length * 3);
    codes.forEach((code, i) => {
      const [lat, lng] = data.regions[code].centroid;
      const v = latLngToVector3(lat, lng, SPLOTCH_RADIUS);
      splotchPos[i * 3] = v.x;
      splotchPos[i * 3 + 1] = v.y;
      splotchPos[i * 3 + 2] = v.z;
    });

    const splotchGeo = new THREE.BufferGeometry();
    splotchGeo.setAttribute('position', new THREE.BufferAttribute(splotchPos, 3));
    splotchGeo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(new Float32Array(codes.length), 1),
    );
    splotchGeo.setAttribute(
      'aColor',
      new THREE.BufferAttribute(new Float32Array(codes.length * 3), 3),
    );

    const splotchMat = new THREE.ShaderMaterial({
      vertexShader: SPLOTCH_VERTEX,
      fragmentShader: SPLOTCH_FRAGMENT,
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const splotches = new THREE.Points(splotchGeo, splotchMat);
    splotches.renderOrder = 2;
    scene.add(splotches);
    splotchRef.current = splotches;

    /* -- Invisible pick target -------------------------------------------- */
    // Clicks intersect a solid sphere first: raycasting the splotch cloud
    // directly would pick regions on the far side of the globe.
    const pickSphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    scene.add(pickSphere);

    /* -- Sizing ------------------------------------------------------------ */
    // Checked per frame rather than by ResizeObserver: RO callbacks are
    // delivered as part of the rendering steps, so they can be withheld exactly
    // when the page is not rendering. Two integer comparisons cost nothing and
    // catch every cause of a size change.
    const syncSize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;

      const ratio = Math.min(window.devicePixelRatio, 2);
      const needed = { w: Math.round(w * ratio), h: Math.round(h * ratio) };
      const canvasEl = renderer.domElement;
      if (canvasEl.width === needed.w && canvasEl.height === needed.h) return;

      renderer.setPixelRatio(ratio);
      // updateStyle must stay on, or the canvas renders devicePixelRatio times
      // too large.
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      splotchMat.uniforms.uPixelRatio.value = ratio;
    };
    syncSize();

    /* -- Picking ----------------------------------------------------------- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;

    /** Screen position to region. Hover and click both go through it, so the
     *  lit outline is always the region a click would open. */
    const regionAt = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hit = raycaster.intersectObject(pickSphere, false)[0];
      if (!hit) return null;

      // Undo the globe's own rotation before converting to coordinates.
      const local = splotches.worldToLocal(hit.point.clone());
      const { lat, lng } = vector3ToLatLng(local);

      const index = pickIndexRef.current;
      // Until the atlases land there are no shapes to test, so fall back to
      // the nearest centroid and stay clickable.
      if (!index) {
        let best: string | null = null;
        let bestDist = Infinity;
        for (const code of codesRef.current) {
          const [cLat, cLng] = data.regions[code].centroid;
          const dist = angularDistanceDeg(lat, lng, cLat, cLng);
          if (dist < bestDist) {
            bestDist = dist;
            best = code;
          }
        }
        return best && bestDist <= MAX_PICK_DEGREES ? best : null;
      }

      return resolveRegion(
        index,
        (code) => data.regions[code].centroid,
        codesRef.current,
        lat,
        lng,
      );
    };

    const canvas = renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerOverGlobe = true;
      // While dragging the globe the pointer is steering, not pointing.
      if (downAt) return;
      const code = regionAt(e.clientX, e.clientY);
      hoverUniformRef.current.value = code ? (regionIndexRef.current.get(code) ?? -1) : -1;
      canvas.style.cursor = code ? 'pointer' : 'grab';
    };

    const onPointerLeave = () => {
      pointerOverGlobe = false;
      hoverUniformRef.current.value = -1;
    };

    const onPointerUp = (e: PointerEvent) => {
      // Ignore the pointer-up that ends a drag-to-rotate.
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 5) return;

      const code = regionAt(e.clientX, e.clientY);
      if (code) onSelectRef.current(code);
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerup', onPointerUp);

    /* -- Loop -------------------------------------------------------------- */
    // Connected to the document so the Page Visibility API applies: returning
    // to a backgrounded tab must not deliver one enormous delta.
    const timer = new THREE.Timer();
    timer.connect(document);
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      syncSize();
      timer.update();
      const t = timer.getElapsed();
      shellUniforms.uTime.value = t;
      pointMat.uniforms.uTime.value = t;
      stars.rotation.y = t * 0.006;
      controls.autoRotate =
        !userEngaged && !pointerOverGlobe && selectedRef.current === null;
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      timer.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerup', onPointerUp);
      controls.removeEventListener('start', stopIdleSpin);
      controls.dispose();
      [starGeo, wireGeo, pointGeo, splotchGeo, pickSphere.geometry].forEach((g) =>
        g.dispose(),
      );
      [starMat, wireMat, pointMat, splotchMat, pickSphere.material].forEach((m) =>
        (m as THREE.Material).dispose(),
      );
      regionColors.dispose();
      renderer.dispose();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
      splotchRef.current = null;
      sceneRef.current = null;
      regionColorsRef.current = null;
    };
  }, [data]);

  // ---- Outlines: added once the atlases arrive --------------------------
  // Kept out of the scene effect so the globe appears without waiting on 850 kB.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !topologies) return;

    const shapes = [
      ...collectPolygons(
        topologies.countries,
        countryIdToRegionCode,
        OCCLUDED_BY_DETAIL_LAYER,
      ),
      // The states layer is drawn in full; the US country shape it covers was
      // dropped above, so nothing is drawn twice.
      ...collectPolygons(topologies.states, stateIdToRegionCode, new Set()),
    ];

    pickIndexRef.current = buildPickIndex(
      shapes,
      codesRef.current,
      (code) => data.regions[code].centroid,
    );

    const fillGeo = buildFillGeometry(shapes, regionIndexRef.current, FILL_RADIUS);
    const fillMat = new THREE.ShaderMaterial({
      vertexShader: FILL_VERTEX,
      fragmentShader: FILL_FRAGMENT,
      uniforms: {
        uRegionColors: { value: regionColorsRef.current },
        uRegionCount: { value: Math.max(1, codesRef.current.length) },
        uHovered: hoverUniformRef.current,
        uSelected: selectedUniformRef.current,
        uOpacity: { value: 0.3 },
        uNoDataColor: { value: new THREE.Color('#1b2430') },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const fills = new THREE.Mesh(fillGeo, fillMat);
    fills.renderOrder = 0;
    scene.add(fills);

    const borderGeo = buildBorderGeometry(shapes, regionIndexRef.current, BORDER_RADIUS);
    const borderMat = new THREE.ShaderMaterial({
      vertexShader: BORDER_VERTEX,
      fragmentShader: BORDER_FRAGMENT,
      uniforms: {
        uHovered: hoverUniformRef.current,
        uSelected: selectedUniformRef.current,
        uColor: { value: new THREE.Color('#8fc4e8') },
        uLitColor: { value: new THREE.Color('#f2fbff') },
        uOpacity: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const borders = new THREE.LineSegments(borderGeo, borderMat);
    borders.renderOrder = 1;
    scene.add(borders);

    return () => {
      scene.remove(fills);
      scene.remove(borders);
      fillGeo.dispose();
      fillMat.dispose();
      borderGeo.dispose();
      borderMat.dispose();
      pickIndexRef.current = null;
    };
  }, [topologies, data]);

  // ---- Splotch colour and size follow the active era --------------------
  useEffect(() => {
    selectedUniformRef.current.value = selectedCode
      ? (regionIndexRef.current.get(selectedCode) ?? -1)
      : -1;

    const splotches = splotchRef.current;
    if (!splotches) return;

    const codes = codesRef.current;
    const sizes = splotches.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const colors = splotches.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    // The fills read their colour from this texture, which is what keeps
    // territory and splotch on the same era.
    const regionColors = regionColorsRef.current;
    const texels = regionColors?.image.data as Uint8Array | undefined;

    codes.forEach((code, i) => {
      const slice = data.regions[code].eras[era];
      // An empty slice is unlit rather than dim: painting it density-1 blue
      // would claim a story is there.
      const empty = slice.items.length === 0;
      const density = empty ? 0 : slice.density;
      const rgb = densityRgb(empty ? null : density);

      if (texels) {
        texels[i * 4] = Math.round(rgb[0] * 255);
        texels[i * 4 + 1] = Math.round(rgb[1] * 255);
        texels[i * 4 + 2] = Math.round(rgb[2] * 255);
        texels[i * 4 + 3] = 255;
      }
      // Quadratic area, so a 5 reads as a broad splotch and a 1 as an ember.
      // Device pixels at unit distance; the shader divides by view depth.
      const base = empty ? 0 : 52 + density * density * 9.5;
      sizes.setX(i, code === selectedCode ? base * 1.5 : base);
      colors.setXYZ(i, rgb[0], rgb[1], rgb[2]);
    });

    sizes.needsUpdate = true;
    colors.needsUpdate = true;
    if (regionColors) regionColors.needsUpdate = true;
  }, [data, era, selectedCode]);

  return <div className="globe" ref={mountRef} />;
}
