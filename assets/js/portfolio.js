// The content and links work without JavaScript; interactions enhance them.
const root = document.documentElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
/** @param {string} key */
function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
/** @param {string} key @param {string} value */
function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Optional preference. */
  }
}
const themeButton = document.querySelector(".theme-toggle");
/** @param {string} theme */
function setTheme(theme) {
  root.dataset.theme = theme;
  themeButton?.setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
  );
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#101613" : "#e8ece5");
}
setTheme(readPreference("vg-theme") === "light" ? "light" : "dark");
themeButton?.addEventListener("click", () => {
  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  setTheme(theme);
  savePreference("vg-theme", theme);
});
const layers = [
  {
    title: "Applications & architecture",
    description:
      "Application management, memory efficiency, and architecture that the next engineer can understand.",
  },
  {
    title: "Operating systems & runtime",
    description:
      "Linux and FXOS platform software. Bring-up, boot recovery, crash diagnostics, and reliability.",
  },
  {
    title: "Networking & datapath",
    description:
      "Switching, datapath integration, and QDMA. Making the boundaries between components work together.",
  },
  {
    title: "Firmware & first boot",
    description:
      "Firmware builds, platform enablement, and the path from image construction to device validation.",
  },
  {
    title: "Hardware interfaces",
    description:
      "Working across switching and PHY hardware interfaces to connect the physical platform with its software.",
  },
  {
    title: "Security & trusted delivery",
    description:
      "Build Environment Security, federal compliance support, signature validation, and post-quantum signing.",
  },
];
const layerButtons = [...document.querySelectorAll("button[data-layer]")];
const planeElements = [...document.querySelectorAll("[data-plane]")];
const layerTitle = document.querySelector("#layer-title");
const layerDescription = document.querySelector("#layer-description");
const layerIndex = document.querySelector(".layer-index");
/** @param {number} index */
function selectLayer(index) {
  const layer = layers[index];
  if (!layer) return;
  layerButtons.forEach((button, position) =>
    button.setAttribute("aria-pressed", String(position === index)),
  );
  planeElements.forEach((plane) =>
    plane.classList.toggle(
      "is-selected",
      plane.getAttribute("data-plane") === String(index),
    ),
  );
  if (layerTitle) layerTitle.textContent = layer.title;
  if (layerDescription) layerDescription.textContent = layer.description;
  if (layerIndex)
    layerIndex.textContent = `${String(index + 1).padStart(2, "0")}—06`;
}
layerButtons.forEach((button, index) => {
  button.addEventListener("click", () => selectLayer(index));
  button.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? layers.length - 1
          : (index + direction + layers.length) % layers.length;
    selectLayer(next);
    const nextButton = layerButtons[next];
    if (nextButton instanceof HTMLElement) nextButton.focus();
  });
});
const motionButton = document.querySelector(".motion-toggle");
let motionPaused =
  readPreference("vg-motion") === "paused" || reducedMotion.matches;
function applyMotionPreference() {
  root.dataset.motion = motionPaused ? "paused" : "running";
  motionButton?.setAttribute("aria-pressed", String(motionPaused));
  if (motionButton instanceof HTMLButtonElement) {
    motionButton.disabled = reducedMotion.matches;
    if (reducedMotion.matches) {
      motionButton.textContent = "Reduced motion";
      motionButton.title = "Following your device’s reduced-motion setting";
      return;
    }
    motionButton.title = "Control decorative motion";
  }
  if (motionButton)
    motionButton.innerHTML = `<span class="motion-icon" aria-hidden="true">${motionPaused ? "▷" : "Ⅱ"}</span> ${motionPaused ? "Resume motion" : "Pause motion"}`;
}
applyMotionPreference();
motionButton?.addEventListener("click", () => {
  if (reducedMotion.matches) return;
  motionPaused = !motionPaused;
  savePreference("vg-motion", motionPaused ? "paused" : "running");
  applyMotionPreference();
});
reducedMotion.addEventListener("change", (event) => {
  motionPaused = event.matches || readPreference("vg-motion") === "paused";
  applyMotionPreference();
});
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.remove("is-waiting");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.06, rootMargin: "0px 0px -25px 0px" },
  );
  document.querySelectorAll(".reveal").forEach((element) => {
    if (
      element.getBoundingClientRect().top > window.innerHeight &&
      !reducedMotion.matches
    )
      element.classList.add("is-waiting");
    revealObserver.observe(element);
  });
}
const track = document.querySelector(".delivery-track");
const processSteps = [...document.querySelectorAll(".process-step")];
const navigationLinks = [...document.querySelectorAll(".site-header nav a")];
const navSections = navigationLinks.map((link) =>
  document.querySelector(link.getAttribute("href") || "#home"),
);
let scrollScheduled = false;
function updateScroll() {
  const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
  root.style.setProperty(
    "--scroll-progress",
    String(
      pageHeight > 0
        ? Math.min(1, Math.max(0, window.scrollY / pageHeight))
        : 0,
    ),
  );
  if (track instanceof HTMLElement) {
    const bounds = track.getBoundingClientRect();
    const progress = Math.min(
      1,
      Math.max(
        0,
        (window.innerHeight * 0.85 - bounds.top) /
          Math.max(220, bounds.height + window.innerHeight * 0.2),
      ),
    );
    track.style.setProperty("--track-progress", String(progress));
    processSteps.forEach((step, index) =>
      step.classList.toggle(
        "is-passed",
        progress >= index / processSteps.length,
      ),
    );
  }
  let activeIndex = -1;
  navSections.forEach((section, index) => {
    if (
      section &&
      section.getBoundingClientRect().top < window.innerHeight * 0.5
    )
      activeIndex = index;
  });
  navigationLinks.forEach((link, index) => {
    if (index === activeIndex) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  scrollScheduled = false;
}
function scheduleScroll() {
  if (!scrollScheduled) {
    scrollScheduled = true;
    window.requestAnimationFrame(updateScroll);
  }
}
window.addEventListener("scroll", scheduleScroll, { passive: true });
window.addEventListener("resize", scheduleScroll, { passive: true });
updateScroll();
const copyButton = document.querySelector(".copy-email");
const copyStatus = document.querySelector(".copy-status");
copyButton?.addEventListener("click", async () => {
  if (!copyStatus) return;
  try {
    await navigator.clipboard.writeText("vidhyutap@gmail.com");
    copyStatus.textContent = "Email copied";
  } catch {
    copyStatus.textContent = "Select the email to copy";
  }
  window.setTimeout(() => {
    copyStatus.textContent = "";
  }, 3000);
});
const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());
