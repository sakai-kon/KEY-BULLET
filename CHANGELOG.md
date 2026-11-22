# Changelog

All notable changes to KEY BULLET are documented here.

## [0.3.0] - 2026-11-22

- Replaced Supabase email/password authentication with Clerk's standard SignIn and UserButton components.
- Enabled Discord, GitHub, and email/password sign-in through the selected Clerk development instance.
- Connected Supabase requests to the active Clerk session token.
- Migrated cloud-save ownership from Supabase Auth UUIDs to Clerk string user IDs and issuer-scoped RLS policies.
- Preserved guest play, local career records, ENDLESS checkpoints, and automatic cloud synchronization.

## [0.2.5] - 2026-11-22

- Added Supabase email/password account registration, sign-in, and sign-out.
- Added per-account cloud synchronization for career stats and ENDLESS checkpoints.
- Added row-level access controls so authenticated users can access only their own save row.
- Preserved guest play and the existing local profile / transfer-code feature.

## [0.2.4] - 2026-11-22

- Renamed the dialogue prompt category to `DIALOGUE` and removed genre-specific wording from player-facing descriptions.
- Kept all 617 prompts and the internal category mapping unchanged.

## [0.2.3] - 2026-11-22

- Added 100 newly written original dialogue prompts inspired by familiar story archetypes and genres.
- Kept series titles and character names out of the prompt text and metadata; no existing dialogue was copied.
- Increased the total prompt library to 617 unique entries.

## [0.2.2] - 2026-11-22

- Expanded the prompt library to 517 total prompts (including 500 additional Japanese prompts).
- Reworked bullet patterns with a sweeping wide fan and alternating flank shots to remove permanent safe camping zones while keeping temporary dodge gaps.

## [0.2.1] - 2026-11-22

- Reworked Japanese input matching to preserve spaces and punctuation while normalizing Unicode compatibility forms.
- Fixed mistake counting so continuing to type after one typo does not repeatedly add danger; corrections are re-evaluated immediately.
- Prevented IME candidate-confirmation Enter from being treated as a fire command.
- Added automated tests for Japanese exact matching, prefixes, edits, Unicode forms, and code whitespace.

## [0.2.0] - 2026-11-22

- Added a first-run tutorial and a replayable guide.
- Added a responsive gameplay layout designed to fit the viewport while preserving usable input controls.
- Switched Japanese prompts from romaji matching to direct Japanese IME-confirmed text matching.
- Added IME composition handling so conversion candidates are not treated as mistakes.
- Added red input-field and feedback text for incorrect committed input.
- Added player profiles and single-credential transfer import/export.
- Added a centralized version display sourced from `package.json`.

## [0.1.0] - Initial beta

- Initial KEY BULLET beta with STORY and ENDLESS modes, typing prompts, and bullet-hell gameplay.
