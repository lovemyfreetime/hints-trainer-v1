# Hint guidance development preview

This branch loads the existing rules/search modules into `index.html` and adds a readable HINTS panel. It remains a draft development build, not a published installer or completed V1 release.

## What can be tried

Open the development page, select HINTS, choose 8-ball or 9-ball and the current group/foul history, then select Find a shot. Load practice layout provides a reversible two-shot example; Undo Last Shot restores the previous table. The five cumulative levels reveal target/pocket, position guide, aim/route, speed/spin, and explanation. Set up this shot copies the verified first shot's controls without animating it automatically; Undo also restores that change.

Search and zone sampling cancel when a preview refresh or game setting changes. A captured-state comparison also guards completed results and applying controls. Table overlays remain visible when the panel is closed, and are cleared on relevant edits. The top option alone is shown in this preview. Projector windows do not yet receive the new hint state.

The panel uses 18px body/control text, controls at least 48px tall, focus outlines, status announcements, and keyboard dismissal. Setup collapses when a plan is ready. It fits a 390px-wide viewport; the legacy trainer itself still expects a larger landscape canvas. Device-specific layout and usability testing remain pending.

## How position guides are obtained

`src/zones-v1.js` tests a 5-by-5 grid around the predicted cue-ball endpoint, spaced one ball radius apart. All other balls keep their actual post-shot positions. At each point it regenerates the same next-shot route and variant, then checks the simulator and rules. This permits re-aiming to the same route from a different cue position, not reuse of an absolute aim point.

Only grid cells with four successful corners contribute to a guide. Cells must connect to the predicted endpoint. Irregular areas retain their individual supported cells rather than filling unsupported holes. Circles, lanes, and wedges are smaller geometric shapes contained in those supported cells. A shape can be unavailable; the UI says so rather than fabricating one. This is a small local sampled region, not an optimized shape or proof of continuous safety between samples. Up to 25 additional simulations run after the bounded shot search, with cancellation and cooperative yielding.

These shapes do not yet encode a professional coach's preferred angle, side of a position line, speed tolerance, or strategic use of a lane versus a wedge. That refinement and the 20–30 end-to-end coaching acceptance layouts are still needed.

## Isolation and offline behavior

The development page now uses separate state/layout/run/calibration/photo database names and a Hints V1 manifest identity. Its service worker uses a separate cache prefix, looks up its own cache for offline fallback, and precaches all coaching scripts/styles with the page. This prevents this worker's activation cleanup from deleting the original trainer's caches. Do not host two service workers at the same URL scope; use the independent repository/deployment path.

Existing Windows/Android wrappers and installer links still target the original application and have not been rebuilt or distributed. The optional photo-analysis model/CDN features are outside the offline coaching guarantee.

## Validation

- 6 new zone checks: supported shapes, holes/failed center, unavailable continuation, actual simulator sampling and state preservation, and cancellation.
- 10 Chromium UI checks against the real page: controls, 8/9-ball plans, progressive levels, all shapes, applying controls, edit cancellation, narrow viewport/keyboard behavior, undo, offline reload, and absence of JavaScript exceptions.
- Existing numerical gates: 54 rules checks, 24 search checks, and 15 simulation-interface checks.

Run the numerical suites with Node. The browser suite needs Playwright and a Chromium binary; it starts a temporary local HTTP server automatically. Use `node tests/hints-browser.cjs` with a standard Playwright browser installation. An optional `HINTS_CHROMIUM_HELPER` module can provide an executable path/launch arguments when using an alternate headless Chromium package. No browser-testing dependency is loaded by the app.

The standard browser download failed in this environment; an alternate packaged Chromium ran the tests successfully. Desktop and narrow-viewport screenshots were inspected, and label/select sizing was corrected after that inspection. This does not establish physical Android performance, projector integration, installation acceptance, or coaching accuracy on a real table.
