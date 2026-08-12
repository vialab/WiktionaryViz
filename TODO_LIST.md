# WIKTIONARYVIZ GEOSPATIAL INTERACTION TODO LIST (Consolidated)

Priority key:
P0 = must-have for the core prototype
P1 = high-value thesis/demo feature
P2 = polish, export, or quality-of-life feature
P3 = small fixes / research instrumentation

Notes: Related and overlapping tasks have been grouped into focused epics to reduce duplication and clarify implementation scope.

---

## Epic: Core — Recommendations & Guidance
- **P0 — Improve recommendation logic and explanation text**: Rework scoring to avoid over-biasing descendant paths or translations and provide clearer explanation text for recommendations (makes Inspire Me results understandable and trustworthy).
- **P1 — Add hover/help affordances for hidden or dense information**: Add question-mark affordances, explicit hint text, and discoverable hover targets for dense/explanatory content.

## Epic: Map Features
- **P1 — Add route/journey visualization**: Show directional paths or arcs representing possible linguistic movement across regions.
- **P1 — Add minimap / overview map**: Small overview map showing current viewport and distribution of visible data.
- **P1 — Add custom region grouping**: Let users group data by language family, geographic area, historical region, or user cluster.


## Epic: Saved Views & Sharing
- **P1 — Implement VisualizationState serialization**: Serialize map state (search term, camera, zoom, layers, filters, timeline, selected item, annotations).
- **P1 — Add local state‑saving**: Persist named VisualizationState objects to localStorage.
- **P1 — Add saved view manager**: UI for save/rename/duplicate/load/delete saved views.
- **P1 — Add shareable state links**: Encode VisualizationState in URL or backend ID for sharing.
- **P1 — Add state import/export as JSON**: Download/upload saved view JSON; supports reproducibility and study materials.
- **P2 — Add saved view sequence**: Arrange saved states into a slideshow/sequence for narratives.

## Epic: Annotations & User Data
- **P1 — Add marker‑attached annotations**: Notes attached to word/language markers.
- **P1 — Add route‑attached annotations**: Notes attached to specific etymological routes.
- **P1 — Add path highlighting annotations**: Manually highlight interpreted historical paths.
- **P1 — Add custom user‑created connections**: Allow drawing and labeling hypothetical links between markers.
- **P1 — Distinguish system data from user annotations**: Styling/labels to prevent confusion between Wiktionary data and user hypotheses.
- **P1 — Add annotation categories**: Tag notes as Observation/Hypothesis/Question/Teaching/Presentation.

## Epic: Compare Mode
- **P1 — Add compare mode**: Split-screen or toggle to compare two words, families, periods, or relation types.
- **P1 — Add side‑by‑side map comparison**: Two map views with independent layer/filter settings.
- **P1 — Add synchronized pan/zoom in compare mode**: Optional linking of viewports between comparison maps.
- **P1 — Add difference view**: Visualize what appears/disappears or changes between two selected states.

## Epic: Export & Presentation
- **P2 — Export current map as PNG**
- **P2 — Export current map as SVG**
- **P2 — Export map with/without annotations**: Toggle annotations in exported assets.
- **P2 — Export selected data as JSON**: Download structured data for the current view.
- **P2 — Add presentation mode**: Fullscreen, simplified controls, larger labels.
- **P2 — Add hide‑controls mode**: Temporarily hide UI chrome for screenshots/presentations.
- **P2 — Add high‑contrast / presentation labels**: Readability for projection and screenshots.

## Epic: Demo, Reliability & Offline
- **P2 — Add offline/demo mode**: Preloaded example datasets and tile/data fallbacks.
- **P2 — Add cached demo words**: Bundle example word histories that always work for demos.
- **P2 — Add static fallback rendering**: Static image or simplified fallback if interactive map fails.

## Epic: Performance & Visual Simplification
- **P2 — Add performance optimization for dense maps**: Clustering, canvas/WebGL, memoization, viewport rendering.
- **P2 — Add route bundling or route simplification**: Reduce clutter by bundling similar routes or simplifying paths at low zoom.

## Small / Instrumentation Items (P3)
- **P3 — Add loading indicator for descendants**
- **P3 — Change opacity of other branches in descendants mode**
- **P3 — Fix: Escape doesn't exit annotation mode**
- **P3 — Add events logger**: Record button clicks, node clicks, etc. for research.

---

If you'd like, I can:
- Expand each epic into smaller implementation tasks with estimated effort.
- Update the `priority` tags per epic (if you prefer a different mapping).
- Create GitHub issues or project cards from these epics.
