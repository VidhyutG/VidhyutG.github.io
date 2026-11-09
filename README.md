# Vidhyut Gopinath — I bring firewalls to life.

Personal portfolio for Vidhyut Gopinath, Software Engineer IV at Cisco Secure Firewall since November 2026.

## Design and behavior

An original hardware-inspired identity: warm paper, sky-blue glass, midnight navy, and copper-colored vias. The hero is an interactive conceptual platform with three layers, real procedural trace routing, a boot sequence, and a VG point projection. Every visit generates a board revision; `?rev=3FA2` pins a repeatable layout. The model is explicitly illustrative, not a Cisco product or architecture.

Visitors can drag or use the arrow keys to turn the platform, press Home to reset its pose, select a layer, assemble the stack, and route a new revision. Native scrolling and pinch zoom remain available. Animation pauses offscreen or in a hidden tab. Reduced-motion preferences start it paused; the pause control also stops ambient CSS motion. Light and dark preferences are remembered locally. There are no trackers, frameworks, WebGL libraries, remote fonts, or runtime services.

The content leads with platform ownership, then measured outcomes, engineering leadership, career context, and contact details. Core content and links remain available without JavaScript; the board has an SVG fallback.

## Edit the site

| File                            | Purpose                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `index.html`                    | All professional copy, dates, metrics, links, page metadata, and static figures                        |
| `assets/css/site.css`           | Design tokens, typography, glass surfaces, layout, responsive rules, and CSS motion                    |
| `assets/js/app.js`              | Theme and motion controls, worker lifecycle, board controls, timeline cursor, and contact interactions |
| `assets/js/exhibit/scene.js`    | Canvas rendering, cached layers, boot sequence, particles, pointer and keyboard input                  |
| `assets/js/exhibit/generate.js` | Seeded conceptual-board layout and net generation                                                      |
| `assets/js/exhibit/route.js`    | Octilinear A* routing                                                                                  |
| `assets/js/exhibit/worker.js`   | Routing off the main thread                                                                            |
| `scripts/build-social.py`       | Rebuild the social-preview image from local fonts and the same board generator                         |
| `assets/fonts/`                 | Self-hosted fonts and their Open Font Licenses                                                         |
| `resume/` and `public/resume/`  | Identical current PDFs for root GitHub Pages and the Vite build                                        |

The older `portfolio.css`, `portfolio.js`, and `projection.js` are superseded and are not loaded by this design.

## Local development

Use Node 22.12+ or a supported newer LTS.

```sh
npm ci
npm run dev
npm run check
npm run build
```

`npm run check` type-checks all active JavaScript, validates static links and PDFs, and tests the procedural board. `npm run build` produces `dist/`. For final visual review, check the static repository root too: that is what GitHub Pages serves.

The social card uses Python with Pillow plus Node on PATH. It makes no network requests:

```sh
python3 scripts/build-social.py
```

Set `NODE_BINARY` to the Node executable if needed.

## Résumé source

In the local Codex workspace, the matching one-page résumé is authored in `../resume-source/resume.html`. Its builder is `../resume-source/build_resume.mjs`; Google Chrome renders the PDF using a temporary isolated profile. It fails if the result has more than one page.

```sh
node ../resume-source/build_resume.mjs
```

The final PDF is `../output/pdf/Vidhyut_Gopinath_Resume.pdf`. Inspect it before updating both repository copies; the optional `--publish` flag copies it to those paths. The earlier Python/Word generator is a previous design, not the current PDF source.

## Publishing

GitHub Pages serves the `main` branch at the repository root; `.nojekyll` prevents template processing. Commit and push the source files and current PDFs, then confirm the Pages build for that commit and inspect [the live site](https://vidhyutg.github.io/). No `dist/` deployment or separate hosting service is required.

## Content guardrails

- Keep the current role at November 2026–present.
- Application deployment fell from approximately four hours to 35 minutes, approximately 85% less time. This is separate from FXOS Service Manager memory optimization.
- The 4+ figure describes scope spanning teams, not managed headcount. The 200+ figure is an AI-for-SDLC forum audience.
- Describe the two current platforms as accelerated bring-up; do not invent record-breaking comparisons or platform names.
- Glasswing is limited to the authorized general contribution statement: work from Cisco's next-generation firewall OS team fixing critical vulnerabilities.
- Do not add internal grades, promotion-speed comparisons, private architecture, or executive endorsements.
- Earlier public projects remain identified as earlier work.

The prior research notes are in the workspace's `output/Resume_Research_and_Notes.md`. The November redesign drew on hardware product presentation and native web interactions, including [Teenage Engineering](https://teenage.engineering/), [Linear](https://linear.app/), [Lusion](https://lusion.co/), and [W3C reduced-motion guidance](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html).
