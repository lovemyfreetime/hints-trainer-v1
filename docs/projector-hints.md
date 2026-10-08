# Projector hint synchronization

The development HINTS panel now has an **Open projector view** button inside Game and practice setup. It opens/reuses a named window at the same application path with `?projector=1`. Allow pop-ups for the development page if needed. Move that window to the projector display and use the existing calibration controls.

The controller sends the table and current guidance together. The projector uses the same calibrated table mapping to draw the target, pocket, aim, and position guide. Levels four and five also show a compact speed/spin and explanation overlay. The projector does not rerun search or alter the controller's table. Its coaching controls are hidden.

New windows and projector reloads request the current state after the hint renderer initializes. Changing level or shape synchronizes immediately. Applying a shot, editing a layout, changing game settings, cancelling, or starting an animation clears obsolete guidance. The completed search is still checked against its captured table before display or application.

Projector messages must come from the actual opener at the same origin. The controller responds to readiness only from its tracked projector window. Received hint source snapshots must match the accompanying table. A projector opened independently without an opener does not receive a controller's state. If the controller page itself reloads, use Open projector view again to reconnect the named window. This supports one projector window per controller.

The service-worker cache version is advanced so the preview can install the updated controller and renderer together. Hosting/installer deployment remains separate. This does not synchronize animated ball frames; the existing projector shows the static table and then the committed shot endpoint. Guidance is cleared while the controller animates.

## Validation

`tests/hints-browser.cjs` now contains 14 Chromium checks, extending the previous 10 rather than adding another independent 14. The new checks cover opening the projector after search, selected level/shape changes, projector reload and unrelated-sender rejection, and clearing on animation. The existing apply test additionally checks projector clearing. The full suite also exercises both games, Undo, narrow viewport, and successful offline search. A projector screenshot was visually inspected.

The 15-check simulation interface regression also passes. Previously passing rules/search/zone suites are unchanged (54/24/6); this step does not claim another physical device test. Hardware projection calibration, brightness/readability at the table, and Android performance still need hands-on acceptance. The preview is not yet a completed V1 release.
