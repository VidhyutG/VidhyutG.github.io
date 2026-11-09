// @ts-check
/**
 * Generates the three-layer conceptual platform shown in the hero.
 *
 * Every visit seeds a new revision. Parts are placed, nets are requested, and
 * the autorouter in route.js lays the copper. Vias join one layer to the next.
 * The result is plain data, so it can cross a Worker boundary untouched.
 *
 * The model is illustrative. It is not a real board or a Cisco design.
 */
import {
  Grid,
  DX,
  DY,
  FREE,
  BLOCKED,
  corners,
  polylineLength,
} from "./route.js";

export const COLS = 61;
export const ROWS = 41;
/** Plate units per grid step. A plate is 600 x 400 units. */
export const CELL = 10;

/**
 * @typedef {{x:number, y:number, dir:number, net:number}} Pin
 * @typedef {{ref:string, label:string, kind:string, x0:number, y0:number, x1:number, y1:number, pins:Pin[]}} Part
 * @typedef {{id:number, kind:string, points:number[], length:number, delay:number}} Net
 * @typedef {{x:number, y:number, lower:number, through:boolean, netBelow:number, netAbove:number}} Via
 * @typedef {{index:number, name:string, parts:Part[], nets:Net[], dots:number[], holes:number[]}} Layer
 * @typedef {{nets:number, segments:number, unrouted:number, vias:number, ms:number}} Stats
 * @typedef {{seed:number, rev:string, cols:number, rows:number, cell:number, layers:Layer[], vias:Via[], stats:Stats}} Board
 * @typedef {{x:number, y:number, dir:number, pin:Pin|null}} Terminal
 * @typedef {{ids:number[], from:Terminal[], to:Terminal[], kind:string, priority:number, span:number}} Job
 * @typedef {{paths:(number[]|null)[], order:number[], failed:number, length:number}} Attempt
 */

/** A small, fast, seedable generator (mulberry32). @param {number} seed */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIDE_DIR = { E: 0, S: 2, W: 4, N: 6 };

class Builder {
  /** @param {number} index @param {string} name */
  constructor(index, name) {
    this.index = index;
    this.name = name;
    this.grid = new Grid(COLS, ROWS);
    this.grid.block(0, 0, COLS - 1, 0);
    this.grid.block(0, ROWS - 1, COLS - 1, ROWS - 1);
    this.grid.block(0, 0, 0, ROWS - 1);
    this.grid.block(COLS - 1, 0, COLS - 1, ROWS - 1);
    /** @type {Part[]} */ this.parts = [];
    /** @type {Net[]} */ this.nets = [];
    /** @type {number[]} */ this.dots = [];
    /** @type {number[]} */ this.holes = [];
    /** @type {Job[]} */ this.jobs = [];
    /** Where energy enters this layer: the power jack, or the vias from below. */
    /** @type {number[][]} */ this.origins = [];
    this.nextId = 1;
    this.unrouted = 0;
  }

  /**
   * Place a part: block its body and lay a row of pins on the chosen sides.
   * @param {string} ref @param {string} label @param {string} kind
   * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
   * @param {string} sides any of "NESW"
   */
  part(ref, label, kind, x0, y0, x1, y1, sides) {
    /** @type {Pin[]} */
    const pins = [];
    this.grid.block(x0, y0, x1, y1);
    const add = (
      /** @type {number} */ x,
      /** @type {number} */ y,
      /** @type {number} */ dir,
    ) => {
      if (!this.grid.inside(x, y)) return;
      this.grid.block(x, y, x, y);
      pins.push({ x, y, dir, net: 0 });
    };
    if (sides.includes("N"))
      for (let x = x0 + 1; x < x1; x++) add(x, y0 - 1, SIDE_DIR.N);
    if (sides.includes("E"))
      for (let y = y0 + 1; y < y1; y++) add(x1 + 1, y, SIDE_DIR.E);
    if (sides.includes("S"))
      for (let x = x0 + 1; x < x1; x++) add(x, y1 + 1, SIDE_DIR.S);
    if (sides.includes("W"))
      for (let y = y0 + 1; y < y1; y++) add(x0 - 1, y, SIDE_DIR.W);
    const part = { ref, label, kind, x0, y0, x1, y1, pins };
    this.parts.push(part);
    return part;
  }

  /** A mounting hole keeps copper away from itself. @param {number} x @param {number} y */
  hole(x, y) {
    this.grid.block(x - 1, y - 1, x + 1, y + 1);
    this.holes.push(x, y);
  }

  /** @param {number} x @param {number} y */
  free(x, y) {
    return this.grid.at(x, y) === FREE;
  }

  /**
   * Unused pins on one side whose escape node is still open, in order along the side.
   * @param {Part} part @param {keyof typeof SIDE_DIR} side
   */
  pins(part, side) {
    const dir = SIDE_DIR[side];
    return part.pins.filter(
      (pin) =>
        pin.dir === dir &&
        pin.net === 0 &&
        this.free(pin.x + DX[dir], pin.y + DY[dir]),
    );
  }

  /** The node a pin's copper leaves from. @param {Pin} pin @returns {Terminal} */
  pinTerminal(pin) {
    return {
      x: pin.x + DX[pin.dir],
      y: pin.y + DY[pin.dir],
      dir: pin.dir,
      pin,
    };
  }

  /**
   * Queue one net, or a bus of nets that should run together. Both ends of
   * every net are reserved now, so later requests route around them.
   * @param {Terminal[]} from @param {Terminal[]} to @param {string} kind @param {number} priority
   * @returns {number[]} one id per net, 0 where an end was already taken
   */
  connect(from, to, kind, priority) {
    /** @type {Job} */
    const job = { ids: [], from: [], to: [], kind, priority, span: Infinity };
    /** @type {number[]} */
    const ids = [];
    const count = Math.min(from.length, to.length);
    for (let i = 0; i < count; i++) {
      const a = from[i];
      const b = to[i];
      if (
        !this.free(a.x, a.y) ||
        !this.free(b.x, b.y) ||
        (a.x === b.x && a.y === b.y)
      ) {
        this.unrouted++;
        ids.push(0);
        continue;
      }
      const id = this.nextId++;
      this.grid.set(a.x, a.y, id);
      this.grid.set(b.x, b.y, id);
      if (a.pin) a.pin.net = id;
      if (b.pin) b.pin.net = id;
      job.ids.push(id);
      job.from.push(a);
      job.to.push(b);
      job.span = Math.min(job.span, Math.hypot(a.x - b.x, a.y - b.y));
      ids.push(id);
    }
    if (job.ids.length) this.jobs.push(job);
    return ids;
  }

  /**
   * Join two rows of pins as a bus.
   * @param {Pin[]} from @param {Pin[]} to @param {string} kind @param {number} priority
   */
  link(from, to, kind, priority) {
    const count = Math.min(from.length, to.length);
    this.connect(
      from.slice(0, count).map((pin) => this.pinTerminal(pin)),
      to.slice(0, count).map((pin) => this.pinTerminal(pin)),
      kind,
      priority,
    );
  }

  /**
   * The unused pin best placed to reach a point: close, and facing it.
   * @param {number} x @param {number} y @param {Part[]} parts
   * @returns {Pin | null}
   */
  nearestPin(x, y, parts) {
    let best = null;
    let bestScore = Infinity;
    for (const part of parts)
      for (const pin of part.pins) {
        if (pin.net !== 0) continue;
        const ex = pin.x + DX[pin.dir];
        const ey = pin.y + DY[pin.dir];
        if (!this.free(ex, ey)) continue;
        const facing = (x - ex) * DX[pin.dir] + (y - ey) * DY[pin.dir];
        const score = Math.hypot(x - ex, y - ey) + (facing < 0 ? 8 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = pin;
        }
      }
    return best;
  }

  /**
   * Route a job one particular way.
   * @param {Job} job
   * @param {boolean} reversed take the far ends in the opposite order
   * @param {boolean} farFirst route the longest net first instead of the shortest
   * @returns {Attempt}
   */
  attempt(job, reversed, farFirst) {
    const { grid } = this;
    const count = job.ids.length;
    const order = job.ids.map((_, i) => (reversed ? count - 1 - i : i));
    // Hand each far-end node to the net that will arrive there.
    for (let i = 0; i < count; i++)
      grid.set(job.to[order[i]].x, job.to[order[i]].y, job.ids[i]);
    const reach = job.ids.map((_, i) =>
      Math.hypot(
        job.from[i].x - job.to[order[i]].x,
        job.from[i].y - job.to[order[i]].y,
      ),
    );
    const sequence = job.ids
      .map((_, i) => i)
      .sort(
        (p, q) =>
          (farFirst ? reach[q] - reach[p] : reach[p] - reach[q]) || p - q,
      );
    /** @type {(number[]|null)[]} */
    const paths = new Array(count).fill(null);
    let failed = 0;
    let length = 0;
    for (const i of sequence) {
      const a = job.from[i];
      const b = job.to[order[i]];
      const arrive = b.pin ? (b.dir + 4) & 7 : -1;
      const path = grid.route(
        a.x,
        a.y,
        a.pin ? a.dir : -1,
        b.x,
        b.y,
        arrive,
        job.ids[i],
      );
      paths[i] = path;
      if (path) length += path.length;
      else failed++;
    }
    return { paths, order, failed, length };
  }

  /**
   * Route every queued job: tight groups first, short runs before long ones.
   *
   * Which way round a bus should be wired, and which of its nets must go down
   * first so it does not wall in the others, depends on the geometry. Rather
   * than guess, a bus is routed each way on a scratch copy and the tidiest
   * result (fewest failures, then least copper) is kept.
   */
  routeAll() {
    const { grid } = this;
    this.jobs.sort(
      (p, q) =>
        p.priority - q.priority || p.span - q.span || p.ids[0] - q.ids[0],
    );
    for (const job of this.jobs) {
      const owner = grid.owner.slice();
      const diag = grid.diag.slice();
      const restore = () => {
        grid.owner.set(owner);
        grid.diag.set(diag);
      };
      let best = 0;
      let result = this.attempt(job, false, false);
      if (job.ids.length > 1) {
        for (let variant = 1; variant < 4; variant++) {
          restore();
          const other = this.attempt(job, (variant & 1) === 1, variant >= 2);
          if (
            other.failed < result.failed ||
            (other.failed === result.failed && other.length < result.length)
          ) {
            result = other;
            best = variant;
          }
        }
        // Lay the winning variant down for real.
        restore();
        result = this.attempt(job, (best & 1) === 1, best >= 2);
      }
      for (let i = 0; i < job.ids.length; i++) {
        const id = job.ids[i];
        const a = job.from[i];
        const b = job.to[result.order[i]];
        const path = result.paths[i];
        if (a.pin) a.pin.net = path ? id : 0;
        if (b.pin) b.pin.net = path ? id : 0;
        if (!path) {
          if (grid.at(a.x, a.y) === id) grid.set(a.x, a.y, FREE);
          if (grid.at(b.x, b.y) === id) grid.set(b.x, b.y, FREE);
          this.unrouted++;
          continue;
        }
        const nodes = [];
        if (a.pin) nodes.push(a.pin.x, a.pin.y);
        for (const value of path) nodes.push(value);
        if (b.pin) nodes.push(b.pin.x, b.pin.y);
        const points = corners(nodes);
        this.nets.push({
          id,
          kind: job.kind,
          points,
          length: polylineLength(points),
          delay: 0,
        });
      }
    }
    this.jobs.length = 0;
  }

  /**
   * Fan short stubs out of unused pins, each ending in a via pad.
   * @param {() => number} rand @param {number} chance @param {Part[]} parts
   */
  stubs(rand, chance, parts) {
    const { grid } = this;
    for (const part of parts)
      for (const pin of part.pins) {
        if (pin.net !== 0 || rand() > chance) continue;
        const id = this.nextId;
        const nodes = [pin.x, pin.y];
        let x = pin.x;
        let y = pin.y;
        let dir = pin.dir;
        const straight = 1 + Math.floor(rand() * 3);
        const angled = rand() < 0.65 ? 1 + Math.floor(rand() * 3) : 0;
        const turn = rand() < 0.5 ? 1 : -1;
        for (let step = 0; step < straight + angled; step++) {
          if (step === straight) dir = (dir + turn) & 7;
          const nx = x + DX[dir];
          const ny = y + DY[dir];
          if (!this.free(nx, ny)) break;
          if (dir & 1) {
            const cell = Math.min(y, ny) * grid.cols + Math.min(x, nx);
            if (grid.diag[cell] & (DX[dir] * DY[dir] > 0 ? 2 : 1)) break;
            if (grid.at(nx, y) === BLOCKED && grid.at(x, ny) === BLOCKED) break;
          }
          x = nx;
          y = ny;
          nodes.push(x, y);
        }
        if (nodes.length < 4) continue;
        this.nextId++;
        pin.net = id;
        grid.claim(nodes.slice(2), id);
        const points = corners(nodes);
        this.nets.push({
          id,
          kind: "stub",
          points,
          length: polylineLength(points),
          delay: 0,
        });
        this.dots.push(x, y);
      }
  }

  /** Time each net's power-up by its distance from where energy enters the layer. */
  schedule() {
    let far = 1;
    for (const net of this.nets) {
      let nearest = Infinity;
      for (const [ox, oy] of this.origins)
        nearest = Math.min(
          nearest,
          Math.hypot(net.points[0] - ox, net.points[1] - oy),
        );
      net.delay = Number.isFinite(nearest) ? nearest : 0;
      far = Math.max(far, net.delay);
    }
    for (const net of this.nets)
      net.delay = Math.round((net.delay / far) * 1000) / 1000;
  }

  /** @returns {Layer} */
  finish() {
    this.schedule();
    return {
      index: this.index,
      name: this.name,
      parts: this.parts,
      nets: this.nets,
      dots: this.dots,
      holes: this.holes,
    };
  }
}

/**
 * Take `count` neighbouring pins from the middle of a side, optionally shifted.
 * @param {Pin[]} pins @param {number} count @param {number} [shift]
 */
function take(pins, count, shift = 0) {
  const n = Math.min(count, pins.length);
  const start = Math.max(
    0,
    Math.min(pins.length - n, Math.floor((pins.length - n) / 2) + shift),
  );
  return pins.slice(start, start + n);
}

/**
 * @param {number} seed
 * @returns {Board}
 */
export function generateBoard(seed) {
  const started = performance.now();
  const rand = mulberry(seed);
  const jitter = () => Math.floor(rand() * 3) - 1;
  const upTo = (/** @type {number} */ n) => Math.floor(rand() * n);

  const hardware = new Builder(0, "hardware");
  const platform = new Builder(1, "platform");
  const security = new Builder(2, "security");
  const builders = [hardware, platform, security];
  /** @type {Via[]} */
  const vias = [];

  /**
   * Find a node that is open, with open neighbours, on every layer a via touches.
   * @param {number} x @param {number} y @param {Builder[]} layers
   * @returns {[number, number] | null}
   */
  const spot = (x, y, layers) => {
    const offsets = [
      0, 0, 1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, -1, 1, -1, -1, 1, 2, 0, -2, 0,
      0, 2, 0, -2,
    ];
    for (let i = 0; i < offsets.length; i += 2) {
      const px = x + offsets[i];
      const py = y + offsets[i + 1];
      const open = layers.every(
        (layer) =>
          layer.free(px, py) &&
          layer.free(px + 1, py) &&
          layer.free(px - 1, py) &&
          layer.free(px, py + 1) &&
          layer.free(px, py - 1),
      );
      if (open) return [px, py];
    }
    return null;
  };

  /**
   * Drop a via between two adjacent layers and wire both of its ends.
   * @param {Builder} below @param {Builder} above @param {number} x @param {number} y
   * @param {Part[]} sources parts on the lower layer that may feed it
   * @param {Part[]} sinks parts on the upper layer that may receive it
   */
  const via = (below, above, x, y, sources, sinks) => {
    const pinBelow = below.nearestPin(x, y, sources);
    const pinAbove = above.nearestPin(x, y, sinks);
    if (!pinBelow || !pinAbove) return;
    const point = { x, y, dir: -1, pin: null };
    const [netBelow] = below.connect(
      [below.pinTerminal(pinBelow)],
      [point],
      "sig",
      0,
    );
    const [netAbove] = netBelow
      ? above.connect([point], [above.pinTerminal(pinAbove)], "sig", 0)
      : [0];
    vias.push({ x, y, lower: below.index, through: false, netBelow, netAbove });
    above.origins.push([x, y]);
  };

  /**
   * One plated hole through all three layers: the thread that joins the stack.
   * @param {number} x @param {number} y @param {Part} low @param {Part} mid @param {Part} top
   */
  const throughVia = (x, y, low, mid, top) => {
    const p0 = hardware.nearestPin(x, y, [low]);
    const p1 = platform.nearestPin(x, y, [mid]);
    const p2 = security.nearestPin(x, y, [top]);
    if (!p0 || !p1 || !p2) return;
    const point = { x, y, dir: -1, pin: null };
    const [n0] = hardware.connect(
      [hardware.pinTerminal(p0)],
      [point],
      "sig",
      0,
    );
    const [n1] = platform.connect(
      [point],
      [platform.pinTerminal(p1)],
      "sig",
      0,
    );
    const [n2] = security.connect(
      [point],
      [security.pinTerminal(p2)],
      "sig",
      0,
    );
    vias.push({ x, y, lower: 0, through: true, netBelow: n0, netAbove: n1 });
    vias.push({ x, y, lower: 1, through: true, netBelow: n1, netAbove: n2 });
    platform.origins.push([x, y]);
    security.origins.push([x, y]);
  };

  // ── Layer 1 of 3: hardware. Parts, ports, and power. ──────────────────────
  const cpuX = 24 + jitter();
  const cpuY = 11 + jitter();
  const cpu = hardware.part(
    "U1",
    "CPU",
    "chip",
    cpuX,
    cpuY,
    cpuX + 12,
    cpuY + 12,
    "NESW",
  );
  const phyY = 14 + jitter();
  const phy = hardware.part("U2", "PHY", "chip", 7, phyY, 15, phyY + 6, "NESW");
  const switchY = 19 + jitter();
  const fabric = hardware.part(
    "U3",
    "SWITCH",
    "chip",
    44,
    switchY,
    53,
    switchY + 7,
    "NESW",
  );
  const bootX = 40 + jitter();
  const boot = hardware.part(
    "U4",
    "BOOT",
    "flash",
    bootX,
    5,
    bootX + 5,
    9,
    "WE",
  );
  // The front edge belongs to the connectors: no copper runs beneath or between them.
  hardware.grid.block(1, 34, COLS - 2, ROWS - 2);
  /** @type {Part[]} */
  const ports = [];
  for (let i = 0; i < 6; i++)
    ports.push(
      hardware.part(
        `J${i + 1}`,
        "",
        "port",
        6 + i * 6,
        34,
        10 + i * 6,
        37,
        "N",
      ),
    );
  const jack = hardware.part("J7", "PWR", "jack", 47, 33, 53, 37, "N");
  hardware.hole(2, 2);
  hardware.hole(58, 2);
  hardware.hole(2, 38);
  hardware.hole(58, 38);
  hardware.origins.push([50, 33]);

  // ── Layer 2 of 3: platform software, drawn as a block diagram. ────────────
  const firmware = platform.part("B1", "BOOT", "block", 6, 6, 14, 11, "ESW");
  const kernel = platform.part(
    "B2",
    "FXOS / LINUX",
    "block",
    21,
    14,
    39,
    26,
    "NES",
  );
  const qdma = platform.part("B3", "QDMA", "block", 6, 28, 14, 33, "NESW");
  const apps = platform.part("B4", "APPS", "block", 46, 16, 55, 23, "WNS");

  // ── Layer 3 of 3: secure delivery, one large device. ──────────────────────
  const signer = security.part("U9", "VG", "signer", 17, 11, 43, 29, "NESW");
  security.hole(3, 3);
  security.hole(57, 3);
  security.hole(3, 37);
  security.hole(57, 37);

  // Vias are placed and routed first, so buses flow around them.
  const platformParts = [firmware, kernel, qdma, apps];
  /** @type {[number, number, Part][]} */
  const rising = [
    [20 + jitter(), 6, cpu],
    [30 + jitter(), 5, cpu],
    [17, phyY - 4, phy],
    [49 + jitter(), 12, fabric],
    [57, switchY - 3, fabric],
    [52 + jitter(), 7, boot],
    [3, phyY - 4 + jitter(), phy],
  ];
  const through = spot(3, 29, builders);
  if (through) throughVia(through[0], through[1], phy, qdma, signer);
  for (const [x, y, source] of rising) {
    const place = spot(x, y, [hardware, platform]);
    if (place)
      via(hardware, platform, place[0], place[1], [source], platformParts);
  }
  /** @type {[number, number, Part][]} */
  const upper = [
    [10, 20 + jitter(), firmware],
    [36 + jitter(), 6, kernel],
    [53, 11, apps],
    [50 + jitter(), 30, apps],
    [36 + jitter(), 34, kernel],
    [22 + jitter(), 36, qdma],
  ];
  for (const [x, y, source] of upper) {
    const place = spot(x, y, [platform, security]);
    if (place) via(platform, security, place[0], place[1], [source], [signer]);
  }

  // Hardware buses.
  hardware.link(
    take(hardware.pins(phy, "E"), 4 + upTo(2)),
    take(hardware.pins(cpu, "W"), 5),
    "sig",
    1,
  );
  hardware.link(
    take(hardware.pins(cpu, "E"), 4 + upTo(3)),
    take(hardware.pins(fabric, "W"), 6),
    "sig",
    1,
  );
  hardware.link(
    take(hardware.pins(boot, "W"), 3),
    take(hardware.pins(cpu, "N"), 3, 3),
    "sig",
    1,
  );
  // Each pair of front-panel ports fans up to the part directly above it.
  const fan = (/** @type {number} */ first, /** @type {Part} */ target) => {
    const pins = ports
      .slice(first, first + 2)
      .flatMap((port) => take(hardware.pins(port, "N"), 2));
    hardware.link(pins, take(hardware.pins(target, "S"), 4), "sig", 2);
  };
  fan(0, phy);
  fan(2, cpu);
  fan(4, fabric);
  hardware.link(
    take(hardware.pins(jack, "N"), 2, 2),
    take(hardware.pins(fabric, "E"), 2, 2),
    "pwr",
    2,
  );

  // Platform buses.
  platform.link(
    take(platform.pins(firmware, "E"), 2),
    take(platform.pins(kernel, "N"), 2, -5),
    "sig",
    1,
  );
  platform.link(
    take(platform.pins(qdma, "E"), 3),
    take(platform.pins(kernel, "S"), 3, -5),
    "sig",
    1,
  );
  platform.link(
    take(platform.pins(kernel, "E"), 4),
    take(platform.pins(apps, "W"), 4),
    "sig",
    1,
  );

  hardware.routeAll();
  platform.routeAll();
  security.routeAll();

  hardware.stubs(rand, 0.42, [cpu, phy, fabric, boot]);
  security.stubs(rand, 0.3, [signer]);

  // A via is real only if the nets on both of its layers were routed. A net left
  // without its partner simply ends in a pad.
  const laid = builders.map(
    (builder) => new Set(builder.nets.map((net) => net.id)),
  );
  /** @type {Via[]} */
  const routed = [];
  for (const v of vias) {
    const below = v.netBelow > 0 && laid[v.lower].has(v.netBelow);
    const above = v.netAbove > 0 && laid[v.lower + 1].has(v.netAbove);
    if (below && above) routed.push(v);
    else if (below && !v.through) builders[v.lower].dots.push(v.x, v.y);
    else if (above && !v.through) builders[v.lower + 1].dots.push(v.x, v.y);
  }

  const layers = builders.map((builder) => builder.finish());
  let nets = 0;
  let segments = 0;
  let unrouted = 0;
  for (const builder of builders) {
    unrouted += builder.unrouted;
    for (const net of builder.nets) {
      nets++;
      segments += net.points.length / 2 - 1;
    }
  }

  return {
    seed,
    rev: seed.toString(16).toUpperCase().padStart(4, "0"),
    cols: COLS,
    rows: ROWS,
    cell: CELL,
    layers,
    vias: routed,
    stats: {
      nets,
      segments,
      unrouted,
      vias: routed.length,
      ms: Math.round((performance.now() - started) * 10) / 10,
    },
  };
}
