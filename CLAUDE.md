# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Project

Static, multi-page personal portfolio site (no build step, no framework).
Live: https://eddieooi.github.io/eddie-ooi-portfolio/
Built on a BootstrapMade template ("iPortfolio"-style), heavily customized.

## Stack

- HTML5 + Bootstrap 5 + vanilla JS (no React/Vue, no bundler)
- Vendor libs in `assets/vendor/`: AOS (scroll animations), GLightbox, Swiper
- Custom styles in `assets/css/main.css` — check for `:root { --accent-color, --background-color, ... }`
  custom properties before hardcoding colors
- Custom JS in `assets/js/main.js`

## Structure

- `index.html` — the single-page main site (hero/about/resume/portfolio/services/contact sections)
- `portfolio-<slug>.html` — one standalone detail page per project (e.g. `portfolio-vr.html`,
  `portfolio-sanguine_echoes.html`). Each is a full HTML document, not a partial.
- `assets/img/portfolio/<slug>/` — screenshots for each project, referenced from its detail page
  and from the thumbnail card in `index.html`'s Portfolio section

## Conventions

- No build/compile step. Preview by opening `index.html` directly or serving the folder
  with any static server (e.g. `npx serve .`). There is nothing to `npm install` or `npm run build`.
- Every `<head>` repeats the same favicon/fonts/vendor CSS `<link>` block — keep new pages consistent
  with that block rather than inventing a new one.
- **Shared UI elements (preloader, nav, footer, etc.) must be added to `index.html` AND every
  `portfolio-*.html` page** — there's no templating/includes system, so changes are duplicated by hand
  (or by asking Claude Code to sweep all HTML files at once).
- New portfolio project = new `portfolio-<slug>.html` page + a new thumbnail card added to the
  Portfolio grid in `index.html` + images under `assets/img/portfolio/<slug>/`.
- Deployed via GitHub Pages from the `main` branch — no CI/build pipeline.

## When making a repo-wide change

List all HTML files first (`index.html` + everything matching `portfolio-*.html`) and confirm the
edit was applied to each one before finishing, since there's no shared layout to catch a missed page.