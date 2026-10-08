# Hints Trainer V1 — Development Preview

Offline 8-ball and 9-ball coaching built on the existing Billiards Trainer simulator. The preview offers bounded two-shot search, five progressive hint levels, sampled position guides, and a synchronized projector window.

## Try the browser preview

Download [Hints-Trainer-V1-Browser-Preview.zip](releases/Hints-Trainer-V1-Browser-Preview.zip), extract all files, and open `Hints-Trainer-V1-Preview/START-HERE.html` in a desktop browser. No native installation is needed. This is separate from the original trainer and is not an Android installer.

The included practice layouts provide a quick starting point. Use HINTS, Load practice layout, and Find a shot. These are experimental direct-shot recommendations; banks, kicks, breaks, and touching-ball cases are not coached yet. Sampled position guides are not guaranteed safe regions.

## Development status

See [package details and measurements](docs/browser-preview-package.md), [hint controls](docs/hint-guidance-preview.md), [projector integration](docs/projector-hints.md), and [30 fixed-layout checks](docs/coaching-layouts-v1.md). The numerical interfaces and rules boundaries are documented in `docs/`.

This is a draft preview, not a completed V1 release. Hardware/device acceptance, strategy refinement, and native distribution remain pending. The original `lovemyfreetime/billiards-trainer` repository is unchanged by this development branch.

Build the small package with `python scripts/build-browser-preview.py`. The optional large photo models and legacy native wrappers are deliberately excluded from that package.
