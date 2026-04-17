"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback
} from "react";
import { watercolorMapUrl } from "@/lib/map";
import { SLOGAN_EN, SLOGAN_BY_LANG, RTL_LANGS } from "@/lib/slogan";

interface Props {
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  language?: string;
  /** 'visible' → arriving / idle; 'closing' → animate out */
  state: "visible" | "closing";
  onDismiss: () => void;
  /** Fired once the canvas texture is built and the mesh is rendering. */
  onReady?: () => void;
}

// ── shaders ───────────────────────────────────────────────────────
// Per-vertex cloth bending (Z) + rigid-body rotation + drift, all
// driven by value noise. Under a perspective camera the Z bending is
// visible as foreshortening; the rigid-body components give obvious
// wind-caught motion.
const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uGust;

  varying vec2 vUv;
  varying float vShade;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * 2.0 - 1.0;
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    float t = uTime * 0.3;

    // ── Z bending (paper's own ripple) — noise-driven, user said this
    // part felt OK, preserved. Corners flap more than centre. ──
    float w = vnoise(vec2(pos.x * 1.0 + t, pos.y * 1.2)) * 0.55
            + vnoise(vec2(pos.x * 2.3 - t * 1.1, pos.y * 2.6 + t)) * 0.25;
    float gustWave = sin(t * 2.6 + pos.x * 3.0 + pos.y * 1.7) * 0.55 * uGust;
    float edgeW =
      (1.0 - cos(uv.x * 3.14159)) * 0.55 +
      (1.0 - cos(uv.y * 3.14159)) * 0.45;
    edgeW = edgeW * 0.6 + 0.25;
    float z = (w + gustWave) * edgeW * 0.18;
    pos.z += z;
    vShade = z;

    // ── Rigid-body drift (漂流) — two layered sins only. No noise here
    // because noise-driven rigid motion produces sudden jerks; a pair
    // of slow sins with different frequencies draws a smooth Lissajous-
    // like path, which is exactly the feel of something carried by a
    // lazy current. ──
    float rotAngle =
        sin(t * 0.30) * 0.060
      + sin(t * 0.17 + 1.5) * 0.030
      + uGust * 0.05;
    float cr = cos(rotAngle), sr = sin(rotAngle);
    mat2 rot = mat2(cr, -sr, sr, cr);
    pos.xy = rot * pos.xy;

    pos.x += sin(t * 0.28) * 0.14
           + sin(t * 0.15 + 2.0) * 0.07;
    pos.y += sin(t * 0.35 + 1.0) * 0.08
           + sin(t * 0.20 + 3.1) * 0.05
           + uGust * 0.04;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTex;
  varying vec2 vUv;
  varying float vShade;

  void main() {
    vec4 c = texture2D(uTex, vUv);

    // Matte paper shade — very small swing (±6 %).
    float shade = clamp(1.0 + vShade * 1.8, 0.94, 1.06);

    // Edge rim for paper thickness: the outermost ~1.8 % of UV fades
    // to a slightly darker value, reading as the side of a sheet that
    // has depth (not a tin foil edge).
    float edgeX = min(vUv.x, 1.0 - vUv.x);
    float edgeY = min(vUv.y, 1.0 - vUv.y);
    float edge = min(edgeX, edgeY);
    float rim = smoothstep(0.0, 0.018, edge);
    float rimShade = mix(0.72, 1.0, rim);

    gl_FragColor = vec4(c.rgb * shade * rimShade, c.a);
  }
`;

// ── water shaders ────────────────────────────────────────────────
const WATER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment-only water: depth gradient + ripple tint + sin-interference
// caustics + tiny sparkle spots. Cheap, works on mobile.
const WATER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.22;

    // Pool blue: deeper at bottom, sky reflection at top.
    vec3 deep    = vec3(0.13, 0.39, 0.63);  // #216599
    vec3 mid     = vec3(0.30, 0.62, 0.82);  // #4C9ED1
    vec3 shallow = vec3(0.58, 0.84, 0.93);  // #94D6ED
    vec3 base = mix(deep, mid, smoothstep(0.0, 0.45, uv.y));
    base = mix(base, shallow, smoothstep(0.6, 1.0, uv.y));

    // Ripple hue variation — small shifts in the blue as light plays
    // through the moving surface.
    float r = vnoise(uv * 5.0 + vec2(t * 0.5, t * 0.3));
    r += vnoise(uv * 11.0 - vec2(t * 0.7, t * 0.45)) * 0.5;
    r = (r - 0.7) * 0.22;

    // Sin-interference caustics — the classic pool-floor light net.
    vec2 c = uv * 8.0;
    float caustic =
        sin(c.x + t * 1.2)
      + sin(c.y + t * 1.5)
      + sin((c.x + c.y) * 0.6 + t * 0.9);
    caustic = smoothstep(1.4, 2.5, caustic) * 0.32;

    // Tiny sparkle spots from afternoon sun catching the peaks.
    float sp = vnoise(uv * 50.0 + t * 2.0);
    sp = smoothstep(0.84, 0.95, sp) * 0.55;

    vec3 color = base
      + vec3(caustic * 0.9, caustic * 1.0, caustic * 1.05)
      + vec3(sp)
      + vec3(r * 0.28);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── canvas texture renderer ──────────────────────────────────────

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function svgToImage(svg: string): Promise<HTMLImageElement> {
  const url = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  return loadImage(url);
}

interface TextureOpts {
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  language?: string;
}

async function renderEnvelopeTexture({
  city,
  country,
  lat,
  lng,
  language
}: TextureOpts): Promise<HTMLCanvasElement> {
  // Wait for Caveat/Fraunces to be ready; otherwise canvas falls back
  // to system fonts and the handwriting look collapses.
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.load("48px Caveat");
      await document.fonts.load("italic 48px Caveat");
      await document.fonts.load("700 32px Fraunces");
      await document.fonts.ready;
    } catch {
      /* ignore — we'll still render with fallbacks */
    }
  }

  const W = 2040;
  const H = Math.round(W / 1.55); // ≈ 1316
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Clip the whole envelope to rounded corners so the paper doesn't
  // read as a hard-edged rectangle.
  const cornerR = 22;
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, W, H, cornerR);
  ctx.clip();

  // 1 — base paper: near-white with a whisper of warm. No more
  // "brushed gold" gradient.
  const baseGrad = ctx.createLinearGradient(0, 0, 0, H);
  baseGrad.addColorStop(0, "#fcfaf5");
  baseGrad.addColorStop(1, "#f6efde");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, W, H);

  // 2 — very faint fibers + broad tonal patches. NO dark high-freq
  // specks (they looked like mould, not paper).
  const fibreSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.006 0.22' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0 0.16  0 0 0 0.08 0'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`;
  const broadSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><filter id='b'><feTurbulence type='fractalNoise' baseFrequency='0.0028' numOctaves='2' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0 0.16  0 0 0 0.07 0'/></filter><rect width='100%' height='100%' filter='url(#b)'/></svg>`;

  try {
    const [fibreImg, broadImg] = await Promise.all([
      svgToImage(fibreSvg),
      svgToImage(broadSvg)
    ]);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(broadImg, 0, 0, W, H);
    ctx.drawImage(fibreImg, 0, 0, W, H);
    ctx.restore();
  } catch {
    /* proceed without paper grain */
  }

  // 3 — soft highlight, top-left
  const hl = ctx.createRadialGradient(
    W * 0.22, H * 0.18, 0,
    W * 0.22, H * 0.18, W * 0.7
  );
  hl.addColorStop(0, "rgba(255, 251, 230, 0.4)");
  hl.addColorStop(1, "rgba(255, 251, 230, 0)");
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, W, H);

  // 3b — single faint tea-stain in the lower-right, so the paper
  // feels handled.
  const stain = ctx.createRadialGradient(
    W * 0.82, H * 0.84, 0,
    W * 0.82, H * 0.84, W * 0.2
  );
  stain.addColorStop(0, "rgba(160, 116, 62, 0.10)");
  stain.addColorStop(0.6, "rgba(160, 116, 62, 0.04)");
  stain.addColorStop(1, "rgba(160, 116, 62, 0)");
  ctx.fillStyle = stain;
  ctx.fillRect(0, 0, W, H);

  // 3c — gentle inner vignette so edges aren't harder than the
  // middle. A real sheet rolls off at the edges.
  const vig = ctx.createRadialGradient(
    W / 2, H / 2, W * 0.35,
    W / 2, H / 2, W * 0.75
  );
  vig.addColorStop(0, "rgba(80, 60, 30, 0)");
  vig.addColorStop(1, "rgba(80, 60, 30, 0.10)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // 4 — flap V-seam + soft shadow below it
  const seamY = H * 0.58;
  const flapGrad = ctx.createLinearGradient(0, 0, 0, seamY);
  flapGrad.addColorStop(0, "rgba(80, 45, 15, 0.20)");
  flapGrad.addColorStop(1, "rgba(80, 45, 15, 0)");
  ctx.fillStyle = flapGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W / 2, seamY);
  ctx.lineTo(W, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(80, 45, 15, 0.32)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W / 2, seamY);
  ctx.lineTo(W, 0);
  ctx.stroke();

  // 5 — return address (top-left, handwriting)
  ctx.font = "italic 56px Caveat, 'Brush Script MT', cursive";
  ctx.fillStyle = "rgba(107, 50, 32, 0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`From ${city}, ${country}`, 60, 44);

  // 6 — stamp (top-right)
  if (lat != null && lng != null) {
    const sw = 320;
    const sh = 400;
    const sx = W - sw - 56;
    const sy = 36;
    await drawStamp(ctx, sx, sy, sw, sh, lat, lng, city, country);
    drawCancellation(ctx, sx, sy, sw, sh);
  }

  // 7 — slogan (centred, with strikethrough correction)
  drawSloganEN(ctx, W, H);

  // 8 — local slogan (below)
  const localSlogan = language ? SLOGAN_BY_LANG[language] : undefined;
  if (localSlogan) {
    ctx.font = "42px Caveat, 'Brush Script MT', cursive";
    ctx.fillStyle = "rgba(107, 93, 69, 0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rtl = language ? RTL_LANGS.has(language) : false;
    ctx.direction = rtl ? "rtl" : "ltr";
    // Wrap long lines
    wrapCenteredText(ctx, localSlogan, W / 2, H * 0.72, W - 300, 56);
    ctx.direction = "ltr";
  }

  // 9 — hint (bottom)
  ctx.font = "italic 34px Caveat, cursive";
  ctx.fillStyle = "rgba(120, 106, 82, 0.55)";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("click to open", W / 2, H - 44);

  // close the rounded-corner clip
  ctx.restore();

  return canvas;
}

/** Standalone helper — Path2D's roundRect isn't everywhere yet. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawSloganEN(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const cy = H * 0.5;
  ctx.font = "64px Caveat, 'Brush Script MT', cursive";
  ctx.fillStyle = "rgba(58, 45, 30, 1)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Draw line 1: "A slice of [mundane] ordinary life,"
  const prefix = "A slice of ";
  const struck = "mundane";
  const between = " ";
  const kept = "ordinary life,";
  const prefixW = ctx.measureText(prefix).width;
  const struckW = ctx.measureText(struck).width;
  const betweenW = ctx.measureText(between).width;
  const keptW = ctx.measureText(kept).width;
  const totalW = prefixW + struckW + betweenW + keptW;
  const startX = W / 2 - totalW / 2;
  const lineY = cy - 38;

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(58, 45, 30, 1)";
  ctx.fillText(prefix, startX, lineY);

  // Struck-through "mundane"
  const mx = startX + prefixW;
  ctx.fillStyle = "rgba(156, 141, 114, 1)";
  ctx.fillText(struck, mx, lineY);
  ctx.strokeStyle = "rgba(107, 93, 69, 0.85)";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(mx - 6, lineY + 4);
  ctx.lineTo(mx + struckW + 6, lineY - 6);
  ctx.stroke();

  ctx.fillStyle = "rgba(58, 45, 30, 1)";
  ctx.fillText(between + kept, mx + struckW, lineY);

  // Line 2: "from elsewhere — hourly."
  ctx.textAlign = "center";
  ctx.fillText("from elsewhere \u2014 hourly.", W / 2, cy + 38);
}

async function drawStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lat: number,
  lng: number,
  city: string,
  country: string
) {
  // Paper
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#faf1d7");
  grad.addColorStop(1, "#ebe0c4");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Inner border
  ctx.strokeStyle = "rgba(107, 50, 32, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);

  // Map (top 70% of stamp, square)
  const mapPad = 22;
  const mapX = x + mapPad;
  const mapY = y + mapPad;
  const mapW = w - mapPad * 2;
  const mapH = mapW; // square

  try {
    const mapUrl = watercolorMapUrl(lat, lng, { size: 480, height: 720, zoom: 12 });
    const mapImg = await loadImage(mapUrl);
    // Crop to square: draw top portion (src is 2:3 portrait; we want square)
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, mapW, mapH);
    ctx.clip();
    // Draw the image scaled to mapW width; its height will be mapW * (720/480) = 1.5*mapW
    // We want to show top portion = mapH/(1.5*mapW) fraction = 0.667 of source
    ctx.drawImage(
      mapImg,
      0, 0, 480, 480,           // source: square top portion (0..480 y of 720)
      mapX, mapY, mapW, mapH    // dest
    );
    // Sepia wash
    ctx.fillStyle = "rgba(170, 130, 80, 0.32)";
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.restore();
  } catch {
    // map failed to load — just leave the paper
  }

  // Labels
  ctx.fillStyle = "rgba(107, 50, 32, 1)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "700 22px Fraunces, serif";
  ctx.fillText(city.toUpperCase(), x + w / 2, mapY + mapH + 18);
  ctx.font = "500 17px Fraunces, serif";
  ctx.fillStyle = "rgba(107, 50, 32, 0.75)";
  ctx.fillText(country.toUpperCase(), x + w / 2, mapY + mapH + 48);
}

function drawCancellation(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number
) {
  ctx.save();
  // Position near stamp's upper-left; rotate -14°
  const cx = sx - 20;
  const cy = sy + 80;
  ctx.translate(cx, cy);
  ctx.rotate((-14 * Math.PI) / 180);
  ctx.strokeStyle = "rgba(107, 50, 32, 0.38)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (let i = 0; i < 3; i++) {
    const y = i * 24;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < 380; x += 40) {
      ctx.bezierCurveTo(x + 10, y - 8, x + 30, y + 8, x + 40, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function wrapCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxW: number,
  lineHeight: number
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? cur + " " + word : word;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const total = lines.length * lineHeight;
  const startY = cy - total / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lineHeight);
  });
}

// ── water plane ──────────────────────────────────────────────────

function Water() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_, delta) => {
    const u = matRef.current?.uniforms ?? uniforms;
    u.uTime.value += delta;
  });

  // Plane sits behind the envelope and is generously oversized so it
  // covers the viewport no matter how the cloth drifts.
  const w = viewport.width * 2.2;
  const h = viewport.height * 2.2;

  return (
    <mesh position={[0, 0, -2]}>
      <planeGeometry args={[w, h, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={WATER_VERTEX}
        fragmentShader={WATER_FRAGMENT}
        uniforms={uniforms}
      />
    </mesh>
  );
}

// ── Three.js mesh with wind shader ───────────────────────────────

function ClothMesh({
  texture,
  aspect,
  state,
  isMobile,
  onDismiss
}: {
  texture: THREE.Texture;
  aspect: number;
  state: "visible" | "closing";
  isMobile: boolean;
  onDismiss: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const gustRef = useRef({ target: 0, value: 0, nextAt: 4 });
  const closingRef = useRef({ t: 0, started: -1 });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uGust: { value: 0 },
      uTex: { value: texture }
    }),
    [texture]
  );

  const segs: [number, number] = isMobile ? [16, 10] : [34, 22];
  const { viewport } = useThree();

  // Smaller envelope so the pool shows around it. Drift stays inside
  // the viewport.
  const planeW = Math.min(viewport.width * 0.5, 2.4);
  const planeH = planeW / aspect;

  useFrame((_s, delta) => {
    // Always advance uTime, even before refs settle. The uniforms object
    // is the one attached to the material, so the shader sees each tick.
    const u = matRef.current?.uniforms ?? uniforms;
    u.uTime.value += delta;

    // Gust scheduling
    const now = u.uTime.value;
    if (now > gustRef.current.nextAt) {
      gustRef.current.target = 1;
      gustRef.current.nextAt = now + 10 + Math.random() * 12;
      window.setTimeout(() => {
        gustRef.current.target = 0;
      }, 1600);
    }
    gustRef.current.value +=
      (gustRef.current.target - gustRef.current.value) * delta * 3.2;
    u.uGust.value = gustRef.current.value;

    // Closing animation
    if (state === "closing" && meshRef.current) {
      if (closingRef.current.started < 0) closingRef.current.started = now;
      const t = Math.min(1, (now - closingRef.current.started) / 0.55);
      meshRef.current.position.y = t * 1.4;
      meshRef.current.rotation.z = t * 0.12;
      const mat = meshRef.current.material as THREE.ShaderMaterial;
      mat.transparent = true;
      mat.opacity = 1 - t;
    }
  });

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
    >
      <planeGeometry args={[planeW, planeH, segs[0], segs[1]]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  );
}

// ── root component ───────────────────────────────────────────────

export default function ClothEnvelope({
  city,
  country,
  lat,
  lng,
  language,
  state,
  onDismiss,
  onReady
}: Props) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [aspect, setAspect] = useState<number>(1.55);

  useEffect(() => {
    let cancelled = false;
    let tex: THREE.Texture | null = null;
    renderEnvelopeTexture({ city, country, lat, lng, language })
      .then((canvas) => {
        if (cancelled) return;
        tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        setTexture(tex);
        setAspect(canvas.width / canvas.height);
        // Defer one frame so the mesh has a chance to paint before we
        // swap out the HTML fallback — avoids a blank-flash crossover.
        window.requestAnimationFrame(() => {
          if (!cancelled) onReady?.();
        });
      })
      .catch(() => {
        /* leave texture null → HTML fallback stays */
      });
    return () => {
      cancelled = true;
      if (tex) tex.dispose();
    };
  }, [city, country, lat, lng, language, onReady]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 720px)");
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const handleBackdropClick = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  if (!texture) {
    // Texture still rendering — render nothing; EnvelopeIntro
    // displays the HTML fallback until we signal ready.
    return null;
  }

  return (
    <div
      className={`cloth-root ${state === "closing" ? "closing" : ""}`}
      onClick={handleBackdropClick}
    >
      <Canvas
        camera={{ fov: 30, position: [0, 0, 8], near: 0.1, far: 100 }}
        dpr={[1, 2]}
        style={{ width: "100%", height: "100%", cursor: "pointer" }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      >
        <ambientLight intensity={0.88} />
        <directionalLight position={[2, 3, 4]} intensity={0.35} />
        <Water />
        <ClothMesh
          texture={texture}
          aspect={aspect}
          state={state}
          isMobile={isMobile}
          onDismiss={onDismiss}
        />
      </Canvas>

      <style>{`
        .cloth-root {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: cloth-in 700ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        /* Water covers the canvas now — no CSS drop shadow needed. */
        .cloth-root.closing {
          animation: cloth-out 550ms ease-in forwards;
        }
        @keyframes cloth-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cloth-out {
          to { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cloth-root { animation: none; }
          .cloth-root.closing { opacity: 0; transition: opacity 250ms linear; }
        }
      `}</style>
    </div>
  );
}
