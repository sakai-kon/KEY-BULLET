# KEY BULLET

**KEY BULLET** is a cyber-minimal 2D typing + bullet-hell game built with Vite, TypeScript, HTML5 Canvas, and Web Audio API.

> Type. Dodge. Survive.

## Features

- **STORY** — three stages, each with a segmented boss health bar and escalating pixel-art forms.
- **ENDLESS** — infinite waves with an automatic local checkpoint after each cleared wave.
- **Five typing categories** — code, original anime-style lines, mixed random, short Japanese text, and long Japanese text.
- **Two alternating phases** — untimed typing to power the next shot, followed by a 20-second bullet-hell dodge phase.
- **Romaji variants** — common `si/shi`, `ti/chi`, `tu/tsu`, `hu/fu`, and `nn/n` input variants are normalized.
- **Movement** — WASD or arrow keys, Shift for slow movement and core visibility, plus relative pointer dragging on the canvas.
- **Bomb** — `Ctrl + C` clears all bullets during the dodge phase.
- **Graze scoring**, accumulated danger orbs after typing mistakes, and three escalating boss color forms.
- **Generated 8-bit audio** — music and sound effects are synthesized with Web Audio API; no audio files are loaded.
- **Career record tools** — copy a plain-text record and export/import all career stats with `KB-BETA-...` transfer codes.
- **No external image or audio assets** — all art is drawn from symmetric pixel arrays and all sound is synthesized in-browser.

## Requirements

A modern desktop browser and a physical keyboard. The layout also supports tablets with an attached keyboard. Touch-only play is not supported.

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

The Vite build is static and can be deployed to GitHub Pages or Cloudflare Pages. No backend or environment variables are required.

## Persistence and transfer

- Settings and career records are kept in browser `localStorage`.
- Endless checkpoints are saved after a wave is cleared.
- The transfer code is a versioned Base64-encoded JSON payload. It is a portability feature, **not encryption**; do not put secrets in it.

## Controls

| Input | Action |
|---|---|
| Type prompt + Enter | Fire a powered shot |
| WASD / Arrow keys | Move during bullet phase |
| Shift | Slow movement and show the core |
| Ctrl + C | Bomb / clear all bullets |
| Drag in the canvas | Relative movement during bullet phase |

## Project structure

```text
src/
  audio.ts        Web Audio music and SFX generator
  data.ts         Typing prompt categories and romaji normalization
  engine.ts       Canvas renderer, phases, bullets, scoring and progression
  main.ts         UI, input wiring, menus, stats and modal behavior
  persistence.ts  Local saves and transfer-code import/export
  pixel.ts        Symmetric 24x24 pixel sprite arrays and palettes
```
