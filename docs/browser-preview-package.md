# Downloadable browser preview

`releases/Hints-Trainer-V1-Browser-Preview.zip` is a self-contained desktop-browser coaching preview. Extract the entire archive and open `Hints-Trainer-V1-Preview/START-HERE.html`. No Python, Node, or native installer is needed to use it. Keep the extracted files together.

The launch page walks through HINTS → Load practice layout → Find a shot → progressive hint levels → Set up this shot → Execute Shot. Existing trainer state uses a different storage namespace. This download does not upgrade or replace a native trainer installation.

The package is 729,750 bytes (about 730 KB decimal). It includes the trainer, coaching modules/styles, manifest, icons, launch page, instructions, and a per-file SHA-256 manifest. Optional 44 MB photo-analysis assets and native installers are omitted. Photo controls and feedback integrations are removed/hidden in the package-only HTML. Service-worker registration is skipped for local-file execution. On an appropriate HTTP(S) host the existing service worker remains available.

The source manifest also no longer references a maskable icon that is absent from the repository. Existing ordinary icons are retained. No new maskable-icon artwork is claimed.

## Rebuild and tests

Run `python scripts/build-browser-preview.py` to rebuild the ZIP from an explicit source allowlist. ZIP metadata is fixed so the same inputs produce identical bytes. `BUILD-CONTENTS.json` lists each included file's length and hash. The committed archive is the tested artifact, not a download of the entire repository.

Run `node tests/browser-package.cjs` with Playwright/Chromium available. The optional `HINTS_CHROMIUM_HELPER` works as in the existing browser suite. The test extracts the actual ZIP, checks its contents and hashes, verifies deterministic rebuilding, then opens the launch page using `file://`. It exercises 8-ball and 9-ball coaching with network access disabled, control application, original-state isolation, and JavaScript error collection.

All eight package checks passed. A known 9-ball layout used 75 search simulations. Across three trials in this headless Chromium environment:

| CPU setting | Search | Additional zone sampling |
| --- | --- | --- |
| Baseline | 219–262 ms | 62–85 ms |
| Synthetic 4× slowdown | 694–760 ms | 198–215 ms |

These are measurements for one practice layout on this host, not ordinary-PC or Android guarantees. They include cooperative scheduler delays. The JSON report preserves all six trials. The slowdown test is not Android emulation or physical-device acceptance.

Mobile browsers may not permit opening an extracted application folder as desktop browsers do. This archive is not an APK or phone installation solution. Physical Android, projected-table calibration/readability, and human coaching review remain outstanding. The separate native wrappers still target the original product; they are not distributed here.
