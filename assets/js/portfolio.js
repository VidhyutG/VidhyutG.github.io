import { initProjection } from "./projection.js";

const root = document.documentElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const motionButton = document.querySelector(".motion-toggle");
let paused = reducedMotion.matches;
try {
  paused =
    reducedMotion.matches || localStorage.getItem("vg-motion") === "paused";
} catch {
  /* Storage is optional. */
}
function syncMotion() {
  root.dataset.motion = paused ? "paused" : "running";
  motionButton?.setAttribute("aria-pressed", String(paused));
  motionButton?.setAttribute(
    "aria-label",
    paused ? "Resume animation" : "Pause animation",
  );
  const label = motionButton?.querySelector(".motion-text");
  const symbol = motionButton?.querySelector(".motion-symbol");
  if (label) label.textContent = paused ? "Play" : "Pause";
  if (symbol) symbol.textContent = paused ? "▷" : "Ⅱ";
}
syncMotion();
motionButton?.addEventListener("click", () => {
  paused = !paused;
  syncMotion();
  try {
    localStorage.setItem("vg-motion", paused ? "paused" : "running");
  } catch {
    /* Storage is optional. */
  }
});
reducedMotion.addEventListener("change", () => {
  paused = reducedMotion.matches;
  syncMotion();
});
initProjection();

const exhibit = document.querySelector(".platform-exhibit");
const stage = document.querySelector(".model-stage");
const model = document.querySelector(".platform-model");
const explode = document.querySelector(".explode-toggle");
const layerButtons = [...document.querySelectorAll("button[data-layer]")];
const description = document.querySelector(".layer-description");
/** @type {Record<string, string>} */
const descriptions = {
  system: "One connected system. Select a layer to explore my work.",
  hardware:
    "PHY, switching, and hardware interfaces. Bring-up starts at the board.",
  os: "Firmware, Linux, FXOS, QDMA, and applications. Make the layers work together.",
  security:
    "BES federal compliance, signature validation, and post-quantum signing.",
};
let assembled = false;
function syncAssembly() {
  exhibit?.classList.toggle("is-assembled", assembled);
  explode?.setAttribute("aria-pressed", String(!assembled));
  const label = explode?.querySelector("span");
  if (label) label.textContent = assembled ? "Explode layers" : "Assemble";
}
explode?.addEventListener("click", () => {
  assembled = !assembled;
  if (exhibit instanceof HTMLElement) exhibit.dataset.layer = "system";
  layerButtons.forEach((button) =>
    button.setAttribute("aria-pressed", "false"),
  );
  if (description) description.textContent = descriptions.system;
  syncAssembly();
});
layerButtons.forEach((button) =>
  button.addEventListener("click", () => {
    if (!(button instanceof HTMLElement) || !(exhibit instanceof HTMLElement))
      return;
    const selected = button.getAttribute("aria-pressed") !== "true";
    const layer = selected ? button.dataset.layer || "system" : "system";
    exhibit.dataset.layer = layer;
    layerButtons.forEach((other) =>
      other.setAttribute("aria-pressed", String(selected && other === button)),
    );
    if (description) description.textContent = descriptions[layer];
    assembled = false;
    syncAssembly();
  }),
);
if (stage instanceof HTMLElement && model instanceof HTMLElement) {
  let tiltFrame = 0;
  let x = 0;
  let y = 0;
  stage.addEventListener(
    "pointermove",
    (event) => {
      if (paused || event.pointerType !== "mouse") return;
      const bounds = stage.getBoundingClientRect();
      x = (event.clientX - bounds.left) / bounds.width - 0.5;
      y = (event.clientY - bounds.top) / bounds.height - 0.5;
      if (!tiltFrame)
        tiltFrame = requestAnimationFrame(() => {
          model.style.setProperty("--rx", `${y * -5}deg`);
          model.style.setProperty("--ry", `${x * 7}deg`);
          tiltFrame = 0;
        });
    },
    { passive: true },
  );
  stage.addEventListener("pointerleave", () => {
    cancelAnimationFrame(tiltFrame);
    tiltFrame = 0;
    model.style.setProperty("--rx", "0deg");
    model.style.setProperty("--ry", "0deg");
  });
}
const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());
