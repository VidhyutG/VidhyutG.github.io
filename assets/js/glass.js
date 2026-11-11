// @ts-check
/**
 * Liquid glass.
 *
 * A pane of real glass with a rounded rim does more than blur what is behind
 * it: light entering near the rim is bent toward the middle of the pane, so
 * the backdrop appears squeezed along the edge. This module works that
 * bending out with Snell's law for a quarter-round bezel, stores it as a
 * displacement map, and hands it to an SVG filter that the browser runs on
 * the element's backdrop.
 *
 * Only Chromium can run an SVG filter on a backdrop today. Everywhere else,
 * and whenever anything here fails, the surface keeps its ordinary frosted
 * glass from the stylesheet.
 */

const SVG = "http://www.w3.org/2000/svg";
/** Refractive index of the pane. Window glass is about 1.5. */
const INDEX = 1.5;
/** How much of the computed bending to show. Full strength smears small text at the rim. */
const STRENGTH = 0.62;

/**
 * The refraction of a rounded pane, one RGBA pixel per CSS pixel. Red and
 * green hold the sideways shift, 128 meaning none; blue holds how much of the
 * pixel belongs to the rim rather than the flat middle.
 * @param {number} width @param {number} height
 * @param {number} radius corner radius
 * @param {number} bezel width of the rounded rim
 * @returns {{data: Uint8ClampedArray<ArrayBuffer>, reach: number}} the map, and the largest shift in pixels
 */
export function bezelMap(width, height, radius, bezel) {
  const data = new Uint8ClampedArray(width * height * 4);
  const r = Math.min(radius, width / 2, height / 2);
  const b = Math.max(1, Math.min(bezel, width / 2, height / 2));
  const halfW = width / 2;
  const halfH = height / 2;
  // The pane is as deep as its rim is wide, plus the height of the rim itself.
  // The largest shift is about halfway in, where depth and bending trade off.
  let reach = 0;
  for (let run = 0; run <= 1; run += 0.01) {
    const rise = Math.sqrt(Math.max(1e-6, 1 - run * run));
    const incidence = Math.atan2(run, rise);
    const refracted = Math.asin(Math.sin(incidence) / INDEX);
    reach = Math.max(reach, b * (1 + rise) * Math.tan(incidence - refracted));
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - halfW;
      const py = y + 0.5 - halfH;
      // Signed distance to the rounded rectangle, and the direction out of it.
      const qx = Math.abs(px) - (halfW - r);
      const qy = Math.abs(py) - (halfH - r);
      let nx = 0;
      let ny = 0;
      let inside = 0;
      if (qx > 0 && qy > 0) {
        const corner = Math.hypot(qx, qy);
        inside = r - corner;
        nx = (qx / (corner || 1)) * Math.sign(px);
        ny = (qy / (corner || 1)) * Math.sign(py);
      } else if (qx > qy) {
        inside = r - qx;
        nx = Math.sign(px);
      } else {
        inside = r - qy;
        ny = Math.sign(py);
      }
      const at = (y * width + x) * 4;
      data[at + 3] = 255;
      const t = inside / b;
      if (t >= 1 || inside < 0) {
        data[at] = data[at + 1] = 128;
        continue;
      }
      // The rim is a quarter circle. Its slope here gives the angle at which
      // a ray from the eye meets the surface; Snell's law gives the angle it
      // continues at; the pane's depth turns that into a sideways shift.
      const run = 1 - t;
      const rise = Math.sqrt(Math.max(1e-6, 1 - run * run));
      const incidence = Math.atan2(run, rise);
      const refracted = Math.asin(Math.sin(incidence) / INDEX);
      const shift = b * (1 + rise) * Math.tan(incidence - refracted);
      const amount = Math.min(1, shift / reach);
      data[at] = 128 - nx * amount * 127;
      data[at + 1] = 128 - ny * amount * 127;
      data[at + 2] = 255 * run * run * (3 - 2 * run);
    }
  }
  return { data, reach };
}

/** @param {string} name @param {Record<string, string | number>} attributes */
function svg(name, attributes) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  return node;
}

/** Whether this browser can bend a backdrop through an SVG filter. */
export function canRefract() {
  const device =
    /** @type {{userAgentData?: {brands?: {brand: string}[]}, deviceMemory?: number}} */ (
      navigator
    );
  const agent = device.userAgentData;
  return (
    !!agent?.brands?.some((entry) => entry.brand === "Chromium") &&
    // Small devices keep the plain frosted glass: it costs less to draw.
    (device.deviceMemory ?? 8) >= 4 &&
    CSS.supports("backdrop-filter", "url(#a)") &&
    !matchMedia("(prefers-reduced-transparency: reduce)").matches
  );
}

/**
 * Give each element a refracting backdrop sized to it, and keep it in step as
 * the element changes size.
 *
 * Markup: data-liquid="bezel frost" (both optional, in CSS pixels).
 * @param {Iterable<Element>} elements
 */
export function liquify(elements) {
  if (!canRefract()) return;
  const sheet = svg("svg", { width: 0, height: 0, "aria-hidden": "true" });
  sheet.style.position = "absolute";
  document.body.append(sheet);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  let serial = 0;

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue;
    const [bezel = 16, frost = 9] = (element.dataset.liquid || "")
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
    const id = `liquid-${++serial}`;
    const filter = svg("filter", {
      id,
      filterUnits: "userSpaceOnUse",
      primitiveUnits: "userSpaceOnUse",
      "color-interpolation-filters": "sRGB",
      x: 0,
      y: 0,
    });
    const image = svg("feImage", {
      x: 0,
      y: 0,
      preserveAspectRatio: "none",
      result: "map",
    });
    const bend = svg("feDisplacementMap", {
      in: "sharp",
      in2: "map",
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: "bent",
    });
    filter.append(
      image,
      // The flat middle of the pane is frosted; the rim stays clear and bends.
      svg("feGaussianBlur", {
        in: "SourceGraphic",
        stdDeviation: frost,
        result: "frost",
      }),
      svg("feGaussianBlur", {
        in: "SourceGraphic",
        stdDeviation: 1.6,
        result: "sharp",
      }),
      bend,
      svg("feColorMatrix", {
        in: "map",
        type: "matrix",
        values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0",
        result: "rim",
      }),
      svg("feComposite", {
        in: "bent",
        in2: "rim",
        operator: "in",
        result: "edge",
      }),
      svg("feComposite", {
        in: "frost",
        in2: "rim",
        operator: "out",
        result: "middle",
      }),
      svg("feComposite", {
        in: "edge",
        in2: "middle",
        operator: "arithmetic",
        k1: 0,
        k2: 1,
        k3: 1,
        k4: 0,
      }),
    );
    sheet.append(filter);

    let last = "";
    const fit = () => {
      const width = Math.round(element.offsetWidth);
      const height = Math.round(element.offsetHeight);
      if (width < 8 || height < 8) return;
      const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius);
      const key = `${width}x${height}r${radius}`;
      if (key === last) return;
      last = key;
      try {
        const { data, reach } = bezelMap(width, height, radius || 0, bezel);
        canvas.width = width;
        canvas.height = height;
        context.putImageData(new ImageData(data, width, height), 0, 0);
        image.setAttribute("href", canvas.toDataURL());
        for (const node of [filter, image]) {
          node.setAttribute("width", String(width));
          node.setAttribute("height", String(height));
        }
        bend.setAttribute("scale", String(reach * 2 * STRENGTH));
        const value = `url(#${id}) saturate(1.7)`;
        element.style.setProperty("backdrop-filter", value);
        element.classList.add("is-liquid");
      } catch {
        element.style.removeProperty("backdrop-filter");
        element.classList.remove("is-liquid");
      }
    };
    new ResizeObserver(fit).observe(element);
    fit();
  }
}
