# Changelog

## 0.1.1

- Preserve scroll stock and wand condition and uses when native spell-card creation is canceled.
- Require items to be held or equipped as specified by their usage before casting.
- Resume interrupted staff casts and preparations from the recorded action. Staff cast recovery verifies the original card and resumes only unfinished payments.
- Release the previous staff reservation when its owner prepares a replacement after resting.
- Add the bounded `receiptsV1` casting and preparation API for integrations.

## 0.1.0 — 2026-10-18

Initial public release. Wands, scrolls and staff spells together on the Spellcasting page.

Tested with Foundry VTT 14.369 and PF2e 8.6.0. See the README for coverage and limitations.
