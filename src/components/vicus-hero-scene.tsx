"use client";

import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { useCallback, useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/*
 * Choreography (world units, Y up). One token leaves the upper rail every BEAT,
 * falls through the horizontal portal at the origin, and a processed ring token
 * emerges underneath onto the lower rail. Every object position is a pure
 * function of continuous time, so the loop never resets.
 */
const BEAT = 0.95;
const COIN_R = 0.47;
const COIN_H = 0.15;
const SPACING = 1.2;
const RAIL_SPEED = SPACING / BEAT;
const GRAVITY = 30;
const DRAG = 1.6;
const YAW_RATE = 1.15;
const INPUT_POOL = 8;
const OUTPUT_POOL = 8;
const OUT_DELAY = 0.1;
const OUT_GRAVITY = 16;
const OUT_SPEED = 1.8;
const OUT_RAMP = 0.42;
const OUT_CLIP = -0.07;
const PORTAL_INNER = 0.9;
const PORTAL_OUTER = 1.1;
const START_BEAT = 0.68;
const STATIC_BEAT = 0.33;
const UP = new THREE.Vector3(0, 1, 0);

const upperCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(-1.2, 3.1, -6.4),
    new THREE.Vector3(-2.1, 2.55, -3.9),
    new THREE.Vector3(-1.9, 2.0, -1.9),
    new THREE.Vector3(-1.05, 1.5, -0.65),
    new THREE.Vector3(-0.2, 1.18, -0.3),
  ],
  false,
  "centripetal",
);

const lowerCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(-0.3, -1.15, -0.6),
    new THREE.Vector3(0.1, -1.3, 0.7),
    new THREE.Vector3(0.9, -1.5, 2.0),
    new THREE.Vector3(2.3, -1.75, 3.2),
    new THREE.Vector3(4.2, -2.05, 4.3),
    new THREE.Vector3(6.2, -2.35, 5.0),
  ],
  false,
  "centripetal",
);

const UPPER_LENGTH = upperCurve.getLength();
const LOWER_LENGTH = lowerCurve.getLength();

const railEnd = upperCurve.getPointAt(1);
const railEndTangent = upperCurve.getTangentAt(1);
const dropDir = new THREE.Vector3(railEndTangent.x, 0, railEndTangent.z).normalize();
const dropVy = railEndTangent.y * RAIL_SPEED;
const solveFall = (height: number) =>
  (dropVy + Math.sqrt(dropVy * dropVy + 2 * GRAVITY * height)) / GRAVITY;
const T_IMPACT = solveFall(railEnd.y);
const T_GONE = solveFall(railEnd.y + 2 * COIN_R) + 0.05;

const OUT_START = (() => {
  let best = 0;
  let bestDistance = Infinity;
  for (let k = 0; k <= 200; k += 1) {
    const u = (k / 200) * 0.5;
    const p = lowerCurve.getPointAt(u);
    const distance = (p.x - 0.05) ** 2 + (p.z - 0.1) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = u;
    }
  }
  return best * LOWER_LENGTH;
})();
const outRest = lowerCurve.getPointAt(OUT_START / LOWER_LENGTH);
const outRestTangent = lowerCurve.getTangentAt(OUT_START / LOWER_LENGTH);
const OUT_TOP = OUT_CLIP + COIN_R + 0.01;
const OUT_DROP = OUT_TOP - (outRest.y + COIN_R);
const T_EMERGE = Math.sqrt((2 * OUT_DROP) / OUT_GRAVITY);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const impactEnvelope = (age: number) => {
  if (age < 0) return 0;
  if (age < 0.05) return age / 0.05;
  return Math.exp(-(age - 0.05) * 5.2);
};

const mod = (n: number, m: number) => ((n % m) + m) % m;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Procedural textures ---------------- */

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeWeaveTexture() {
  const random = mulberry32(7);
  const texture = canvasTexture(512, (ctx) => {
    ctx.fillStyle = "#040406";
    ctx.fillRect(0, 0, 512, 512);
    const cell = 32;
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const horizontal = (x + y) % 2 === 0;
        for (let k = 0; k < 2; k += 1) {
          const lum = 30 + random() * 46 + (random() > 0.92 ? 48 : 0);
          const tint = Math.round(lum + 6);
          ctx.fillStyle = `rgb(${Math.round(lum)},${Math.round(lum - 2)},${tint})`;
          const px = x * cell + (horizontal ? 2 : k * 16 + 2);
          const py = y * cell + (horizontal ? k * 16 + 2 : 2);
          ctx.fillRect(px, py, horizontal ? cell - 4 : 12, horizontal ? 12 : cell - 4);
        }
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.72, 0.72);
  return texture;
}

function makeGlowTexture() {
  return canvasTexture(128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.38)");
    g.addColorStop(0.65, "rgba(255,255,255,0.08)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

// `cut` is the colour of the coin face behind the glyph (used by glyphs with knock-outs).
type GlyphDraw = (ctx: CanvasRenderingContext2D, cut: string) => void;

const poly = (ctx: CanvasRenderingContext2D, points: Array<[number, number]>) => {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
};

const GLYPHS: GlyphDraw[] = [
  // Stablecoin
  (ctx) => {
    ctx.lineWidth = 20;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, 128, Math.PI * 0.64, Math.PI * 1.36);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 128, -Math.PI * 0.36, Math.PI * 0.36);
    ctx.stroke();
    ctx.font = "700 188px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", 0, 10);
  },
  // Ethereum
  (ctx) => {
    poly(ctx, [[0, -150], [92, 10], [0, 58], [-92, 10]]);
    poly(ctx, [[0, 82], [92, 32], [0, 150], [-92, 32]]);
    ctx.fillStyle = "rgba(10,10,14,0.4)";
    poly(ctx, [[0, -150], [92, 10], [0, 58]]);
    poly(ctx, [[0, 82], [92, 32], [0, 150]]);
  },
  // Treasury / fund
  (ctx) => {
    poly(ctx, [[-138, -58], [0, -138], [138, -58]]);
    ctx.fillRect(-124, -50, 248, 18);
    [-100, -40, 20, 80].forEach((x) => ctx.fillRect(x, -22, 20, 104));
    ctx.fillRect(-124, 88, 248, 18);
    ctx.fillRect(-140, 112, 280, 18);
  },
  // Stellar
  (ctx) => {
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(0, 0, 112, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 112, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.rotate(-0.36);
    ctx.fillRect(-156, -30, 312, 18);
    ctx.fillRect(-156, 12, 312, 18);
  },
  // Real estate
  (ctx) => {
    ctx.lineWidth = 20;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-136, -6);
    ctx.lineTo(0, -126);
    ctx.lineTo(136, -6);
    ctx.stroke();
    ctx.strokeRect(-92, -24, 184, 140);
    ctx.fillRect(-22, 48, 44, 68);
  },
  // Solana
  (ctx) => {
    [-1, 0, 1].forEach((k) => {
      const y = k * 62;
      poly(
        ctx,
        k === 0
          ? [[-82, y - 20], [112, y - 20], [82, y + 20], [-112, y + 20]]
          : [[-112, y - 20], [82, y - 20], [112, y + 20], [-82, y + 20]],
      );
    });
  },
  // Commodity
  (ctx) => {
    const bar = (x: number, y: number) =>
      poly(ctx, [[x + 16, y], [x + 104, y], [x + 120, y + 58], [x, y + 58]]);
    bar(-128, 36);
    bar(8, 36);
    bar(-60, -36);
  },
  // Base-style network mark
  (ctx, cut) => {
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cut;
    ctx.fillRect(-130, -13, 150, 26);
  },
];

// Vicus mark drawn on processed tokens (light mark on the same dark body; violet ring = portal energy).
const vicusChevron: GlyphDraw = (ctx) => {
  ctx.lineWidth = 30;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-84, -62);
  ctx.lineTo(0, 72);
  ctx.lineTo(84, -62);
  ctx.stroke();
};

const TOKEN_FIELD_CUT = "#121217";

// Original token face: dark graphite field, machined rings, engraved rim, white/silver glyph.
function makeAssetFace(draw: GlyphDraw) {
  return canvasTexture(512, (ctx) => {
    const base = ctx.createRadialGradient(200, 170, 20, 256, 256, 256);
    base.addColorStop(0, "#24242c");
    base.addColorStop(1, "#0b0b0f");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(255,255,255,0.025)";
    ctx.lineWidth = 1;
    for (let r = 18; r < 250; r += 6) {
      ctx.beginPath();
      ctx.arc(256, 256, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(210,210,225,0.32)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(256, 256, 226, 0, Math.PI * 2);
    ctx.stroke();
    ctx.translate(256, 256);
    const silver = ctx.createLinearGradient(-130, -130, 130, 130);
    silver.addColorStop(0, "#f6f6fb");
    silver.addColorStop(0.5, "#b4b4c0");
    silver.addColorStop(1, "#ececf3");
    ctx.fillStyle = silver;
    ctx.strokeStyle = silver;
    draw(ctx, TOKEN_FIELD_CUT);
  });
}

// Emissive + bump mask: glyph only. The body emits nothing (stays black); the glyph carries a
// small white emissive so the symbol reads white/light at every angle, including mid-fall.
function makeGlyphMask(draw: GlyphDraw) {
  const mask = canvasTexture(512, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(256, 256, 226, 0, Math.PI * 2);
    ctx.stroke();
    ctx.translate(256, 256);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    draw(ctx, "#000");
  });
  mask.colorSpace = THREE.NoColorSpace;
  return mask;
}

/*
 * ONE material family for every token, on the rail, while falling, and after the portal:
 * dark metal body + white/light glyph. Nothing switches material by stage — only the
 * clipping plane differs (keep-above for incoming tokens, keep-below for processed ones).
 */
function makeTokenEdgeMaterial(clippingPlanes: THREE.Plane[]) {
  return new THREE.MeshStandardMaterial({
    clippingPlanes,
    color: "#2c2c36",
    metalness: 1,
    roughness: 0.26,
  });
}

function makeTokenFaceMaterial(map: THREE.Texture, mask: THREE.Texture, clippingPlanes: THREE.Plane[]) {
  return new THREE.MeshStandardMaterial({
    bumpMap: mask,
    bumpScale: 2,
    clippingPlanes,
    emissive: "#ffffff",
    emissiveIntensity: 0.35,
    emissiveMap: mask,
    map,
    metalness: 0.88,
    roughness: 0.3,
  });
}

/* ---------------- Geometry ---------------- */

function buildTrackGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  { width, depth, lift = 0, lateral = 0, segments = 220 }: {
    width: number;
    depth: number;
    lift?: number;
    lateral?: number;
    segments?: number;
  },
) {
  const length = curve.getLength();
  const hw = width / 2;
  type Frame = { tl: THREE.Vector3; tr: THREE.Vector3; bl: THREE.Vector3; br: THREE.Vector3; v: number };
  const frames: Frame[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, UP).normalize();
    const n = new THREE.Vector3().crossVectors(side, t).normalize();
    const c = p.clone().addScaledVector(side, lateral).addScaledVector(n, lift);
    const tl = c.clone().addScaledVector(side, -hw);
    const tr = c.clone().addScaledVector(side, hw);
    frames.push({
      tl,
      tr,
      bl: tl.clone().addScaledVector(n, -depth),
      br: tr.clone().addScaledVector(n, -depth),
      v: (u * length) / Math.max(width, 1.2),
    });
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const geometry = new THREE.BufferGeometry();

  // Triangles (a0, b0, a1) give normal (b - a) x tangent.
  const strip = (a: keyof Frame, b: keyof Frame, materialIndex: number) => {
    const start = positions.length / 3;
    const indexStart = indices.length;
    frames.forEach((f) => {
      const pa = f[a] as THREE.Vector3;
      const pb = f[b] as THREE.Vector3;
      positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      uvs.push(0, f.v, 1, f.v);
    });
    for (let i = 0; i < segments; i += 1) {
      const a0 = start + i * 2;
      indices.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
    geometry.addGroup(indexStart, segments * 6, materialIndex);
  };

  const cap = (f: Frame, flip: boolean) => {
    const start = positions.length / 3;
    const indexStart = indices.length;
    [f.tl, f.tr, f.br, f.bl].forEach((p) => {
      positions.push(p.x, p.y, p.z);
      uvs.push(0, 0);
    });
    if (flip) indices.push(start, start + 3, start + 1, start + 1, start + 3, start + 2);
    else indices.push(start, start + 1, start + 3, start + 1, start + 2, start + 3);
    geometry.addGroup(indexStart, 6, 1);
  };

  strip("tl", "tr", 0);
  strip("tr", "br", 1);
  strip("bl", "tl", 1);
  strip("br", "bl", 1);
  cap(frames[frames.length - 1], false);
  cap(frames[0], true);

  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function buildCoinBody() {
  const h = COIN_H / 2;
  const b = 0.03;
  const profile = [
    new THREE.Vector2(0, -h),
    new THREE.Vector2(COIN_R - b, -h),
    new THREE.Vector2(COIN_R - 0.006, -h + b * 0.4),
    new THREE.Vector2(COIN_R, -h + b),
    new THREE.Vector2(COIN_R, h - b),
    new THREE.Vector2(COIN_R - 0.006, h - b * 0.4),
    new THREE.Vector2(COIN_R - b, h),
    new THREE.Vector2(0, h),
  ];
  const geometry = new THREE.LatheGeometry(profile, 72);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/* ---------------- Orientation helpers ---------------- */

const _basis = new THREE.Matrix4();
const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();

// Coin axis = local Z = horizontal tangent x up, so tokens stand upright across the rail.
function orientToken(obj: THREE.Object3D, tangent: THREE.Vector3, yaw: number, lean: number, roll: number) {
  _fwd.set(tangent.x, 0, tangent.z).normalize();
  _side.crossVectors(_fwd, UP);
  _basis.makeBasis(_fwd, UP, _side);
  obj.quaternion.setFromRotationMatrix(_basis);
  _euler.set(lean, yaw, roll, "YXZ");
  obj.quaternion.multiply(_q.setFromEuler(_euler));
}

/* ---------------- World ---------------- */

type World = {
  root: THREE.Group;
  update: (state: RootState, delta: number | null) => void;
  dispose: () => void;
};

function createWorld(): World {
  const root = new THREE.Group();
  const keepAbove = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const keepBelow = [new THREE.Plane(new THREE.Vector3(0, -1, 0), OUT_CLIP)];

  /* Lighting */
  const key = new THREE.DirectionalLight("#ebe8ff", 1.5);
  key.position.set(-4, 7, 4);
  const rim = new THREE.DirectionalLight("#b9a8ff", 1.6);
  rim.position.set(3, 3, -6);
  const fill = new THREE.DirectionalLight("#ffffff", 0.25);
  fill.position.set(5, 1, 6);
  const portalLight = new THREE.PointLight("#9a5cff", 4, 5.5, 1.6);
  portalLight.position.set(0, 0.5, 0.15);
  const underLight = new THREE.PointLight("#a35bff", 3, 4, 1.6);
  underLight.position.set(0.25, -0.6, 0.7);
  root.add(key, rim, fill, portalLight, underLight);

  /* Tracks */
  const weave = makeWeaveTexture();
  const trackTop = new THREE.MeshStandardMaterial({
    bumpMap: weave,
    bumpScale: 1.4,
    color: "#a59fc0",
    map: weave,
    metalness: 0.7,
    roughness: 0.42,
  });
  const trackSide = new THREE.MeshStandardMaterial({ color: "#0e0e14", metalness: 0.9, roughness: 0.3 });
  const trackMaterials = [trackTop, trackSide];
  const lipMaterials = [trackSide, trackSide];

  const addTrack = (curve: THREE.CatmullRomCurve3, width: number, depth: number) => {
    root.add(new THREE.Mesh(buildTrackGeometry(curve, { depth, width }), trackMaterials));
    [-1, 1].forEach((s) =>
      root.add(
        new THREE.Mesh(
          buildTrackGeometry(curve, { depth: 0.1, lateral: s * (width / 2 - 0.03), lift: 0.045, width: 0.06 }),
          lipMaterials,
        ),
      ),
    );
  };
  addTrack(upperCurve, 1.45, 0.24);
  addTrack(lowerCurve, 1.5, 0.26);

  /* Portal */
  const glow = makeGlowTexture();
  const portal = new THREE.Group();
  const housing = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(PORTAL_INNER - 0.02, -0.02),
        new THREE.Vector2(PORTAL_INNER - 0.02, 0.02),
        new THREE.Vector2(PORTAL_INNER + 0.03, 0.06),
        new THREE.Vector2(PORTAL_OUTER - 0.04, 0.06),
        new THREE.Vector2(PORTAL_OUTER, 0.02),
        new THREE.Vector2(PORTAL_OUTER, -0.14),
        new THREE.Vector2(PORTAL_OUTER - 0.06, -0.18),
        new THREE.Vector2(PORTAL_INNER - 0.02, -0.18),
      ],
      96,
    ),
    new THREE.MeshStandardMaterial({ color: "#0a0a10", metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide }),
  );
  const energyMaterial = new THREE.ShaderMaterial({
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uPulse;
      uniform float uRipple;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float edge = (0.70 + 0.045 * cos(6.0 * a + uTime * 0.35) + 0.025 * sin(3.0 * a - uTime * 0.8)
          + 0.014 * sin(9.0 * a + uTime * 1.3)) * (1.0 - 0.075 * uPulse);
        float d = r - edge;
        float inside = 1.0 - smoothstep(-0.015, 0.015, d);
        float t = clamp(r / edge, 0.0, 1.0);
        vec3 core = mix(vec3(1.0, 0.98, 1.0), vec3(0.74, 0.64, 1.0), smoothstep(0.05, 1.0, t));
        core += 0.05 * sin(p.x * 3.1 + p.y * 2.3 + uTime * 0.6);
        float band = exp(-pow(d / 0.045, 2.0));
        float haze = exp(-max(d, 0.0) * 6.5) * (1.0 - inside);
        vec3 violet = vec3(0.55, 0.17, 1.0);
        vec3 magenta = vec3(0.86, 0.25, 0.98);
        vec3 col = vec3(0.012, 0.006, 0.025);
        col += core * inside * (0.92 + 0.3 * uPulse);
        col += mix(violet, magenta, 0.55) * band * (1.7 + 1.6 * uPulse);
        col += violet * haze * (0.45 + 0.65 * uPulse);
        float ring = exp(-pow((r - uRipple * 1.05) / 0.05, 2.0)) * (1.0 - uRipple) * step(0.001, uRipple);
        col += vec3(0.95, 0.85, 1.0) * ring * 0.7;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
    uniforms: { uPulse: { value: 0 }, uRipple: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const energy = new THREE.Mesh(new THREE.CircleGeometry(PORTAL_INNER, 96), energyMaterial);
  energy.rotation.x = -Math.PI / 2;
  energy.position.y = 0.004;
  const innerRimMaterial = new THREE.MeshBasicMaterial({ color: "#b47cff", toneMapped: false });
  const innerRim = new THREE.Mesh(new THREE.TorusGeometry(PORTAL_INNER, 0.016, 12, 128), innerRimMaterial);
  innerRim.rotation.x = Math.PI / 2;
  innerRim.position.y = 0.025;
  const outerRimMaterial = new THREE.MeshBasicMaterial({ color: "#cdb6ff", toneMapped: false });
  const outerRim = new THREE.Mesh(new THREE.TorusGeometry(PORTAL_OUTER + 0.006, 0.007, 8, 160), outerRimMaterial);
  outerRim.rotation.x = Math.PI / 2;
  outerRim.position.y = 0.02;
  const poolMaterial = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: "#7a2cff",
    depthWrite: false,
    map: glow,
    opacity: 0.4,
    transparent: true,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), poolMaterial);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.07;
  const hazeMaterial = new THREE.SpriteMaterial({
    blending: THREE.AdditiveBlending,
    color: "#6d27ff",
    depthWrite: false,
    map: glow,
    opacity: 0.25,
    transparent: true,
  });
  const haze = new THREE.Sprite(hazeMaterial);
  haze.position.set(0, 0.3, 0.2);
  haze.scale.setScalar(3.4);
  portal.add(housing, energy, innerRim, outerRim, pool, haze);
  root.add(portal);

  /* Tokens */
  const coinBody = buildCoinBody();
  const coinFace = new THREE.CircleGeometry(COIN_R - 0.03, 72);
  const inputEdge = makeTokenEdgeMaterial(keepAbove);
  const faceTextures = GLYPHS.map((draw) => makeAssetFace(draw));
  const glyphMasks = GLYPHS.map((draw) => makeGlyphMask(draw));
  // Body: dark metal. Glyph: white/silver, lifted by a masked white emissive + embossed bump.
  const faceMaterials = faceTextures.map((map, index) => makeTokenFaceMaterial(map, glyphMasks[index], keepAbove));

  const inputs = Array.from({ length: INPUT_POOL }, (_, slot) => {
    const group = new THREE.Group();
    const face = faceMaterials[slot % faceMaterials.length];
    const front = new THREE.Mesh(coinFace, face);
    front.position.z = COIN_H / 2 + 0.0015;
    const back = new THREE.Mesh(coinFace, face);
    back.position.z = -front.position.z;
    back.rotation.y = Math.PI;
    group.add(new THREE.Mesh(coinBody, inputEdge), front, back);
    group.visible = false;
    root.add(group);
    return group;
  });

  // Processed tokens: same dark/white family, marked with the light Vicus chevron.
  const outFaceTexture = makeAssetFace(vicusChevron);
  const outFaceMask = makeGlyphMask(vicusChevron);
  const outEdge = makeTokenEdgeMaterial(keepBelow);
  const outFace = makeTokenFaceMaterial(outFaceTexture, outFaceMask, keepBelow);
  const ringCore = new THREE.TorusGeometry(COIN_R * 0.76, 0.02, 10, 96);
  const ringGlow = new THREE.TorusGeometry(COIN_R * 0.76, 0.045, 10, 96);
  const ringHalo = new THREE.TorusGeometry(COIN_R * 0.76, 0.11, 10, 96);

  const outputs = Array.from({ length: OUTPUT_POOL }, () => {
    const group = new THREE.Group();
    const core = new THREE.MeshBasicMaterial({ clippingPlanes: keepBelow, color: "#f4e9ff", toneMapped: false });
    const mid = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      clippingPlanes: keepBelow,
      color: "#a64dff",
      depthWrite: false,
      opacity: 0.85,
      toneMapped: false,
      transparent: true,
    });
    const halo = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      clippingPlanes: keepBelow,
      color: "#7a2cff",
      depthWrite: false,
      opacity: 0.2,
      toneMapped: false,
      transparent: true,
    });
    const front = new THREE.Mesh(coinFace, outFace);
    front.position.z = COIN_H / 2 + 0.0015;
    const back = new THREE.Mesh(coinFace, outFace);
    back.position.z = -front.position.z;
    back.rotation.y = Math.PI;
    group.add(new THREE.Mesh(coinBody, outEdge), front, back);
    [1, -1].forEach((s) => {
      [
        new THREE.Mesh(ringCore, core),
        new THREE.Mesh(ringGlow, mid),
        new THREE.Mesh(ringHalo, halo),
      ].forEach((mesh) => {
        mesh.position.z = s * (COIN_H / 2 + 0.006);
        group.add(mesh);
      });
    });
    group.visible = false;
    root.add(group);
    return { group, core, halo, mid };
  });

  const coreBase = new THREE.Color("#f4e9ff");
  const midBase = new THREE.Color("#a64dff");

  /* Frame + time */
  let time = START_BEAT * BEAT;
  let frameW = 0;
  let frameH = 0;
  const target = new THREE.Vector3();
  const camOffset = new THREE.Vector3();

  const frameCamera = (state: RootState) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const { width, height } = state.size;
    if (width === frameW && height === frameH) return;
    frameW = width;
    frameH = height;
    const aspect = width / Math.max(height, 1);
    // Mobile frames the rail end, portal and output run as one column; wide single-column
    // stages shift it right of centre.
    const compact = width < 640;
    const wide = !compact && aspect > 1.2;
    const halfH = compact ? 2.55 : wide ? 2.6 : 3.05;
    const halfW = compact ? 2.2 : 2.7;
    camera.fov = 30;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(halfH / tanHalf, halfW / (tanHalf * aspect));
    const pitch = THREE.MathUtils.degToRad(27);
    const yaw = THREE.MathUtils.degToRad(-4);
    target.set(compact ? 0.1 : wide ? -0.8 : 0.2, compact ? 0.05 : 0.1, 0.25);
    camOffset.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance);
    camera.position.copy(target).add(camOffset);
    camera.lookAt(target);
    camera.near = 0.5;
    camera.far = distance + 30;
    camera.updateProjectionMatrix();
    const fog = state.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.near = distance - 1.5;
      fog.far = distance + 8;
    }
  };

  const update = (state: RootState, delta: number | null) => {
    frameCamera(state);
    time = delta === null ? STATIC_BEAT * BEAT : time + Math.min(delta, 1 / 20);
    const beat = time / BEAT;
    const current = Math.floor(beat);

    // Nearly imperceptible camera breathing.
    if (delta !== null) state.camera.position.y = target.y + camOffset.y + Math.sin(time * 0.31) * 0.012;

    /* Input tokens: rail → detach → fall → clipped by portal plane */
    for (let i = current; i < current + INPUT_POOL; i += 1) {
      const group = inputs[mod(i, INPUT_POOL)];
      const s = time - i * BEAT;
      if (s < 0) {
        const d = -s * RAIL_SPEED;
        if (d > UPPER_LENGTH) {
          group.visible = false;
          continue;
        }
        const u = 1 - d / UPPER_LENGTH;
        upperCurve.getPointAt(u, _p);
        upperCurve.getTangentAt(u, _t);
        const settle = smoothstep(0, 0.7, d);
        group.position.set(_p.x, _p.y + COIN_R, _p.z);
        orientToken(
          group,
          _t,
          d * YAW_RATE + settle * 0.06 * Math.sin(time * 1.3 + i),
          settle * 0.045 * Math.sin(time * 2.1 + i * 1.9),
          settle * 0.05 * Math.sin(time * 1.7 + i),
        );
        group.visible = true;
      } else if (s < T_GONE) {
        const horizontal = (RAIL_SPEED * (1 - Math.exp(-DRAG * s))) / DRAG;
        group.position.copy(railEnd).addScaledVector(dropDir, horizontal);
        group.position.y = railEnd.y + COIN_R + dropVy * s - 0.5 * GRAVITY * s * s;
        const k = s / T_GONE;
        orientToken(group, dropDir, -s * RAIL_SPEED * YAW_RATE, k * k * 0.6, (-s * RAIL_SPEED * 0.35) / COIN_R);
        group.visible = true;
      } else {
        group.visible = false;
      }
    }

    /* Portal reaction: sum of decaying envelopes keyed to each impact */
    let pulse = 0;
    let ripple = 0;
    for (let i = current; i >= current - 2; i -= 1) {
      const age = time - (i * BEAT + T_IMPACT);
      pulse += impactEnvelope(age);
      if (age >= 0 && ripple === 0) ripple = Math.min(age / 0.65, 1);
    }
    pulse = Math.min(pulse, 1.25);
    energyMaterial.uniforms.uTime.value = time;
    energyMaterial.uniforms.uPulse.value = pulse;
    energyMaterial.uniforms.uRipple.value = ripple >= 1 ? 0 : ripple;
    innerRimMaterial.color.setRGB(0.7 + pulse * 0.35, 0.48 + pulse * 0.3, 1 + pulse * 0.4);
    outerRimMaterial.color.setRGB(0.55 + pulse * 0.25, 0.47 + pulse * 0.2, 0.8 + pulse * 0.25);
    poolMaterial.opacity = 0.32 + pulse * 0.32;
    hazeMaterial.opacity = 0.2 + pulse * 0.28;
    portalLight.intensity = 3.5 + pulse * 11;
    underLight.intensity = 2.5 + pulse * 5;

    /* Output tokens: emerge beneath portal → settle → roll toward foreground */
    for (let i = current; i > current - OUTPUT_POOL; i -= 1) {
      const out = outputs[mod(i, OUTPUT_POOL)];
      const s = time - (i * BEAT + T_IMPACT + OUT_DELAY);
      if (s < 0) {
        out.group.visible = false;
        continue;
      }
      if (s < T_EMERGE) {
        out.group.position.set(outRest.x, OUT_TOP - 0.5 * OUT_GRAVITY * s * s, outRest.z);
        orientToken(out.group, outRestTangent, 0, 0, 0);
      } else {
        const tau = s - T_EMERGE;
        const d = OUT_START + OUT_SPEED * (tau - OUT_RAMP * (1 - Math.exp(-tau / OUT_RAMP)));
        if (d > LOWER_LENGTH) {
          out.group.visible = false;
          continue;
        }
        const u = d / LOWER_LENGTH;
        lowerCurve.getPointAt(u, _p);
        lowerCurve.getTangentAt(u, _t);
        out.group.position.set(_p.x, _p.y + COIN_R + 0.05 * Math.exp(-tau * 7) * Math.abs(Math.sin(tau * 13)), _p.z);
        orientToken(out.group, _t, 0.2 * Math.sin(tau * 0.8 + i) * smoothstep(0, 1.2, tau), 0, -(d - OUT_START) / COIN_R);
      }
      const birth = 1 + 1.3 * Math.exp(-s * 3);
      out.core.color.copy(coreBase).multiplyScalar(birth);
      out.mid.color.copy(midBase).multiplyScalar(birth);
      out.halo.opacity = 0.16 + 0.16 * (birth - 1);
      out.group.visible = true;
    }
  };

  const dispose = () => {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material: THREE.Material) => material.dispose());
      }
    });
    [weave, glow, outFaceTexture, outFaceMask, ...faceTextures, ...glyphMasks].forEach((texture) => texture.dispose());
  };

  return { dispose, root, update };
}

function HeroWorld({ reducedMotion }: { reducedMotion: boolean }) {
  const world = useMemo(() => createWorld(), []);
  useEffect(() => () => world.dispose(), [world]);
  useFrame((state, delta) => world.update(state, reducedMotion ? null : delta));
  return <primitive object={world.root} />;
}

export default function VicusHeroScene({
  active,
  onReady,
  reducedMotion,
}: {
  active: boolean;
  onReady: () => void;
  reducedMotion: boolean;
}) {
  const handleCreated = useCallback(
    ({ gl, scene }: RootState) => {
      gl.localClippingEnabled = true;
      const pmrem = new THREE.PMREMGenerator(gl);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.32;
      pmrem.dispose();
      requestAnimationFrame(() => requestAnimationFrame(onReady));
    },
    [onReady],
  );

  return (
    <Canvas
      camera={{ far: 60, fov: 30, near: 0.5, position: [0, 5, 10] }}
      dpr={[1, 1.75]}
      fallback={null}
      frameloop={reducedMotion ? "demand" : active ? "always" : "never"}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onCreated={handleCreated}
      style={{ pointerEvents: "none" }}
    >
      <fog args={["#000000", 10, 19]} attach="fog" />
      <HeroWorld reducedMotion={reducedMotion} />
    </Canvas>
  );
}
