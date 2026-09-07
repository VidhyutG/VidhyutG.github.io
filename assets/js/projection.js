/** A small, local particle field. No libraries, tracking, or network requests. */
export function initProjection() {
  const fieldElement = document.querySelector(".projection-field");
  const canvasElement = document.querySelector(".projection-canvas");
  if (
    !(fieldElement instanceof HTMLElement) ||
    !(canvasElement instanceof HTMLCanvasElement)
  )
    return;
  const field = fieldElement;
  const canvas = canvasElement;
  const hint = document.querySelector(".projection-hint");
  const motionHint = window.matchMedia("(pointer: coarse)").matches
    ? "Swipe to scatter. Release to reform."
    : "Move to scatter. Leave to reform.";
  if (hint) hint.textContent = motionHint;
  const context = canvas.getContext("2d");
  if (!context) return; // The typographic VG remains visible if canvas is unavailable.
  const root = document.documentElement;
  const mask = document.createElement("canvas");
  mask.width = 640;
  mask.height = 420;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  if (!maskContext) return;

  /** @typedef {{x:number, y:number, z:number, dx:number, dy:number, vx:number, vy:number, phase:number, radius:number}} Particle */
  /** @type {Particle[]} */
  let particles = [];
  let width = 1;
  let height = 1;
  let scale = 1;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let visible = true;
  let ink = "#c4ddf5";
  let glint = "#f1f8ff";
  let tiltX = 0;
  let tiltY = 0;
  const pointer = { x: 0, y: 0, previousX: 0, previousY: 0, active: false };
  const motionAllowed = () => root.dataset.motion !== "paused";
  const canAnimate = () => motionAllowed() && visible && !document.hidden;

  function seed() {
    if (!maskContext) return;
    maskContext.clearRect(0, 0, 640, 420);
    maskContext.font = '700 340px "DM Sans", Arial, sans-serif';
    maskContext.textAlign = "center";
    maskContext.textBaseline = "alphabetic";
    maskContext.fillStyle = "#fff";
    maskContext.fillText("VG", 320, 326);
    const pixels = maskContext.getImageData(0, 0, 640, 420).data;
    particles = [];
    for (let y = 40; y < 375; y += 5) {
      for (let x = 45; x < 595; x += 5) {
        if (pixels[(y * 640 + x) * 4 + 3] < 160) continue;
        const phase = ((x * 13 + y * 7) % 97) / 97;
        particles.push({
          x: x - 320,
          y: y - 210,
          z: (phase - 0.5) * 32,
          dx: 0,
          dy: 0,
          vx: 0,
          vy: 0,
          phase,
          radius: 0.85 + phase * 0.6,
        });
      }
    }
    field?.classList.add("is-ready");
    render(motionAllowed(), 0);
    start();
  }

  function colors() {
    const light = root.dataset.theme === "light";
    ink = light ? "#376e9e" : "#bad8f5";
    glint = light ? "#17476f" : "#f1f8ff";
  }

  function resize() {
    if (!field || !canvas || !context) return;
    width = Math.max(1, field.clientWidth);
    height = Math.max(1, field.clientHeight);
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    scale = Math.min(width / 600, height / 440);
    render(motionAllowed(), 0);
  }

  /** @param {boolean} animate @param {number} dt */
  function render(animate, dt) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const targetX = pointer.active ? (pointer.x / width - 0.5) * 0.22 : 0;
    const targetY = pointer.active ? (pointer.y / height - 0.5) * 0.14 : 0;
    tiltX += (targetX - tiltX) * 0.035 * dt;
    tiltY += (targetY - tiltY) * 0.035 * dt;
    const angle = animate ? Math.sin(elapsed * 0.00022) * 0.055 + tiltX : 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const radius = Math.max(42, Math.min(width * 0.17, 110));
    const lineX = pointer.x - pointer.previousX;
    const lineY = pointer.y - pointer.previousY;
    const lengthSquared = lineX * lineX + lineY * lineY;

    // A sparse projection plane gives the letterform depth without obscuring it.
    context.fillStyle = ink;
    context.globalAlpha = 0.13;
    for (let i = 0; i < 52; i++) {
      const x = (((i * 127 + 31) % 617) / 617) * width;
      const y = (((i * 73 + 19) % 401) / 401) * height;
      context.beginPath();
      context.arc(x, y, 0.65, 0, Math.PI * 2);
      context.fill();
    }

    for (const point of particles) {
      const z = point.z * cos - point.x * sin;
      const perspective = 850 / (850 - z);
      const breath = animate
        ? Math.sin(elapsed * 0.001 + point.phase * 6.28) * 1.3
        : 0;
      const baseX =
        width / 2 + (point.x * cos + point.z * sin) * scale * perspective;
      const baseY =
        height / 2 + (point.y + z * tiltY + breath) * scale * perspective;
      if (animate) {
        if (pointer.active) {
          const t =
            lengthSquared > 0
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    ((baseX + point.dx - pointer.previousX) * lineX +
                      (baseY + point.dy - pointer.previousY) * lineY) /
                      lengthSquared,
                  ),
                )
              : 1;
          const deltaX = baseX + point.dx - (pointer.previousX + lineX * t);
          const deltaY = baseY + point.dy - (pointer.previousY + lineY * t);
          const distance = Math.hypot(deltaX, deltaY);
          if (distance < radius) {
            const force = (1 - distance / radius) ** 2 * 3.2;
            const safeDistance = Math.max(distance, 1);
            point.vx += ((deltaX / safeDistance) * force + lineX * 0.009) * dt;
            point.vy += ((deltaY / safeDistance) * force + lineY * 0.009) * dt;
          }
        }
        point.vx = (point.vx - point.dx * 0.026 * dt) * Math.pow(0.86, dt);
        point.vy = (point.vy - point.dy * 0.026 * dt) * Math.pow(0.86, dt);
        point.dx += point.vx * dt;
        point.dy += point.vy * dt;
      }
      const displacement = Math.min(1, Math.hypot(point.dx, point.dy) / 45);
      context.fillStyle =
        displacement > 0.18 || point.phase > 0.86 ? glint : ink;
      context.globalAlpha = 0.45 + point.phase * 0.48;
      context.beginPath();
      context.arc(
        baseX + point.dx,
        baseY + point.dy,
        Math.max(0.55, point.radius * scale) + displacement * 0.45,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.globalAlpha = 1;
    pointer.previousX = pointer.x;
    pointer.previousY = pointer.y;
  }

  /** @param {number} now */
  function tick(now) {
    frame = 0;
    if (!canAnimate()) return;
    const delta = lastTime ? Math.min(32, now - lastTime) : 16.67;
    lastTime = now;
    elapsed += delta;
    render(true, delta / 16.67);
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (!frame && canAnimate() && particles.length) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    pointer.active = false;
  }
  function sync() {
    colors();
    if (hint)
      hint.textContent = motionAllowed() ? motionHint : "Motion paused.";
    if (!canAnimate()) {
      stop();
      if (!motionAllowed()) {
        particles.forEach((point) => {
          point.dx = point.dy = point.vx = point.vy = 0;
        });
        tiltX = tiltY = 0;
      }
      render(false, 1);
    } else {
      start();
    }
  }
  /** @param {PointerEvent} event */
  function pointAt(event) {
    if (!motionAllowed()) return;
    const bounds = field.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (!pointer.active) {
      pointer.previousX = x;
      pointer.previousY = y;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
  }
  field.addEventListener("pointerdown", pointAt, { passive: true });
  field.addEventListener("pointermove", pointAt, { passive: true });
  field.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
  field.addEventListener("pointercancel", () => {
    pointer.active = false;
  });
  field.addEventListener("pointerup", () => {
    pointer.active = false;
  });
  field.addEventListener("blur", () => {
    pointer.active = false;
  });
  field.addEventListener("keydown", (event) => {
    if (
      !motionAllowed() ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const horizontal =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const vertical =
      event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    particles.forEach((point) => {
      const force = 3 + point.phase * 5;
      point.vx += horizontal * force;
      point.vy += vertical * force;
    });
  });
  const visibility = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      sync();
    },
    { threshold: 0 },
  );
  visibility.observe(field);
  document.addEventListener("visibilitychange", sync);
  new MutationObserver(sync).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme", "data-motion"],
  });
  new ResizeObserver(resize).observe(field);
  colors();
  resize();
  seed();
  // Re-sample once the actual page font arrives; never depend on it to initialize.
  void document.fonts.ready.then(seed);
}
