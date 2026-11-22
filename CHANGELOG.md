# Changelog

All notable changes to KEY BULLET are documented here.

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
