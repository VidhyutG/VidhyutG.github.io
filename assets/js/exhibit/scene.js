// @ts-check
/**
 * The hero exhibit: a routed, three-layer platform drawn as stacked glass.
 *
 * Everything is vector. The scene is axonometric, so each plate maps to the
 * screen through one affine matrix and can be drawn with ordinary 2D canvas
 * calls: crisp at any size, with no WebGL and no library. Each plate is
 * rendered once into its own bitmap; a frame is then three blits, a frosted
 * backdrop behind each sheet of glass, and whatever is moving.
 */

/** @typedef {import("./generate.js").Board} Board */
/** @typedef {import("./generate.js").Net} Net */
/** @typedef {import("./generate.js").Part} Part */
/** @typedef {{a:number, b:number, c:number, d:number, e:number, f:number}} Matrix */
/** @typedef {{path:Path2D, length:number, net:Net}} Wire */
/** @typedef {{traces:Path2D, power:Path2D, pads:Path2D, idlePads:Path2D, dots:Path2D, holes:Path2D, rings:Path2D, wires:Wire[], byId:Map<number, Wire>}} Prepared */
/** @typedef {{layer:number, wire:Wire, reverse:boolean, start:number, span:number, next:null | (() => void)}} Pulse */
/** @typedef {{via:number, start:number, span:number, next:null | (() => void)}} ViaPulse */
/** @typedef {{x:number, y:number, dx:number, dy:number, vx:number, vy:number, phase:number}} Mote */

const W = 600;
const H = 400;
const CORNER = 18;
/** Distance between plates, in plate units, exploded and assembled. */
const GAP = 112;
const REST = 12;
const THICK = [8, 5, 5];
const NAMES = ["01  HARDWARE", "02  PLATFORM OS", "03  SECURE DELIVERY"];
const HOME = { yaw: -32, tilt: 52 };
const RANGE = { yaw: [-64, -4], tilt: [45, 60] };
const RAD = Math.PI / 180;
/** @type {Record<string, number>} */
const RISE = { chip: 9, flash: 6, port: 15, jack: 17, block: 0, signer: 10 };
const MONO = '"Spline Sans Mono", ui-monospace, "SF Mono", Menlo, monospace';

/** When each layer, and the vias above it, powers up after load (ms). */
const LAYER_AT = [150, 1150, 2000];
const LAYER_SPAN = 800;
const VIA_AT = [900, 1750];
const VIA_SPAN = 320;
const MOTES_AT = 2500;
const BOOTED_AT = 3400;

/**
 * Canvas colors for each theme. Light mode sits on cream paper; dark mode is
 * a deep sky. The lowest plate is smoked glass, the two above it are clear.
 */
const PALETTE = {
  light: {
    shadow: "rgba(46, 62, 84, 0.26)",
    via: "rgba(52, 104, 152, 0.5)",
    viaLive: "#2a84d6",
    viaGlow: "rgba(48, 140, 228, 0.35)",
    gold: "#c1932f",
    mote: "#bfdff6",
    glint: "#ffffff",
    plates: [
      {
        faceA: "rgba(31, 68, 104, 0.93)",
        faceB: "rgba(14, 38, 64, 0.96)",
        sideTop: "#3f76a8",
        sideBottom: "#0a1f35",
        rim: "rgba(170, 214, 247, 0.9)",
        edge: "rgba(6, 22, 40, 0.55)",
        sheen: 0.1,
        trace: "rgba(124, 172, 212, 0.5)",
        on: "rgba(150, 205, 246, 0.92)",
        live: "#e4f4ff",
        glow: "rgba(110, 196, 255, 0.55)",
        ink: "rgba(196, 222, 242, 0.8)",
        pad: "#e7c46c",
        idlePad: "rgba(231, 196, 108, 0.42)",
        bodyTop: "#0b1d30",
        bodySide: "#050f1a",
        bodyRim: "rgba(150, 196, 232, 0.6)",
        bodyInk: "rgba(214, 233, 247, 0.92)",
        tile: "rgba(255, 255, 255, 0.08)",
      },
      {
        faceA: "rgba(255, 255, 255, 0.8)",
        faceB: "rgba(222, 238, 250, 0.62)",
        sideTop: "#ffffff",
        sideBottom: "#9cc4e4",
        rim: "rgba(255, 255, 255, 0.98)",
        edge: "rgba(52, 100, 146, 0.4)",
        sheen: 0.34,
        trace: "rgba(40, 96, 148, 0.42)",
        on: "rgba(27, 104, 178, 0.9)",
        live: "#0f5aa6",
        glow: "rgba(40, 132, 224, 0.3)",
        ink: "rgba(18, 48, 78, 0.78)",
        pad: "#b88a2b",
        idlePad: "rgba(184, 138, 43, 0.4)",
        bodyTop: "#12314e",
        bodySide: "#081a2c",
        bodyRim: "rgba(255, 255, 255, 0.9)",
        bodyInk: "rgba(16, 44, 72, 0.92)",
        tile: "rgba(255, 255, 255, 0.56)",
      },
      {
        faceA: "rgba(255, 255, 255, 0.76)",
        faceB: "rgba(226, 240, 251, 0.56)",
        sideTop: "#ffffff",
        sideBottom: "#a9cdea",
        rim: "rgba(255, 255, 255, 0.98)",
        edge: "rgba(52, 100, 146, 0.4)",
        sheen: 0.4,
        trace: "rgba(40, 96, 148, 0.42)",
        on: "rgba(27, 104, 178, 0.9)",
        live: "#0f5aa6",
        glow: "rgba(40, 132, 224, 0.3)",
        ink: "rgba(18, 48, 78, 0.78)",
        pad: "#b88a2b",
        idlePad: "rgba(184, 138, 43, 0.4)",
        bodyTop: "#143654",
        bodySide: "#071828",
        bodyRim: "rgba(190, 224, 250, 0.75)",
        bodyInk: "rgba(214, 233, 247, 0.92)",
        tile: "rgba(255, 255, 255, 0.5)",
      },
    ],
  },
  dark: {
    shadow: "rgba(0, 8, 20, 0.6)",
    via: "rgba(140, 200, 250, 0.4)",
    viaLive: "#bfe6ff",
    viaGlow: "rgba(110, 200, 255, 0.5)",
    gold: "#f0cd78",
    mote: "#9fd6ff",
    glint: "#ffffff",
    plates: [
      {
        faceA: "rgba(22, 74, 122, 0.8)",
        faceB: "rgba(8, 36, 66, 0.9)",
        sideTop: "#5db4f5",
        sideBottom: "#0a2a4b",
        rim: "rgba(158, 216, 255, 0.92)",
        edge: "rgba(0, 8, 20, 0.6)",
        sheen: 0.1,
        trace: "rgba(120, 186, 240, 0.4)",
        on: "rgba(150, 212, 255, 0.92)",
        live: "#f2faff",
        glow: "rgba(96, 190, 255, 0.6)",
        ink: "rgba(205, 232, 252, 0.82)",
        pad: "#f0cd78",
        idlePad: "rgba(240, 205, 120, 0.42)",
        bodyTop: "#061a2e",
        bodySide: "#020c17",
        bodyRim: "rgba(130, 196, 248, 0.62)",
        bodyInk: "rgba(220, 240, 255, 0.92)",
        tile: "rgba(140, 200, 255, 0.1)",
      },
      {
        faceA: "rgba(150, 208, 255, 0.24)",
        faceB: "rgba(70, 150, 230, 0.13)",
        sideTop: "#c9e8ff",
        sideBottom: "#3d8fd6",
        rim: "rgba(206, 235, 255, 0.92)",
        edge: "rgba(0, 10, 24, 0.5)",
        sheen: 0.16,
        trace: "rgba(160, 214, 255, 0.4)",
        on: "rgba(180, 226, 255, 0.92)",
        live: "#ffffff",
        glow: "rgba(110, 200, 255, 0.55)",
        ink: "rgba(226, 242, 255, 0.86)",
        pad: "#f0cd78",
        idlePad: "rgba(240, 205, 120, 0.42)",
        bodyTop: "#07203a",
        bodySide: "#03111f",
        bodyRim: "rgba(206, 235, 255, 0.8)",
        bodyInk: "rgba(232, 245, 255, 0.95)",
        tile: "rgba(160, 214, 255, 0.16)",
      },
      {
        faceA: "rgba(160, 214, 255, 0.22)",
        faceB: "rgba(80, 160, 236, 0.11)",
        sideTop: "#d6eeff",
        sideBottom: "#4697dc",
        rim: "rgba(214, 238, 255, 0.94)",
        edge: "rgba(0, 10, 24, 0.5)",
        sheen: 0.18,
        trace: "rgba(160, 214, 255, 0.4)",
        on: "rgba(180, 226, 255, 0.92)",
        live: "#ffffff",
        glow: "rgba(110, 200, 255, 0.55)",
        ink: "rgba(226, 242, 255, 0.86)",
        pad: "#f0cd78",
        idlePad: "rgba(240, 205, 120, 0.42)",
        bodyTop: "#06203a",
        bodySide: "#020e1b",
        bodyRim: "rgba(190, 228, 255, 0.8)",
        bodyInk: "rgba(232, 245, 255, 0.95)",
        tile: "rgba(160, 214, 255, 0.14)",
      },
    ],
  },
};

/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Blend two #rrggbb colors. @param {string} from @param {string} to @param {number} t */
function blend(from, to, t) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channel = (/** @type {number} */ shift) =>
    Math.round(
      ((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t,
    );
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/**
 * @param {HTMLElement} stage element containing one <canvas>
 * @param {{onBooted?: () => void}} [hooks]
 */
export function createExhibit(stage, hooks = {}) {
  const candidate = stage.querySelector("canvas");
  if (!(candidate instanceof HTMLCanvasElement)) return null;
  const canvas = candidate;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const ctx = context;
  const root = document.documentElement;

  const caches = [0, 1, 2].map(() => document.createElement("canvas"));
  const cacheKeys = ["", "", ""];
  /** A pyramid of half-size copies: halving down and doubling back up is a smooth, cheap blur. */
  const pyramid = [0, 1, 2, 3].map(() => document.createElement("canvas"));
  let blurLevels = 3;

  const plate = new Path2D();
  plate.roundRect(-W / 2, -H / 2, W, H, CORNER);

  let width = 1;
  let height = 1;
  let dpr = 1;
  let scale = 1;
  let centerX = 0;
  let centerY = 0;
  /** @type {Board | null} */
  let board = null;
  let boardVersion = 0;
  /** @type {Prepared[]} */
  let prepared = [];
  let palette = PALETTE.light;
  /** @type {"light" | "dark"} */
  let themeName = "light";

  const view = { yaw: HOME.yaw, tilt: HOME.tilt, explode: 1 };
  const base = { yaw: HOME.yaw, tilt: HOME.tilt };
  const hover = { yaw: 0, tilt: 0 };
  let explodeTarget = 1;
  let spin = 0;
  const fade = [1, 1, 1];
  const fadeTarget = [1, 1, 1];

  const powered = [false, false, false];
  const viaLive = [false, false];
  const flash = [0, 0, 0];
  let clock = 0;
  let booted = false;
  let bootReported = false;
  /** @type {Pulse[]} */
  let pulses = [];
  /** @type {ViaPulse[]} */
  let viaPulses = [];
  let nextPacket = 0;

  /** @type {Mote[]} */
  let motes = [];
  let motesShown = 0;
  const chip = { x: 0, y: 0, w: 260, h: 180 };
  const pointer = {
    x: 0,
    y: 0,
    active: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  let frame = 0;
  let last = 0;
  let visible = true;

  const motionOn = () => root.dataset.motion !== "paused";
  const ux = (/** @type {number} */ x) => x * (board ? board.cell : 10) - W / 2;
  const uy = (/** @type {number} */ y) => y * (board ? board.cell : 10) - H / 2;

  /** The affine map from plate units to CSS pixels, for a plate at height zero. */
  function basis() {
    const yaw = view.yaw * RAD;
    const flat = Math.cos(view.tilt * RAD);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return {
      a: scale * cos,
      b: scale * sin * flat,
      c: -scale * sin,
      d: scale * cos * flat,
      e: centerX,
      f: centerY,
    };
  }
  /** Screen pixels climbed per plate unit of height. */
  const lift = () => scale * Math.sin(view.tilt * RAD);
  const heightOf = (/** @type {number} */ k) =>
    (k - 1) * (REST + (GAP - REST) * view.explode);

  /** @param {CanvasRenderingContext2D} c @param {Matrix} m @param {number} dy */
  function place(c, m, dy) {
    c.setTransform(
      m.a * dpr,
      m.b * dpr,
      m.c * dpr,
      m.d * dpr,
      m.e * dpr,
      (m.f + dy) * dpr,
    );
  }

  /** Turn the board's nets into reusable paths, in plate units. */
  function prepare() {
    prepared = [];
    if (!board) return;
    for (const layer of board.layers) {
      /** @type {Prepared} */
      const p = {
        traces: new Path2D(),
        power: new Path2D(),
        pads: new Path2D(),
        idlePads: new Path2D(),
        dots: new Path2D(),
        holes: new Path2D(),
        rings: new Path2D(),
        wires: [],
        byId: new Map(),
      };
      for (const net of layer.nets) {
        const path = new Path2D();
        const group = net.kind === "pwr" ? p.power : p.traces;
        for (let i = 0; i < net.points.length; i += 2) {
          const x = ux(net.points[i]);
          const y = uy(net.points[i + 1]);
          if (i === 0) {
            path.moveTo(x, y);
            group.moveTo(x, y);
          } else {
            path.lineTo(x, y);
            group.lineTo(x, y);
          }
        }
        const wire = { path, length: net.length * board.cell, net };
        p.wires.push(wire);
        p.byId.set(net.id, wire);
      }
      for (const part of layer.parts) {
        if (part.kind === "block") continue;
        for (const pin of part.pins) {
          const group = pin.net ? p.pads : p.idlePads;
          const x = ux(pin.x);
          const y = uy(pin.y);
          if (pin.dir === 0 || pin.dir === 4)
            group.rect(pin.dir === 0 ? x - 10 : x - 1.5, y - 2.1, 11.5, 4.2);
          else group.rect(x - 2.1, pin.dir === 2 ? y - 10 : y - 1.5, 4.2, 11.5);
        }
      }
      for (let i = 0; i < layer.dots.length; i += 2) {
        const x = ux(layer.dots[i]);
        const y = uy(layer.dots[i + 1]);
        p.dots.moveTo(x + 3, y);
        p.dots.arc(x, y, 3, 0, Math.PI * 2);
      }
      for (let i = 0; i < layer.holes.length; i += 2) {
        const x = ux(layer.holes[i]);
        const y = uy(layer.holes[i + 1]);
        p.holes.moveTo(x + 5, y);
        p.holes.arc(x, y, 5, 0, Math.PI * 2);
      }
      for (const via of board.vias) {
        if (via.lower !== layer.index && via.lower + 1 !== layer.index)
          continue;
        const x = ux(via.x);
        const y = uy(via.y);
        const r = via.through ? 5 : 3.8;
        p.rings.moveTo(x + r, y);
        p.rings.arc(x, y, r, 0, Math.PI * 2);
      }
      prepared.push(p);
    }
    const signer = board.layers[2].parts.find((part) => part.kind === "signer");
    if (signer) {
      chip.w = (signer.x1 - signer.x0) * board.cell;
      chip.h = (signer.y1 - signer.y0) * board.cell;
      chip.x = ux(signer.x0) + chip.w / 2;
      chip.y = uy(signer.y0) + chip.h / 2;
    }
  }

  /** Sample the monogram into points that sit on the top chip. */
  function seedMotes() {
    const mask = document.createElement("canvas");
    mask.width = 640;
    mask.height = 420;
    const m = mask.getContext("2d", { willReadFrequently: true });
    if (!m) return;
    const family =
      getComputedStyle(root).getPropertyValue("--display").trim() ||
      "sans-serif";
    m.font = `700 330px ${family}`;
    m.textAlign = "center";
    m.textBaseline = "alphabetic";
    m.fillStyle = "#fff";
    m.fillText("VG", 320, 322);
    const pixels = m.getImageData(0, 0, 640, 420).data;
    const fit = Math.min((chip.w * 0.8) / 520, (chip.h * 0.7) / 250);
    const previous = motes;
    motes = [];
    for (let y = 30; y < 390; y += 5)
      for (let x = 30; x < 610; x += 5) {
        if (pixels[(y * 640 + x) * 4 + 3] < 150) continue;
        const noise = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const phase = noise - Math.floor(noise);
        const old = previous[motes.length];
        motes.push({
          x: (x - 320) * fit,
          y: (y - 205) * fit,
          dx: old ? old.dx : 0,
          dy: old ? old.dy : 0,
          vx: 0,
          vy: 0,
          phase,
        });
      }
  }

  function scatterMotes() {
    for (const mote of motes) {
      const angle = mote.phase * 41;
      const reach = 120 + ((mote.phase * 977) % 1) * 220;
      mote.dx = Math.cos(angle) * reach;
      mote.dy = Math.sin(angle) * reach;
      mote.vx = mote.vy = 0;
    }
  }

  function readTheme() {
    themeName = root.dataset.theme === "dark" ? "dark" : "light";
    palette = PALETTE[themeName];
  }

  function resize() {
    width = Math.max(1, stage.clientWidth);
    height = Math.max(1, stage.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * dpr);
    const pixelsHigh = Math.round(height * dpr);
    for (const target of [canvas, ...caches]) {
      // Assigning either dimension clears a canvas, even if the value is unchanged.
      if (target.width !== pixelsWide || target.height !== pixelsHigh) {
        target.width = pixelsWide;
        target.height = pixelsHigh;
        cacheKeys.fill("");
      }
    }
    // Fit the exploded stack, at its home pose, inside the stage.
    const yaw = HOME.yaw * RAD;
    const tilt = HOME.tilt * RAD;
    const spanX = W * Math.abs(Math.cos(yaw)) + H * Math.abs(Math.sin(yaw));
    const spanY =
      Math.cos(tilt) *
        (W * Math.abs(Math.sin(yaw)) + H * Math.abs(Math.cos(yaw))) +
      Math.sin(tilt) * (2 * GAP + 34);
    scale = Math.min((width * 0.95) / spanX, (height * 0.93) / spanY);
    centerX = width / 2;
    centerY = height / 2 + 6;
    blurLevels = dpr > 1.5 ? 4 : 3;
    pyramid.forEach((level, i) => {
      level.width = Math.max(1, Math.ceil(pixelsWide / 2 ** (i + 1)));
      level.height = Math.max(1, Math.ceil(pixelsHigh / 2 ** (i + 1)));
    });
    invalidate();
  }

  /**
   * A raised part: its footprint swept upward, then capped.
   * @param {CanvasRenderingContext2D} c @param {Matrix} m @param {Part} part
   * @param {typeof PALETTE.light.plates[0]} style @param {number} k
   */
  function drawPart(c, m, part, style, k) {
    if (!board) return;
    const x = ux(part.x0);
    const y = uy(part.y0);
    const w = (part.x1 - part.x0) * board.cell;
    const h = (part.y1 - part.y0) * board.cell;
    const body = new Path2D();
    body.roundRect(x, y, w, h, part.kind === "block" ? 8 : 4);
    if (part.kind === "block") {
      place(c, m, 0);
      c.fillStyle = style.tile;
      c.fill(body);
      c.strokeStyle = style.rim;
      c.lineWidth = 1.3 / scale;
      c.stroke(body);
      c.fillStyle = style.bodyInk;
      c.font = `600 ${part.label.length > 6 ? 13 : 14}px ${MONO}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(part.label, x + w / 2, y + h / 2 + 1);
      return;
    }
    const rise = Math.max(2, Math.round((RISE[part.kind] || 6) * lift()));
    const light = part.kind === "port" || part.kind === "jack";
    for (let i = 0; i < rise; i++) {
      place(c, m, -i);
      c.fillStyle = light
        ? blend("#1b3550", "#7fa3c2", i / rise)
        : blend(style.bodySide, style.bodyTop, (i / rise) * 0.6);
      c.fill(body);
    }
    place(c, m, -rise);
    if (part.kind === "signer") {
      const gradient = c.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, themeName === "dark" ? "#0d3558" : "#234f78");
      gradient.addColorStop(1, style.bodyTop);
      c.fillStyle = gradient;
    } else c.fillStyle = light ? "#122a42" : style.bodyTop;
    c.fill(body);
    c.strokeStyle = light ? "rgba(190, 216, 236, 0.85)" : style.bodyRim;
    c.lineWidth = 1.2 / scale;
    c.stroke(body);
    if (part.kind === "signer" || part.kind === "port") return;
    c.fillStyle = k === 0 ? style.bodyInk : "rgba(214, 233, 247, 0.92)";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `600 ${part.kind === "chip" ? 13 : 10.5}px ${MONO}`;
    c.fillText(
      part.label,
      x + w / 2,
      y + h / 2 + (part.label === "CPU" ? -6 : 1),
    );
    if (part.label === "CPU") {
      c.globalAlpha = 0.6;
      c.font = `500 9.5px ${MONO}`;
      c.fillText(`REV ${board.rev}`, x + w / 2, y + h / 2 + 11);
      c.globalAlpha = 1;
    }
    if (part.kind === "chip") {
      c.beginPath();
      c.arc(x + 9, y + 9, 2.2, 0, Math.PI * 2);
      c.globalAlpha = 0.55;
      c.fill();
      c.globalAlpha = 1;
    }
  }

  /** Render one plate, at height zero, into its cache. @param {number} k */
  function renderPlate(k) {
    const target = caches[k];
    const c = target.getContext("2d");
    if (!c || !board) return;
    const style = palette.plates[k];
    const p = prepared[k];
    const m = basis();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, target.width, target.height);
    const depth = Math.max(2, Math.round(THICK[k] * lift()));

    if (k === 0) {
      // Only the shadow lands on the canvas: the shape itself is drawn far above it.
      const away = 4000;
      c.save();
      c.shadowColor = palette.shadow;
      c.shadowBlur = 34 * dpr;
      c.shadowOffsetY = away * dpr;
      place(c, m, depth + 30 * scale - away);
      c.fillStyle = "#000";
      c.fill(plate);
      c.restore();
    }

    // The slab's polished edge, swept from the underside up to the face.
    for (let i = depth; i >= 1; i--) {
      place(c, m, i);
      c.fillStyle = blend(style.sideBottom, style.sideTop, 1 - (i - 1) / depth);
      c.fill(plate);
    }
    place(c, m, 0);
    c.globalCompositeOperation = "destination-out";
    c.fill(plate);
    c.globalCompositeOperation = "source-over";

    const face = c.createLinearGradient(-W / 2, -H / 2, W / 2, H / 2);
    face.addColorStop(0, style.faceA);
    face.addColorStop(1, style.faceB);
    c.fillStyle = face;
    c.fill(plate);

    // A soft band of reflected light that slides as the model turns.
    const at = clamp(0.46 + (view.yaw - HOME.yaw) * 0.012, 0.12, 0.88);
    const sheen = c.createLinearGradient(-W / 2, H / 2, W / 2, -H / 2);
    sheen.addColorStop(clamp(at - 0.2, 0, 1), "rgba(255, 255, 255, 0)");
    sheen.addColorStop(at, `rgba(255, 255, 255, ${style.sheen})`);
    sheen.addColorStop(clamp(at + 0.16, 0, 1), "rgba(255, 255, 255, 0)");
    c.fillStyle = sheen;
    c.fill(plate);

    const hair = Math.max(1.9, 1.2 / scale);
    c.lineJoin = "round";
    c.lineCap = "round";
    if (powered[k]) {
      c.strokeStyle = style.glow;
      c.globalAlpha = 0.35;
      c.lineWidth = hair * 3.4;
      c.stroke(p.traces);
      c.globalAlpha = 1;
    }
    c.strokeStyle = powered[k] ? style.on : style.trace;
    c.lineWidth = hair;
    c.stroke(p.traces);
    c.lineWidth = hair * 2;
    c.stroke(p.power);

    c.fillStyle = style.idlePad;
    c.fill(p.idlePads);
    c.fillStyle = style.pad;
    c.fill(p.pads);
    c.fill(p.dots);
    c.strokeStyle = palette.gold;
    c.lineWidth = 1.7;
    c.stroke(p.rings);
    c.strokeStyle = style.ink;
    c.lineWidth = 1.2;
    c.globalAlpha = 0.7;
    c.stroke(p.holes);
    c.globalAlpha = 1;

    for (const part of board.layers[k].parts) drawPart(c, m, part, style, k);

    place(c, m, 0);
    c.fillStyle = style.ink;
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.font = `600 11px ${MONO}`;
    c.fillText(NAMES[k], -W / 2 + 50, H / 2 - 15);
    if (k === 2) {
      c.textAlign = "right";
      c.fillText(`VG-01  REV ${board.rev}`, W / 2 - 46, -H / 2 + 24);
    }

    // The rim: a dark hairline for definition, then the bright edge of the glass.
    c.strokeStyle = style.edge;
    c.lineWidth = 2.6 / scale;
    c.stroke(plate);
    c.strokeStyle = style.rim;
    c.lineWidth = 1.25 / scale;
    c.stroke(plate);
  }

  /**
   * Frost whatever lies beneath a sheet of glass: the pixels under plate k are
   * swapped for a blurred copy of themselves before the glass is laid on top.
   * @param {number} k @param {Matrix} m @param {number} dy @param {number} amount
   */
  function frost(k, m, dy, amount) {
    /** @type {HTMLCanvasElement} */
    let source = canvas;
    for (let i = 0; i < blurLevels; i++) {
      const level = pyramid[i];
      const c = level.getContext("2d");
      if (!c) return;
      c.clearRect(0, 0, level.width, level.height);
      c.drawImage(source, 0, 0, level.width, level.height);
      source = level;
    }
    for (let i = blurLevels - 2; i >= 0; i--) {
      const level = pyramid[i];
      const c = level.getContext("2d");
      if (!c) return;
      c.clearRect(0, 0, level.width, level.height);
      c.drawImage(pyramid[i + 1], 0, 0, level.width, level.height);
    }
    ctx.save();
    place(ctx, m, dy);
    ctx.clip(plate);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = amount;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(pyramid[0], 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /** How far along its power-up a net is, 0 to 1. @param {number} k @param {Net} net */
  function progress(k, net) {
    const start = LAYER_AT[k] + net.delay * LAYER_SPAN * 0.5;
    const span = clamp(net.length * 16, 140, LAYER_SPAN * 0.5);
    return clamp((clock - start) / span, 0, 1);
  }

  /**
   * Everything on plate k that is moving.
   * @param {number} k @param {Matrix} m @param {number} dy
   * @returns {boolean} whether anything was drawn
   */
  function drawLive(k, m, dy) {
    let drawn = false;
    const p = prepared[k];
    const style = palette.plates[k];
    const hair = Math.max(1.9, 1.2 / scale);
    place(ctx, m, dy);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const alpha = fade[k];
    if (!powered[k] && clock > LAYER_AT[k]) {
      for (const wire of p.wires) {
        const amount = progress(k, wire.net);
        if (amount <= 0) continue;
        drawn = true;
        const thick = wire.net.kind === "pwr" ? 2 : 1;
        ctx.setLineDash([amount * wire.length, wire.length + 20]);
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = style.glow;
        ctx.lineWidth = hair * 3.6 * thick;
        ctx.stroke(wire.path);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = style.live;
        ctx.lineWidth = hair * thick;
        ctx.stroke(wire.path);
      }
    }
    if (flash[k] > 0.01) {
      drawn = true;
      ctx.setLineDash([]);
      ctx.globalAlpha = alpha * flash[k];
      ctx.strokeStyle = style.live;
      ctx.lineWidth = hair;
      ctx.stroke(p.traces);
      ctx.lineWidth = hair * 2;
      ctx.stroke(p.power);
    }
    for (const pulse of pulses) {
      if (pulse.layer !== k) continue;
      drawn = true;
      const t = clamp((clock - pulse.start) / pulse.span, 0, 1);
      const { wire } = pulse;
      const run = Math.min(34, wire.length * 0.6);
      const head = (pulse.reverse ? 1 - t : t) * (wire.length + run) - run;
      ctx.setLineDash([run, wire.length + run + 40]);
      ctx.lineDashOffset = -head;
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = style.glow;
      ctx.lineWidth = hair * 4.2;
      ctx.stroke(wire.path);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = style.live;
      ctx.lineWidth = hair * 1.25;
      ctx.stroke(wire.path);
      ctx.lineDashOffset = 0;
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    return drawn;
  }

  /**
   * Raised parts stand in front of the copper behind them, so after live copper
   * is drawn they are laid back on top.
   * @param {number} k @param {Matrix} m @param {number} dy
   */
  function drawRaised(k, m, dy) {
    if (!board) return;
    const lifted = { ...m, f: m.f + dy };
    ctx.globalAlpha = fade[k];
    for (const part of board.layers[k].parts)
      if (part.kind !== "block")
        drawPart(ctx, lifted, part, palette.plates[k], k);
    ctx.globalAlpha = 1;
  }

  /** The vias climbing from plate k to the one above. @param {number} k @param {Matrix} m */
  function drawVias(k, m) {
    if (!board) return;
    const up = lift();
    const from = heightOf(k) * up;
    const to = (heightOf(k + 1) - THICK[k + 1]) * up;
    if (from - to > -3) return;
    const alpha = Math.min(fade[k], fade[k + 1]);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    const lit = viaLive[k] ? 1 : clamp((clock - VIA_AT[k]) / VIA_SPAN, 0, 1);
    board.vias.forEach((via, index) => {
      if (via.lower !== k) return;
      const x = ux(via.x);
      const y = uy(via.y);
      const sx = m.e + m.a * x + m.c * y;
      const sy = m.f + m.b * x + m.d * y;
      const y0 = sy - from;
      const y1 = sy - to;
      const wide = via.through ? 3 : 2;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = via.through ? palette.gold : palette.via;
      ctx.lineWidth = wide;
      ctx.beginPath();
      ctx.moveTo(sx, y0);
      ctx.lineTo(sx, y1);
      ctx.stroke();
      if (lit > 0) {
        const top = y0 + (y1 - y0) * lit;
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = palette.viaGlow;
        ctx.lineWidth = wide + 5;
        ctx.beginPath();
        ctx.moveTo(sx, y0);
        ctx.lineTo(sx, top);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = via.through ? palette.gold : palette.viaLive;
        ctx.lineWidth = wide;
        ctx.beginPath();
        ctx.moveTo(sx, y0);
        ctx.lineTo(sx, top);
        ctx.stroke();
      }
      for (const pulse of viaPulses) {
        if (pulse.via !== index) continue;
        const t = clamp((clock - pulse.start) / pulse.span, 0, 1);
        const py = y0 + (y1 - y0) * t;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = palette.viaGlow;
        ctx.beginPath();
        ctx.arc(sx, py, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = palette.glint;
        ctx.beginPath();
        ctx.arc(sx, py, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  /** The monogram: points of light resting on the top chip. @param {Matrix} m */
  function drawMotes(m) {
    if (motesShown <= 0.01 || !motes.length) return;
    const up = lift();
    const top = heightOf(2) + RISE.signer;
    const size = clamp(scale / 0.78, 0.7, 1.3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (const mote of motes) {
        const moved = Math.min(1, Math.hypot(mote.dx, mote.dy) / 40);
        const bright = moved > 0.18 || mote.phase > 0.84;
        if (bright !== (pass === 1)) continue;
        const float = motionOn()
          ? 2.4 + Math.sin(clock * 0.0011 + mote.phase * 6.283) * 2.2
          : 2.4;
        const x = chip.x + mote.x + mote.dx;
        const y = chip.y + mote.y + mote.dy;
        const sx = m.e + m.a * x + m.c * y;
        const sy = m.f + m.b * x + m.d * y - (top + float + moved * 26) * up;
        const r = (0.72 + mote.phase * 0.5 + moved * 0.5) * size;
        ctx.moveTo(sx + r, sy);
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
      }
      ctx.globalAlpha = fade[2] * motesShown * (pass === 1 ? 1 : 0.86);
      ctx.fillStyle = pass === 1 ? palette.glint : palette.mote;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!board || !prepared.length) return;
    const m = basis();
    const up = lift();
    const key = `${boardVersion}|${themeName}|${view.yaw.toFixed(3)}|${view.tilt.toFixed(3)}|${scale.toFixed(4)}|${canvas.width}x${canvas.height}`;
    for (let k = 0; k < 3; k++) {
      const layerKey = `${key}|${powered[k]}`;
      if (cacheKeys[k] !== layerKey) {
        renderPlate(k);
        cacheKeys[k] = layerKey;
      }
      const dy = -heightOf(k) * up;
      if (k > 0 && fade[k] > 0.03) frost(k, m, dy, fade[k]);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = fade[k];
      ctx.drawImage(caches[k], 0, Math.round(dy * dpr));
      ctx.globalAlpha = 1;
      if (drawLive(k, m, dy)) drawRaised(k, m, dy);
      if (k < 2) drawVias(k, m);
    }
    drawMotes(m);
  }

  /** Send a packet up through the stack: along a net, up a via, along the next. */
  function launchPacket() {
    if (!board || !board.vias.length) return;
    const pick = Math.floor(Math.random() * board.vias.length);
    const via = board.vias[pick];
    const below = prepared[via.lower].byId.get(via.netBelow);
    const above = prepared[via.lower + 1].byId.get(via.netAbove);
    if (!below || !above) return;
    const endsAtVia = (/** @type {Wire} */ wire) => {
      const { points } = wire.net;
      return (
        points[points.length - 2] === via.x &&
        points[points.length - 1] === via.y
      );
    };
    const run = (/** @type {Wire} */ wire) =>
      clamp(wire.length * 5.2, 260, 900);
    pulses.push({
      layer: via.lower,
      wire: below,
      reverse: !endsAtVia(below),
      start: clock,
      span: run(below),
      next: () => {
        viaPulses.push({
          via: pick,
          start: clock,
          span: 300,
          next: () => {
            pulses.push({
              layer: via.lower + 1,
              wire: above,
              reverse: endsAtVia(above),
              start: clock,
              span: run(above),
              next: null,
            });
          },
        });
      },
    });
  }

  /** A lone pulse along one of the buses. */
  function launchPulse() {
    const k = Math.random() < 0.6 ? 0 : Math.random() < 0.5 ? 1 : 2;
    const wires = prepared[k].wires.filter(
      (wire) => wire.net.kind !== "stub" && wire.length > 40,
    );
    const wire = wires[Math.floor(Math.random() * wires.length)];
    if (!wire) return;
    pulses.push({
      layer: k,
      wire,
      reverse: Math.random() < 0.5,
      start: clock,
      span: clamp(wire.length * 5.2, 260, 900),
      next: null,
    });
  }

  /** Advance the model. @param {number} dt milliseconds @returns {boolean} whether to keep animating */
  function step(dt) {
    if (!board) return false;
    let busy = false;
    const ease = 1 - Math.exp(-dt / 130);
    const motion = motionOn();

    if (!motion) spin = 0;
    if (motion && !pointer.dragging && Math.abs(spin) > 0.002) {
      base.yaw = clamp(base.yaw + spin * dt, RANGE.yaw[0], RANGE.yaw[1]);
      spin *= Math.exp(-dt / 260);
      busy = true;
    }
    const yawTo = clamp(
      base.yaw + (motion ? hover.yaw : 0),
      RANGE.yaw[0] - 6,
      RANGE.yaw[1] + 6,
    );
    const tiltTo = clamp(
      base.tilt + (motion ? hover.tilt : 0),
      RANGE.tilt[0] - 3,
      RANGE.tilt[1] + 3,
    );
    for (const [
      name,
      to,
    ] of /** @type {["yaw"|"tilt"|"explode", number][]} */ ([
      ["yaw", yawTo],
      ["tilt", tiltTo],
      ["explode", explodeTarget],
    ])) {
      const gap = to - view[name];
      if (Math.abs(gap) > (name === "explode" ? 0.0015 : 0.02)) {
        view[name] += gap * (motion ? ease : 1);
        busy = true;
      } else view[name] = to;
    }
    for (let k = 0; k < 3; k++) {
      const gap = fadeTarget[k] - fade[k];
      if (Math.abs(gap) > 0.004) {
        fade[k] += gap * (motion ? ease : 1);
        busy = true;
      } else fade[k] = fadeTarget[k];
    }

    if (motion) {
      clock += dt;
      busy = true;
      for (let k = 0; k < 3; k++) {
        if (!powered[k] && clock >= LAYER_AT[k] + LAYER_SPAN) {
          powered[k] = true;
          flash[k] = 1;
        }
        if (flash[k] > 0) flash[k] = Math.max(0, flash[k] - dt / 700);
      }
      for (let k = 0; k < 2; k++)
        if (clock >= VIA_AT[k] + VIA_SPAN) viaLive[k] = true;
      if (clock >= MOTES_AT) motesShown = Math.min(1, motesShown + dt / 500);
      if (!booted && clock >= BOOTED_AT) booted = true;
      if (booted) {
        if (clock >= nextPacket) {
          if (Math.random() < 0.62) launchPacket();
          else launchPulse();
          nextPacket = clock + 420 + Math.random() * 900;
        }
      }
      const finished = pulses.filter(
        (pulse) => clock - pulse.start >= pulse.span,
      );
      pulses = pulses.filter((pulse) => clock - pulse.start < pulse.span);
      for (const pulse of finished) pulse.next?.();
      const arrived = viaPulses.filter(
        (pulse) => clock - pulse.start >= pulse.span,
      );
      viaPulses = viaPulses.filter((pulse) => clock - pulse.start < pulse.span);
      for (const pulse of arrived) pulse.next?.();
    }
    if (booted && !bootReported) {
      bootReported = true;
      hooks.onBooted?.();
    }

    // The monogram: each point is sprung to its home and pushed by the pointer.
    const n = dt / 16.67;
    let target = null;
    if (motion && pointer.active && motesShown > 0.5) {
      const m = basis();
      const qx = pointer.x - m.e;
      const qy = pointer.y - (m.f - (heightOf(2) + RISE.signer) * lift());
      const det = m.a * m.d - m.b * m.c;
      target = {
        x: (m.d * qx - m.c * qy) / det - chip.x,
        y: (-m.b * qx + m.a * qy) / det - chip.y,
      };
    }
    const settle = clock >= MOTES_AT || !motion;
    for (const mote of motes) {
      if (target) {
        const ox = mote.x + mote.dx - target.x;
        const oy = mote.y + mote.dy - target.y;
        const distance = Math.hypot(ox, oy);
        if (distance < 46) {
          const push = (1 - distance / 46) ** 2 * 3.4;
          const safe = Math.max(distance, 1);
          mote.vx += (ox / safe) * push * n;
          mote.vy += (oy / safe) * push * n;
        }
      }
      if (!settle) continue;
      mote.vx = (mote.vx - mote.dx * 0.03 * n) * Math.pow(0.85, n);
      mote.vy = (mote.vy - mote.dy * 0.03 * n) * Math.pow(0.85, n);
      mote.dx += mote.vx * n;
      mote.dy += mote.vy * n;
      if (
        Math.abs(mote.dx) +
          Math.abs(mote.dy) +
          Math.abs(mote.vx) +
          Math.abs(mote.vy) >
        0.05
      )
        busy = true;
    }
    return busy || pointer.dragging;
  }

  /** @param {number} now */
  function tick(now) {
    frame = 0;
    if (!visible || document.hidden) return;
    const dt = last ? Math.min(48, now - last) : 16.67;
    last = now;
    const busy = step(dt);
    draw();
    if (busy) frame = requestAnimationFrame(tick);
    else last = 0;
  }

  /** Ask for a frame. Idle scenes cost nothing until something changes. */
  function invalidate() {
    if (!frame && visible && !document.hidden)
      frame = requestAnimationFrame(tick);
  }

  function powerOnInstantly() {
    powered.fill(true);
    viaLive.fill(true);
    flash.fill(0);
    motesShown = 1;
    for (const mote of motes) mote.dx = mote.dy = mote.vx = mote.vy = 0;
    clock = Math.max(clock, BOOTED_AT);
    booted = true;
  }

  // ── Input ────────────────────────────────────────────────────────────────
  /** @param {PointerEvent} event */
  function locate(event) {
    const bounds = stage.getBoundingClientRect();
    pointer.x =
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * width;
    pointer.y =
      ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * height;
  }
  stage.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    locate(event);
    pointer.active = true;
    pointer.dragging = true;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    spin = 0;
    stage.setPointerCapture?.(event.pointerId);
    stage.classList.add("is-dragging");
    invalidate();
  });
  stage.addEventListener(
    "pointermove",
    (event) => {
      locate(event);
      pointer.active = true;
      if (pointer.dragging) {
        const dx = event.clientX - pointer.lastX;
        const dy = event.clientY - pointer.lastY;
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;
        base.yaw = clamp(base.yaw + dx * 0.24, RANGE.yaw[0], RANGE.yaw[1]);
        if (event.pointerType === "mouse")
          base.tilt = clamp(
            base.tilt - dy * 0.12,
            RANGE.tilt[0],
            RANGE.tilt[1],
          );
        spin = clamp(dx * 0.012, -0.12, 0.12);
      } else if (event.pointerType === "mouse") {
        hover.yaw = (pointer.x / width - 0.5) * 9;
        hover.tilt = (pointer.y / height - 0.5) * -5;
      }
      invalidate();
    },
    { passive: true },
  );
  const release = () => {
    pointer.dragging = false;
    stage.classList.remove("is-dragging");
    invalidate();
  };
  stage.addEventListener("pointerup", (event) => {
    release();
    if (event.pointerType !== "mouse") pointer.active = false;
  });
  stage.addEventListener("pointercancel", () => {
    release();
    pointer.active = false;
  });
  stage.addEventListener("pointerleave", () => {
    if (pointer.dragging) return;
    pointer.active = false;
    hover.yaw = hover.tilt = 0;
    invalidate();
  });
  stage.addEventListener("keydown", (event) => {
    const turn = {
      ArrowLeft: [-8, 0],
      ArrowRight: [8, 0],
      ArrowUp: [0, 3],
      ArrowDown: [0, -3],
    }[event.key];
    if (event.key === "Home") {
      base.yaw = HOME.yaw;
      base.tilt = HOME.tilt;
    } else if (turn) {
      base.yaw = clamp(base.yaw + turn[0], RANGE.yaw[0], RANGE.yaw[1]);
      base.tilt = clamp(base.tilt + turn[1], RANGE.tilt[0], RANGE.tilt[1]);
    } else return;
    event.preventDefault();
    invalidate();
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) invalidate();
    },
    { rootMargin: "80px" },
  ).observe(stage);
  document.addEventListener("visibilitychange", () => {
    last = 0;
    invalidate();
  });
  new MutationObserver(() => {
    readTheme();
    if (!motionOn()) powerOnInstantly();
    cacheKeys.fill("");
    invalidate();
  }).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme", "data-motion"],
  });
  void document.fonts.ready.then(() => {
    seedMotes();
    cacheKeys.fill("");
    invalidate();
  });
  readTheme();
  resize();

  return {
    /**
     * Show a board. The first one powers up layer by layer; later ones too,
     * unless motion is paused.
     * @param {Board} next
     */
    load(next) {
      board = next;
      boardVersion++;
      prepare();
      seedMotes();
      pulses = [];
      viaPulses = [];
      powered.fill(false);
      viaLive.fill(false);
      flash.fill(0);
      clock = 0;
      booted = false;
      bootReported = false;
      motesShown = 0;
      nextPacket = BOOTED_AT + 200;
      if (motionOn()) scatterMotes();
      else powerOnInstantly();
      stage.classList.add("is-live");
      cacheKeys.fill("");
      invalidate();
    },
    /** Show one layer alone, or all of them with -1. @param {number} index */
    focus(index) {
      for (let k = 0; k < 3; k++)
        fadeTarget[k] = index < 0 || index === k ? 1 : 0.1;
      invalidate();
    },
    /** @param {boolean} apart */
    explode(apart) {
      explodeTarget = apart ? 1 : 0;
      invalidate();
    },
    /** Repaint now, in the current theme. Used when the theme changes mid-transition. */
    refresh() {
      readTheme();
      cacheKeys.fill("");
      draw();
    },
    /** Draw one settled frame immediately, with no animation in flight. */
    settle() {
      powerOnInstantly();
      view.yaw = base.yaw;
      view.tilt = base.tilt;
      view.explode = explodeTarget;
      for (let k = 0; k < 3; k++) fade[k] = fadeTarget[k];
      cacheKeys.fill("");
      draw();
    },
  };
}
