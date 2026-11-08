# Vidhyut Gopinath — From the board up

Personal portfolio for Vidhyut Gopinath, Software Engineer IV at Cisco Secure Firewall since November 2026.

## Design direction

A custom hardware-inspired identity in Sky Blue, silver, and midnight navy. A CSS 3D exploded platform introduces the work; its VG particle signature responds to pointer, touch, and keyboard input. Visitors can assemble the platform and isolate hardware, platform OS, or security. The model is explicitly conceptual, not proprietary Cisco architecture.

The content moves from current platform bring-up to measured engineering outcomes, organizational AI-native engineering work, and career context. No invented project claims, grades, promotion-speed comparisons, or confidential architecture. Glasswing remains limited to the authorized general contribution statement.

Research informed the redesign, accessed November 7, 2026:

- [Linear](https://linear.app/): specific work presented with visual product demonstrations and clear hierarchy.
- [Teenage Engineering](https://teenage.engineering/): distinctive hardware identity and product-focused presentation.
- [Lusion](https://lusion.co/): interaction and spatial storytelling as part of the identity.
- [WebKit: scroll-driven animations](https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/): native scroll timelines, progressive enhancement, and reduced-motion preferences.
- [Chrome: scrollytelling guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/scrollytelling): scroll-linked presentation without taking over native scrolling.
- [MDN: transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style): preserving nested 3D geometry; avoiding flattening on the model ancestors.
- [W3C reduced-motion technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html): honoring motion preferences.

This is an original composition, not a reproduction of a reference site. No claim is made to represent every current design trend.

## Development

Requires Node 22.12+ or a supported newer LTS.

```sh
npm ci
npm run dev
npm run check
npm run build
```

GitHub Pages serves `main` at the repository root. `.nojekyll` prevents template processing. The root remains a complete static site; Vite also generates a production bundle in `dist/`. No runtime framework, WebGL dependency, server, analytics, or secrets are shipped.

## Source

- `index.html`: semantic content, metadata, abstract board artwork, native expandable case studies.
- `assets/css/portfolio.css`: layout, CSS 3D model, responsive rules, progressive scroll animations.
- `assets/js/portfolio.js`: motion preferences, layer selection, assembly, pointer tilt.
- `assets/js/projection.js`: capped-density particle canvas; rendering stops offscreen, while hidden, or paused.
- `assets/fonts/`: self-hosted Google Fonts with their OFL licenses.
- `assets/img/social-preview.png`: social share card. Its source is `scripts/build-social.py` (Pillow; downloads the display font temporarily).
- `resume/` and `public/resume/`: identical current PDF, retained for root Pages and Vite output.

Core content, links, and expandable case studies work without JavaScript. The model has static geometry and the VG canvas has a typographic fallback. Motion starts paused when the OS requests reduced motion; a separate pause control stops ongoing animation. Native vertical scrolling and pinch zoom are preserved. The CSS scroll timeline effects are optional enhancements.

## Content maintenance

The résumé is the source for existing impact figures. New platform work is described as accelerated bring-up; no unsupported record or speed comparison is published. The 200+ figure is a forum audience, not a management headcount. Keep the résumé date at November 2026–present and retain earlier public projects as earlier work.
