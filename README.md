# Vidhyut Gopinath — portfolio

Personal portfolio for Vidhyut Gopinath, Software Engineer III at Cisco Secure Firewall.

## Development

Requires Node 22.12+ (or a supported newer LTS).

```sh
npm ci
npm run dev
npm run check
npm run build
```

The production build is generated in `dist/`. The repository root is also a complete static site, preserving the existing GitHub Pages branch deployment. `.nojekyll` prevents template processing. No runtime services or secrets are required.

The source is semantic HTML, CSS layers and media queries, and type-checked JavaScript with JSDoc. Vite provides development and production bundling. No component framework is shipped to visitors.

## Editing

- Content and metadata: `index.html`
- Theme, layout, responsive behavior and motion: `assets/css/portfolio.css`
- Engineering diagram, theme, motion controls and scroll progress: `assets/js/portfolio.js`
- Resume: update the same PDF in `resume/` and `public/resume/`

The engineering diagram is a conceptual map of areas of practice, not a representation of proprietary Cisco architecture. Project Glasswing is described only at the general contribution level authorized by Vidhyut. The two earlier projects link to their public repositories; StudyAid is identified as a team project.

Core content and links work without JavaScript. System reduced-motion preferences are respected, and optional local preferences never contain personal data. Project images are served as optimized WebP files; no analytics or tracking scripts are included.
