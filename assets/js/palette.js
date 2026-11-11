// @ts-check
/**
 * The command palette: everything the page can do, a keystroke away.
 * It opens with ⌘K or Ctrl+K, with "/", or from the button in the header,
 * and is built on a native <dialog>, so focus is held and Escape closes it.
 */

/**
 * @typedef {object} Command
 * @property {string} group heading the command is listed under
 * @property {string} label what it does, in the reader's words
 * @property {string} [hint] a short note shown beside it
 * @property {string} [keywords] other words that should find it
 * @property {() => void} run
 */

/**
 * How well a query matches some text: every letter of the query must appear
 * in order. Runs of adjacent letters and matches at the start of a word score
 * higher. Returns -1 for no match.
 * @param {string} query @param {string} text
 */
export function score(query, text) {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  if (!q) return 0;
  // The query as typed, found whole, beats any scattered match.
  const whole = t.replace(/\s+/g, "").indexOf(q);
  const direct = t.indexOf(query.toLowerCase().trim());
  if (direct >= 0)
    return (
      100 + (direct === 0 || t[direct - 1] === " " ? 10 : 0) - direct * 0.01
    );
  if (whole >= 0) return 60 - whole * 0.01;
  let total = 0;
  let from = 0;
  let streak = 0;
  for (const letter of q) {
    const at = t.indexOf(letter, from);
    if (at < 0) return -1;
    streak = at === from && from > 0 ? streak + 1 : 0;
    total += 1 + streak * 2 + (at === 0 || t[at - 1] === " " ? 3 : 0);
    from = at + 1;
  }
  return total - t.length * 0.01;
}

/**
 * @param {() => Command[]} commands read each time the palette opens, so labels can follow the page's state
 * @returns {{open: () => void, close: () => void, box: HTMLElement}}
 */
export function createPalette(commands) {
  const dialog = document.createElement("dialog");
  dialog.className = "palette";
  dialog.setAttribute("aria-label", "Commands");
  dialog.innerHTML = `
    <div class="palette-box glass" data-liquid="18 16">
      <div class="palette-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
        <input class="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-label="Search commands" placeholder="Search commands" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <kbd>esc</kbd>
      </div>
      <ul class="palette-list" id="palette-list" role="listbox" aria-label="Commands"></ul>
      <p class="palette-empty" hidden>Nothing matches. Try “work”, “theme”, or “email”.</p>
    </div>`;
  document.body.append(dialog);
  const box = /** @type {HTMLElement} */ (dialog.querySelector(".palette-box"));
  const input = /** @type {HTMLInputElement} */ (
    dialog.querySelector(".palette-input")
  );
  const list = /** @type {HTMLElement} */ (
    dialog.querySelector(".palette-list")
  );
  const empty = /** @type {HTMLElement} */ (
    dialog.querySelector(".palette-empty")
  );

  /** @type {Command[]} */
  let all = [];
  /** @type {Command[]} */
  let shown = [];
  let active = 0;

  function mark() {
    const options = list.querySelectorAll('[role="option"]');
    options.forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === active));
      if (index === active) {
        input.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    });
    if (!options.length) input.removeAttribute("aria-activedescendant");
  }

  function render() {
    const query = input.value.trim();
    shown = all
      .map((command, order) => ({
        command,
        order,
        match: Math.max(
          score(query, command.label),
          score(query, `${command.group} ${command.keywords || ""}`) - 2,
        ),
      }))
      .filter((entry) => entry.match >= 0)
      .sort((a, b) => (query ? b.match - a.match : 0) || a.order - b.order)
      .map((entry) => entry.command);
    list.textContent = "";
    let group = "";
    shown.forEach((command, index) => {
      // While searching, results are ranked rather than grouped.
      if (!query && command.group !== group) {
        group = command.group;
        const heading = document.createElement("li");
        heading.className = "palette-group";
        heading.setAttribute("role", "presentation");
        heading.textContent = group;
        list.append(heading);
      }
      const option = document.createElement("li");
      option.id = `palette-option-${index}`;
      option.setAttribute("role", "option");
      const label = document.createElement("span");
      label.textContent = command.label;
      option.append(label);
      if (command.hint) {
        const hint = document.createElement("small");
        hint.textContent = command.hint;
        option.append(hint);
      }
      option.addEventListener("click", () => run(index));
      option.addEventListener("pointermove", () => {
        if (active !== index) {
          active = index;
          mark();
        }
      });
      list.append(option);
    });
    empty.hidden = shown.length > 0;
    active = 0;
    mark();
  }

  /** @param {number} index */
  function run(index) {
    const command = shown[index];
    if (!command) return;
    dialog.close();
    command.run();
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step && shown.length) {
      active = (active + step + shown.length) % shown.length;
      mark();
    } else if (event.key === "Home" && shown.length) active = 0;
    else if (event.key === "End" && shown.length) active = shown.length - 1;
    else if (event.key === "Enter") run(active);
    else return;
    if (event.key === "Home" || event.key === "End") mark();
    event.preventDefault();
  });
  // A click on the dimmed page behind the palette closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  const api = {
    open() {
      if (dialog.open) return;
      all = commands();
      input.value = "";
      dialog.showModal();
      render();
      input.focus();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    box,
  };

  addEventListener("keydown", (event) => {
    const typing =
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if ((event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === "k") {
      event.preventDefault();
      if (dialog.open) api.close();
      else api.open();
    } else if (
      event.key === "/" &&
      !typing &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      api.open();
    }
  });
  return api;
}
