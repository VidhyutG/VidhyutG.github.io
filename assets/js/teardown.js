// @ts-check
/**
 * The bring-up story. A second copy of the hero's model stays pinned beside
 * five steps and is taken apart as they scroll past: a plate for each layer,
 * and the vias between plates for the work that joins those layers. One gold
 * via runs through the whole stack and lights as far as the reader has come.
 *
 * Without scripts, with motion paused, or on a screen too short to pin the
 * model, the same content reads as an ordinary list.
 */
import { createExhibit } from "./exhibit/scene.js";

/** @typedef {import("./exhibit/generate.js").Board} Board */

const WHOLE = { plates: [1, 1, 1], gaps: [0, 0] };
/** What the model shows at each beat: the opening, the five steps, the close. */
const BEATS = [
  { ...WHOLE, explode: 0 },
  { plates: [1, 0.16, 0.1], gaps: [0, 0], explode: 1 },
  { plates: [0.52, 0.42, 0.1], gaps: [1, 0], explode: 1 },
  { plates: [0.14, 1, 0.14], gaps: [0, 0], explode: 1 },
  { plates: [0.1, 0.46, 0.5], gaps: [0, 1], explode: 1 },
  { plates: [0.1, 0.16, 1], gaps: [0, 0], explode: 1 },
  { ...WHOLE, explode: 0 },
];
const HOME = { yaw: -32, tilt: 57 };
/** On a desktop the model also turns slowly through the story. */
const TURN = { from: -44, to: -20 };

/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * @param {HTMLElement} article
 * @returns {{load: (board: Board) => void} | null}
 */
export function createTeardown(article) {
  const stage = article.querySelector(".teardown-stage");
  const visual = article.querySelector(".teardown-visual");
  const story = article.querySelector(".teardown-story");
  const thread = article.querySelector(".teardown-thread");
  const intro = article.querySelector(".teardown-intro");
  const outro = article.querySelector(".teardown-outro");
  const steps = [...article.querySelectorAll(".step")];
  if (
    !(stage instanceof HTMLElement) ||
    !(visual instanceof HTMLElement) ||
    !(story instanceof HTMLElement) ||
    !thread ||
    !intro ||
    !outro ||
    steps.length !== BEATS.length - 2
  )
    return null;

  const root = document.documentElement;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const beats = [intro, ...steps, outro];
  /** @type {ReturnType<typeof createExhibit>} */
  let exhibit = null;
  /** @type {Board | null} */
  let board = null;
  let near = false;
  let beat = -1;
  let queued = false;
  /** Whether the model is showing everything at once rather than following the story. */
  let whole = false;

  /** The story drives the model only while motion is on and the model is pinned. */
  const driven = () =>
    root.dataset.motion !== "paused" &&
    getComputedStyle(visual).position === "sticky";

  const measure = () => {
    queued = false;
    if (!exhibit) return;
    if (!driven()) {
      if (whole) return;
      whole = true;
      // Everything at once: the whole stack, apart and lit.
      article.classList.remove("is-driven");
      story.style.setProperty("--thread", "1");
      exhibit.spotlight(WHOLE.plates, WHOLE.gaps);
      exhibit.pose({ yaw: HOME.yaw, explode: 1 }, true);
      exhibit.thread(1);
      beat = -1;
      return;
    }
    whole = false;
    article.classList.add("is-driven");
    const frame = visual.getBoundingClientRect();
    const stacked = frame.width > article.getBoundingClientRect().width * 0.8;
    // Where the eye rests: mid-screen beside the model, or mid-way below it.
    const focus = stacked
      ? frame.bottom + (innerHeight - frame.bottom) * 0.42
      : innerHeight * 0.5;
    const anchors = beats.map((element, index) => {
      const box = element.getBoundingClientRect();
      if (index === 0) return box.bottom - 36;
      if (index === beats.length - 1) return box.top + 36;
      return box.top + box.height / 2;
    });
    let active = 0;
    let nearest = Infinity;
    anchors.forEach((y, index) => {
      const distance = Math.abs(y - focus);
      if (distance < nearest) {
        nearest = distance;
        active = index;
      }
    });
    const last = anchors.length - 1;
    // The thread runs half a step ahead of the eye, so it reaches each pad
    // just as that step takes over.
    const reach = focus + (anchors[2] - anchors[1]) / 2;
    const climb = clamp(
      (reach - anchors[1]) / Math.max(1, anchors[last - 1] - anchors[1]),
      0,
      1,
    );
    const travel = clamp(
      (focus - anchors[0]) / Math.max(1, anchors[last] - anchors[0]),
      0,
      1,
    );
    const line = thread.getBoundingClientRect();
    story.style.setProperty(
      "--thread",
      clamp((reach - line.top) / Math.max(1, line.height), 0, 1).toFixed(3),
    );
    steps.forEach((step, index) => {
      step.classList.toggle("is-active", index + 1 === active);
      step.classList.toggle("is-lit", index + 1 <= active);
    });
    outro.classList.toggle("is-lit", active === last);

    const first = beat < 0;
    exhibit.pose(
      {
        explode: BEATS[active].explode,
        yaw: finePointer.matches
          ? TURN.from + (TURN.to - TURN.from) * travel
          : HOME.yaw,
      },
      first,
    );
    exhibit.thread(active === 0 ? 0 : active === last ? 1 : climb);
    if (active !== beat) {
      beat = active;
      exhibit.spotlight(BEATS[active].plates, BEATS[active].gaps);
    }
  };

  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(measure);
  };

  /** The model is only built once the story is close to the screen. */
  const build = () => {
    if (exhibit || !board) return;
    exhibit = createExhibit(
      stage,
      {},
      {
        interactive: false,
        home: HOME,
        range: { yaw: [-50, -14], tilt: [50, 62] },
        gap: 126,
      },
    );
    if (!exhibit) return;
    exhibit.load(board, true);
    measure();
  };

  new IntersectionObserver(
    (entries) => {
      near = entries[0]?.isIntersecting ?? false;
      if (near) {
        build();
        addEventListener("scroll", request, { passive: true });
        request();
      } else removeEventListener("scroll", request);
    },
    { rootMargin: "60% 0px" },
  ).observe(article);
  addEventListener("resize", request, { passive: true });
  new MutationObserver(request).observe(root, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });

  return {
    /** Show the same board revision as the hero. @param {Board} next */
    load(next) {
      board = next;
      if (exhibit) {
        exhibit.load(next, true);
        beat = -1;
        whole = false;
        request();
      } else if (near) build();
    },
  };
}
