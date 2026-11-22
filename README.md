# KEY BULLET

**Current version: `v0.4.0` (Beta)**

**KEY BULLET** is a cyber-minimal 2D typing + bullet-hell game built with Vite, TypeScript, HTML5 Canvas, and Web Audio API.

> Type. Dodge. Survive.

## Features

- **STORY** — three stages, each with a segmented boss health bar and escalating pixel-art forms.
- **ENDLESS** — infinite waves with an automatic local checkpoint after each cleared wave.
- **Five typing categories / 617 prompts** — code, original dialogue-style lines across adventure, school, mecha, sports, fantasy, music, mystery, and sci-fi themes, mixed random, short Japanese text, and long Japanese text.
- **Two alternating phases** — untimed typing to power the next shot, followed by a 20-second bullet-hell dodge phase.
- **Japanese IME input** — type Japanese prompts directly with your IME and confirm kanji/kana conversion; conversion composition is not evaluated until committed. Code prompts are entered as displayed.
- **Dynamic bullet patterns** — wide sweeping fans and alternating flank shots make fixed camping spots unsafe while preserving moving gaps.
- **Movement** — WASD or arrow keys, Shift for slow movement and core visibility, plus relative pointer dragging on the canvas.
- **Bomb** — `Ctrl + C` clears all bullets during the dodge phase.
- **Graze scoring**, accumulated danger orbs after typing mistakes, and three escalating boss color forms.
- **Generated 8-bit audio** — music and sound effects are synthesized with Web Audio API; no audio files are loaded.
- **Career record tools** — copy a plain-text record and export/import all career stats with `KB-BETA-...` transfer codes.
- **Online accounts** — Clerk standard authentication UI with Discord, GitHub, and email/password; Supabase stores per-account career stats and ENDLESS checkpoints. Guest play remains available.
- **Admin console** — a Clerk public-metadata role gates global announcements, drafts, publishing, editing, deletion, and maintenance notices; Supabase RLS enforces write permissions too.
- **Online multiplayer beta** — room-code lobbies, 1v1 PVP, and 2–4 player Link Raids using private Supabase Realtime channels. Guest play remains local.
- **No external image or audio assets** — all art is drawn from symmetric pixel arrays and all sound is synthesized in-browser.

## Requirements

A modern desktop browser and a physical keyboard. The layout also supports tablets with an attached keyboard. Touch-only play is not supported.

## Development

The selected Clerk publishable key is configured in `src/cloud.ts`. It is a public browser key, not a secret. Then run:

```bash
npm install
npm run dev
```

## Typing logic tests

```bash
npm run test:typing
```

## Production build

```bash
npm run build
npm run preview
```

The Vite build is static and can be deployed to GitHub Pages or Cloudflare Pages. The browser uses only public Clerk and Supabase publishable keys. Never add a Clerk Secret Key or Supabase secret/service-role key to frontend code.

### Clerk dashboard configuration

- Use the existing `KEY_BULLET` Clerk application.
- Enable Discord and GitHub under social connections.
- Enable email address and password sign-in, and require email verification.
- Add `https://sakai-kon.github.io` as an allowed origin / redirect host where the Clerk dashboard requests it.
- The development instance is configured to include the `role: authenticated` claim in session tokens.
- In **Sessions → Customize session token**, add the claim `"metadata": "{{user.public_metadata}}"` while preserving the existing `role: authenticated` claim.
- To grant the project owner administrator access, set their **public metadata** to `{ "role": "admin" }` in the Clerk Dashboard after the account exists. Use public metadata, not unsafe metadata; refresh the session after changing it.

### Supabase dashboard configuration

- Keep the **Data API** enabled and include `public` in the exposed schemas.
- Under **Authentication → Sign In / Providers → Third-Party Auth**, add Clerk using the issuer domain `https://special-gannet-902.clerk.accounts.dev`.
- In Clerk's **Connect with Supabase** setup, make sure the same Clerk instance is connected to the Supabase project.
- Keep RLS enabled on `public.player_cloud_saves`. The policies restrict every operation to the matching Clerk issuer and the current JWT subject.
- Enable the Supabase Realtime service. The multiplayer migration creates private room/roster tables, room-management RPCs, and `realtime.messages` RLS policies; the client joins channels with `private: true`.
- Online rooms require a Clerk session. PVP supports 2 players; Link Raid supports 2–4 players. The host closes the room when leaving.
- The `public.game_announcements` table is created by the tracked migration. Published notices are readable publicly; only tokens whose `metadata.role` is `admin` can create, edit, or delete notices.
- The database stores Clerk IDs as text; it no longer references `auth.users`.
- The browser uses only the Supabase publishable key. Never add a `service_role` or secret key to the frontend.

## Online multiplayer beta

- Open **ONLINE** from the top bar, choose PVP or Link Raid, and create a room. Share the six-character room code with a signed-in player.
- PVP is a 1v1 typing duel. Each completed prompt sends an attack; three received hits end the match.
- Link Raid supports 2–4 players. The room host processes typing attacks and broadcasts shared boss HP.
- This first beta uses Supabase Realtime as a relay, not direct WebRTC peer-to-peer. Match balance, disconnect recovery, and authoritative anti-cheat are not final; do not treat PVP scores as competitive rankings.

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
  data.ts         Typing prompt categories and Japanese text matching
  engine.ts       Canvas renderer, phases, bullets, scoring and progression
  main.ts         UI, input wiring, menus, stats and modal behavior
  persistence.ts  Local saves and transfer-code import/export
  cloud.ts        Clerk authentication and Supabase cloud synchronization
  admin.ts        Clerk-role-gated announcement and maintenance controls
  multiplayer.ts  Private Realtime lobby, PVP hits, and shared Link Raid HP
  pixel.ts        Symmetric 24x24 pixel sprite arrays and palettes
```

## Versioning

- The application version is maintained in `package.json`.
- The header badge is injected automatically from that version during the Vite build.
- Add a dated entry to `CHANGELOG.md` whenever the version is changed.
- Follow Semantic Versioning: increment patch for fixes, minor for backward-compatible features, and major for incompatible changes.
