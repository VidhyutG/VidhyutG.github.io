// @ts-check
/**
 * Page behaviour. Everything here is an enhancement: the content, links, and
 * figures are complete without it.
 */
import { createExhibit } from "./exhibit/scene.js";

/** @typedef {import("./exhibit/generate.js").Board} Board */

const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

/** @param {string} key @param {string} value */
function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage is optional. */
  }
}

// ── Theme ────────────────────────────────────────────────────────────────
const themeToggle = document.querySelector(".theme-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');

function syncTheme() {
  themeToggle?.setAttribute(
    "aria-checked",
    String(root.dataset.theme === "dark"),
  );
  themeColor?.setAttribute(
    "content",
    root.dataset.theme === "dark" ? "#071a30" : "#f6f1e7",
  );
}

/** @param {"light" | "dark"} theme @param {Element | null} origin */
function setTheme(theme, origin) {
  const apply = () => {
    root.dataset.theme = theme;
    syncTheme();
    exhibit?.refresh();
  };
  // Where supported, the new theme opens outward from the switch that was pressed.
  if (!document.startViewTransition || root.dataset.motion === "paused")
    return apply();
  const box = origin?.getBoundingClientRect();
  root.style.setProperty(
    "--reveal-x",
    `${box ? box.left + box.width / 2 : innerWidth / 2}px`,
  );
  root.style.setProperty(
    "--reveal-y",
    `${box ? box.top + box.height / 2 : 0}px`,
  );
  document.startViewTransition(apply);
}

themeToggle?.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  remember("vg-theme", next);
  setTheme(next, themeToggle);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  (event) => {
    let chosen = null;
    try {
      chosen = localStorage.getItem("vg-theme");
    } catch {
      /* Storage is optional. */
    }
    if (!chosen) setTheme(event.matches ? "dark" : "light", null);
  },
);
syncTheme();

// ── Motion ───────────────────────────────────────────────────────────────
const motionButton = document.querySelector('[data-action="motion"]');

function syncMotion() {
  const paused = root.dataset.motion === "paused";
  motionButton?.setAttribute("aria-pressed", String(paused));
  motionButton?.setAttribute(
    "aria-label",
    paused ? "Play animation" : "Pause animation",
  );
}
motionButton?.addEventListener("click", () => {
  const paused = root.dataset.motion !== "paused";
  root.dataset.motion = paused ? "paused" : "running";
  remember("vg-motion", paused ? "paused" : "running");
  syncMotion();
});
reducedMotion.addEventListener("change", () => {
  root.dataset.motion = reducedMotion.matches ? "paused" : "running";
  syncMotion();
});
syncMotion();

// ── The exhibit ──────────────────────────────────────────────────────────
const hero = document.querySelector(".hero");
const stage = document.querySelector(".stage");
const stamp = document.querySelector("[data-stamp]");
const colophon = document.querySelector("[data-colophon]");
const description = document.querySelector(".layer-description");
const layerButtons = [...document.querySelectorAll("button[data-layer]")];
const explodeButton = document.querySelector('[data-action="explode"]');
const respinButton = document.querySelector('[data-action="respin"]');

const DESCRIPTIONS = [
  "PHY, switching, and hardware interfaces. Bring-up starts at the board.",
  "Firmware, Linux, FXOS, QDMA, and applications. Make the layers work together.",
  "BES federal compliance, signature validation, and post-quantum signing.",
];
const OVERVIEW = "One connected system. Select a layer to explore my work.";

const exhibit =
  stage instanceof HTMLElement
    ? createExhibit(stage, {
        onBooted() {
          hero?.classList.remove("is-booting");
          hero?.classList.add("is-booted");
        },
      })
    : null;

/**
 * Lay out and route a board revision. The work happens in a Worker; if that
 * is unavailable, the same module runs here instead.
 * @param {number} seed
 * @returns {Promise<Board>}
 */
function routeBoard(seed) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let fallingBack = false;
    /** @type {Worker | null} */
    let worker = null;
    let timeout = 0;
    const finish = (/** @type {Board} */ board) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker?.terminate();
      resolve(board);
    };
    const inline = () => {
      if (settled || fallingBack) return;
      fallingBack = true;
      clearTimeout(timeout);
      worker?.terminate();
      void import("./exhibit/generate.js")
        .then((module) => finish(module.generateBoard(seed)))
        .catch(reject);
    };
    try {
      worker = new Worker(new URL("./exhibit/worker.js", import.meta.url), {
        type: "module",
      });
      timeout = setTimeout(inline, 3000);
      worker.addEventListener("message", (event) => {
        finish(event.data);
      });
      worker.addEventListener("error", (event) => {
        event.preventDefault();
        inline();
      });
      worker.postMessage(seed);
    } catch {
      inline();
    }
  });
}

/** A fresh 16-bit revision number, or the one pinned in the address (?rev=3FA2). */
function pickSeed() {
  const pinned = new URLSearchParams(location.search).get("rev");
  if (pinned && /^[0-9a-f]{1,4}$/i.test(pinned)) return parseInt(pinned, 16);
  return crypto.getRandomValues(new Uint16Array(1))[0];
}

let routing = false;

/** @param {number} seed */
async function showBoard(seed) {
  if (!exhibit || routing) return;
  routing = true;
  if (respinButton instanceof HTMLButtonElement) respinButton.disabled = true;
  stage?.setAttribute("aria-busy", "true");
  try {
    const board = await routeBoard(seed);
    const { nets, vias, ms } = board.stats;
    if (root.dataset.motion !== "paused") {
      hero?.classList.remove("is-booted");
      hero?.classList.add("is-booting");
    }
    exhibit.load(board);
    // These numbers describe only the conceptual board on screen.
    if (stamp)
      stamp.textContent = `Rev ${board.rev}: ${nets} nets and ${vias} vias, routed in ${ms} ms in your browser.`;
    if (colophon)
      colophon.textContent = `The hero is board rev ${board.rev}, routed live in your browser.`;
  } catch {
    if (stamp)
      stamp.textContent =
        "Interactive routing is unavailable. Showing the conceptual platform.";
  } finally {
    routing = false;
    stage?.setAttribute("aria-busy", "false");
    if (respinButton instanceof HTMLButtonElement)
      respinButton.disabled = false;
  }
}

if (exhibit) {
  void showBoard(pickSeed());

  layerButtons.forEach((button, index) =>
    button.addEventListener("click", () => {
      const selected = button.getAttribute("aria-pressed") !== "true";
      layerButtons.forEach((other) =>
        other.setAttribute(
          "aria-pressed",
          String(selected && other === button),
        ),
      );
      exhibit.focus(selected ? index : -1);
      if (selected) {
        exhibit.explode(true);
        explodeButton?.setAttribute("aria-pressed", "true");
      }
      if (description)
        description.textContent = selected ? DESCRIPTIONS[index] : OVERVIEW;
    }),
  );

  explodeButton?.addEventListener("click", () => {
    const apart = explodeButton.getAttribute("aria-pressed") !== "true";
    explodeButton.setAttribute("aria-pressed", String(apart));
    exhibit.explode(apart);
    if (!apart) {
      layerButtons.forEach((button) =>
        button.setAttribute("aria-pressed", "false"),
      );
      exhibit.focus(-1);
      if (description) description.textContent = OVERVIEW;
    }
  });

  respinButton?.addEventListener("click", () => {
    respinButton.classList.remove("is-busy");
    void respinButton.getBoundingClientRect();
    respinButton.classList.add("is-busy");
    void showBoard(crypto.getRandomValues(new Uint16Array(1))[0]);
  });
}

// ── The bring-up path fills as it scrolls into view ──────────────────────
const stackup = document.querySelector("[data-stackup]");
if (stackup instanceof HTMLElement) {
  let queued = false;
  const measure = () => {
    queued = false;
    if (root.dataset.motion === "paused")
      return stackup.style.setProperty("--progress", "1");
    const box = stackup.getBoundingClientRect();
    const begin = innerHeight * 0.9;
    const end = innerHeight * 0.34;
    const progress =
      (begin - box.top) / Math.max(1, begin - end + box.height * 0.2);
    stackup.style.setProperty(
      "--progress",
      Math.min(1, Math.max(0, progress)).toFixed(3),
    );
  };
  const request = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(measure);
    }
  };
  new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting)
        addEventListener("scroll", request, { passive: true });
      else removeEventListener("scroll", request);
      request();
    },
    { rootMargin: "20% 0px" },
  ).observe(stackup);
  addEventListener("resize", request, { passive: true });
  measure();
}

// ── The path so far: a cursor reads out the date beneath the pointer ─────
const capture = document.querySelector("[data-capture]");
if (capture instanceof HTMLElement) {
  const from = Number(capture.style.getPropertyValue("--from"));
  const to = Number(capture.style.getPropertyValue("--to"));
  const track = capture.querySelector(".lane-track");
  const readout = capture.querySelector("output");
  const lanes = [...capture.querySelectorAll(".lane")].map((lane) => ({
    lane,
    start: Number(
      /** @type {HTMLElement} */ (lane).style.getPropertyValue("--s"),
    ),
    end: Number(
      /** @type {HTMLElement} */ (lane).style.getPropertyValue("--e"),
    ),
  }));
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const today = new Date();
  const now =
    today.getFullYear() + (today.getMonth() + today.getDate() / 31) / 12;

  /** @param {PointerEvent} event */
  const probe = (event) => {
    if (!track) return;
    const box = track.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / Math.max(1, box.width);
    if (fraction < 0 || fraction > 1) return leave();
    // The capture ends today: there is nothing to read to the right of now.
    const year = Math.min(from + fraction * (to - from), Math.max(now, from));
    const x =
      box.left -
      capture.getBoundingClientRect().left +
      ((year - from) / (to - from)) * box.width;
    capture.style.setProperty("--x", `${x}px`);
    capture.classList.add("is-probing");
    const month = Math.min(11, Math.floor((year - Math.floor(year)) * 12));
    if (readout) readout.textContent = `${months[month]} ${Math.floor(year)}`;
    for (const { lane, start, end } of lanes)
      lane.classList.toggle(
        "is-on",
        year >= start && (year < end || lane.classList.contains("is-current")),
      );
  };
  const leave = () => {
    capture.classList.remove("is-probing");
    for (const { lane } of lanes) lane.classList.remove("is-on");
  };
  capture.addEventListener("pointermove", probe);
  capture.addEventListener("pointerdown", probe);
  capture.addEventListener("pointerleave", leave);
}

// ── Small things ─────────────────────────────────────────────────────────
for (const button of document.querySelectorAll("[data-copy]"))
  button.addEventListener("click", async () => {
    const text = button.getAttribute("data-copy") || "";
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
      const status = document.querySelector("[data-copy-status]");
      if (status) status.textContent = "Email address copied.";
    } catch {
      const status = document.querySelector("[data-copy-status]");
      if (status)
        status.textContent =
          "Select the email address to copy it, or open the email link.";
    }
    setTimeout(() => (button.textContent = label), 1600);
  });

// Mark the section being read in the navigation.
const links = new Map(
  [...document.querySelectorAll(".site-nav a")].map((link) => [
    link.getAttribute("href"),
    link,
  ]),
);
const spy = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const link = links.get(`#${entry.target.id}`);
      if (link) link.setAttribute("aria-current", String(entry.isIntersecting));
    }
  },
  { rootMargin: "-45% 0px -50% 0px" },
);
for (const section of document.querySelectorAll("main section[id]"))
  spy.observe(section);

// Glass catches the light nearest the pointer.
if (finePointer.matches)
  addEventListener(
    "pointermove",
    (event) => {
      const surface =
        event.target instanceof Element
          ? event.target.closest(
              ".card, .evidence li, .depth-grid > div, .earlier a",
            )
          : null;
      if (!(surface instanceof HTMLElement)) return;
      const box = surface.getBoundingClientRect();
      surface.style.setProperty(
        "--glow-x",
        `${(((event.clientX - box.left) / box.width) * 100).toFixed(1)}%`,
      );
      surface.style.setProperty(
        "--glow-y",
        `${(((event.clientY - box.top) / box.height) * 100).toFixed(1)}%`,
      );
      surface.style.setProperty("--glow-size", "70% 90%");
    },
    { passive: true },
  );

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

console.info(
  "%cvg%c  Curious how the hero works? The board is laid out and routed on your device by an octilinear A* autorouter: assets/js/exhibit/route.js. Add ?rev=3FA2 to the address to pin a revision.",
  "font: 700 15px system-ui; color: #1763ad",
  "font: 13px system-ui",
);
