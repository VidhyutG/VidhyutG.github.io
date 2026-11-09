// @ts-check
/**
 * An octilinear grid autorouter: A* over (node, heading) states.
 *
 * Traces may run in eight directions and bend by at most 45 degrees per node,
 * which is what gives routed copper its characteristic chamfered corners.
 * Two nets never share a node, and two diagonals never cross inside a cell.
 * No DOM here: the same module runs in a Web Worker, on the main thread, and
 * under `node --test`.
 */

/** Heading index: 0 = east, then clockwise in 45 degree steps (y grows down). */
export const DX = [1, 1, 0, -1, -1, -1, 0, 1];
export const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const STEP = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

export const FREE = 0;
export const BLOCKED = -1;

/** Cost of a 45 degree bend, in grid steps. High enough to prefer long straight runs. */
const BEND = 1.6;
/** Upper bound on expansions for one net, so an unroutable net fails fast. */
const BUDGET = 60000;

export class Grid {
  /**
   * @param {number} cols
   * @param {number} rows
   */
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    /** 0 = free, -1 = blocked, n > 0 = owned by net n. */
    this.owner = new Int16Array(cols * rows);
    /** Per cell: bit 1 = a "\" diagonal is laid, bit 2 = a "/" diagonal is laid. */
    this.diag = new Uint8Array(cols * rows);
    const states = cols * rows * 8;
    this.cost = new Float32Array(states);
    this.from = new Int32Array(states);
    this.seen = new Uint32Array(states);
    this.done = new Uint32Array(states);
    this.generation = 0;
    /** @type {number[]} */ this.heapKey = [];
    /** @type {number[]} */ this.heapVal = [];
  }

  /** @param {number} x @param {number} y */
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** @param {number} x @param {number} y */
  at(x, y) {
    return this.inside(x, y) ? this.owner[y * this.cols + x] : BLOCKED;
  }

  /** @param {number} x @param {number} y @param {number} value */
  set(x, y, value) {
    if (this.inside(x, y)) this.owner[y * this.cols + x] = value;
  }

  /** Block an inclusive rectangle of nodes. */
  /** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
  block(x0, y0, x1, y1) {
    for (let y = Math.max(0, y0); y <= Math.min(this.rows - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.cols - 1, x1); x++)
        this.owner[y * this.cols + x] = BLOCKED;
  }

  /** @param {number} key @param {number} value */
  push(key, value) {
    const keys = this.heapKey;
    const values = this.heapVal;
    let i = keys.length;
    keys.push(key);
    values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      values[i] = values[parent];
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  pop() {
    const keys = this.heapKey;
    const values = this.heapVal;
    const top = values[0];
    const key = /** @type {number} */ (keys.pop());
    const value = /** @type {number} */ (values.pop());
    const size = keys.length;
    if (size > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= size) break;
        if (child + 1 < size && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= key) break;
        keys[i] = keys[child];
        values[i] = values[child];
        i = child;
      }
      keys[i] = key;
      values[i] = value;
    }
    return top;
  }

  /**
   * Route one net and claim its nodes.
   *
   * @param {number} sx start node
   * @param {number} sy
   * @param {number} sdir required first heading, or -1 for any
   * @param {number} tx target node
   * @param {number} ty
   * @param {number} tdir required arrival heading (within 45 degrees), or -1 for any
   * @param {number} id net id (> 0). Nodes already owned by this id count as free.
   * @returns {number[] | null} flat [x0, y0, x1, y1, ...] node list, or null if unroutable
   */
  route(sx, sy, sdir, tx, ty, tdir, id) {
    const { cols, owner, diag, cost, from, seen, done } = this;
    if (!this.inside(sx, sy) || !this.inside(tx, ty)) return null;
    const startOwner = owner[sy * cols + sx];
    const targetOwner = owner[ty * cols + tx];
    if (
      (startOwner !== FREE && startOwner !== id) ||
      (targetOwner !== FREE && targetOwner !== id)
    )
      return null;

    const generation = ++this.generation;
    this.heapKey.length = 0;
    this.heapVal.length = 0;
    const target = ty * cols + tx;
    const startNode = sy * cols + sx;

    /** Octile distance: the exact cost of an unobstructed octilinear path. */
    const estimate = (/** @type {number} */ x, /** @type {number} */ y) => {
      const dx = Math.abs(tx - x);
      const dy = Math.abs(ty - y);
      return (dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx) * 1.0005;
    };

    for (let d = 0; d < 8; d++) {
      if (sdir >= 0 && d !== sdir) continue;
      const state = startNode * 8 + d;
      seen[state] = generation;
      cost[state] = 0;
      from[state] = -1;
      this.push(estimate(sx, sy), state);
    }

    let budget = BUDGET;
    let goal = -1;
    while (this.heapKey.length && budget-- > 0) {
      const state = this.pop();
      if (done[state] === generation) continue;
      done[state] = generation;
      const node = state >> 3;
      const dir = state & 7;
      if (node === target) {
        const off = tdir < 0 ? 0 : Math.min((dir - tdir) & 7, (tdir - dir) & 7);
        if (off <= 1) {
          goal = state;
          break;
        }
        continue;
      }
      const x = node % cols;
      const y = (node - x) / cols;
      const base = cost[state];
      for (let turn = -1; turn <= 1; turn++) {
        const nd = (dir + turn) & 7;
        const nx = x + DX[nd];
        const ny = y + DY[nd];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= this.rows) continue;
        const next = ny * cols + nx;
        const occupant = owner[next];
        if (occupant !== FREE && occupant !== id) continue;
        if (nd & 1) {
          // A diagonal step: it must not cross another diagonal in this cell,
          // and it must not cut the corner of a part.
          const cell = Math.min(y, ny) * cols + Math.min(x, nx);
          const crossing = DX[nd] * DY[nd] > 0 ? 2 : 1;
          if (diag[cell] & crossing) continue;
          if (
            owner[y * cols + nx] === BLOCKED &&
            owner[ny * cols + x] === BLOCKED
          )
            continue;
        }
        const total = base + STEP[nd] + (turn === 0 ? 0 : BEND);
        const nextState = next * 8 + nd;
        if (seen[nextState] === generation && cost[nextState] <= total)
          continue;
        seen[nextState] = generation;
        cost[nextState] = total;
        from[nextState] = state;
        this.push(total + estimate(nx, ny), nextState);
      }
    }
    if (goal < 0) return null;

    /** @type {number[]} */
    const path = [];
    for (let state = goal; state >= 0; state = from[state]) {
      const node = state >> 3;
      const x = node % cols;
      path.push((node - x) / cols, x);
    }
    path.reverse();
    this.claim(path, id);
    return path;
  }

  /**
   * Mark a node list as owned by a net, recording its diagonals.
   * @param {number[]} path flat [x, y, ...]
   * @param {number} id
   */
  claim(path, id) {
    const { cols, owner, diag } = this;
    for (let i = 0; i < path.length; i += 2) {
      const x = path[i];
      const y = path[i + 1];
      owner[y * cols + x] = id;
      if (i >= 2) {
        const px = path[i - 2];
        const py = path[i - 1];
        if (px !== x && py !== y)
          diag[Math.min(y, py) * cols + Math.min(x, px)] |=
            (x - px) * (y - py) > 0 ? 1 : 2;
      }
    }
  }
}

/**
 * Reduce a node list to its corner points.
 * @param {number[]} path flat [x, y, ...]
 * @returns {number[]}
 */
export function corners(path) {
  if (path.length <= 4) return path.slice();
  const out = [path[0], path[1]];
  for (let i = 2; i < path.length - 2; i += 2) {
    const ax = path[i] - path[i - 2];
    const ay = path[i + 1] - path[i - 1];
    const bx = path[i + 2] - path[i];
    const by = path[i + 3] - path[i + 1];
    if (ax !== bx || ay !== by) out.push(path[i], path[i + 1]);
  }
  out.push(path[path.length - 2], path[path.length - 1]);
  return out;
}

/**
 * Euclidean length of a polyline, in grid steps.
 * @param {number[]} points flat [x, y, ...]
 */
export function polylineLength(points) {
  let total = 0;
  for (let i = 2; i < points.length; i += 2)
    total += Math.hypot(
      points[i] - points[i - 2],
      points[i + 1] - points[i - 1],
    );
  return total;
}
