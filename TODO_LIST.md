WIKTIONARYVIZ GEOSPATIAL INTERACTION TODO LIST

Priority key:
P0 = must-have for the core prototype
P1 = high-value thesis/demo feature
P2 = polish, export, or quality-of-life feature


================================================================================
P0 — CORE GEOSPATIAL MANIPULATION FEATURES
================================================================================

[X] P0 — Implement a LayerPanel component
    Description: A side panel where users can toggle map layers on/off, such as markers, routes, labels, regions, annotations, and uncertainty overlays.
    Use case: Lets users control visual complexity instead of seeing every linguistic/geographic element at once.
    Research context: Interview participants wanted filtering, hiding/showing categories, and better control over what appears in visualizations.

[X] P0 — Create a layer registry/config system
    Description: Define each map layer in one structured place with an ID, name, description, default visibility, opacity, z-index, and render function.
    Use case: Makes the layer system easier to extend later without hardcoding every toggle into the map component.
    Research context: Since WiktionaryViz is layer-heavy, the tool needs a scalable way to manage many geospatial information types.

[X] P0 — Add layer visibility toggles
    Description: Users can turn individual layers on/off, such as language markers, etymological paths, borrowing routes, labels, and annotations.
    Use case: Helps users isolate one type of evidence at a time.
    Research context: Participants wanted visualizations that support exploration without overwhelming them.

[X] P0 — Add layer opacity controls
    Description: Users can adjust opacity for each layer using sliders.
    Use case: Lets users compare overlapping layers without fully hiding any of them.
    Research context: Useful when route lines, markers, regions, and labels overlap on the same map.

[X] P0 — Add layer ordering / z-index controls
    Description: Users can move layers above or below each other.
    Use case: Prevents important data from being hidden behind polygons, map regions, or dense marker clusters.
    Research context: Geospatial participants often struggle with map legibility and visual clutter.

[ ] P0 — Add “solo layer” mode
    Description: Clicking “solo” on a layer hides all other layers temporarily.
    Use case: Allows users to quickly inspect one layer, such as only borrowing paths or only uncertain data.
    Research context: Supports focused exploration and reduces cognitive load.

[ ] P0 — Add “reset layers” button
    Description: Restores all layer visibility, opacity, and ordering settings to default.
    Use case: Helps users recover from complex manipulation without manually undoing each change.
    Research context: Important for usability during open-ended exploration.

[ ] P0 — Add map fit-to-data control
    Description: A button that automatically zooms/pans the map to fit the currently visible word history, selected branch, or active filtered result.
    Use case: Helps users quickly reorient after zooming, filtering, or changing layers.
    Research context: Users need fluid movement between overview and detail.

[ ] P0 — Add reset map view control
    Description: A button that returns the camera to the default global or dataset-specific view.
    Use case: Prevents users from getting lost after heavy map manipulation.
    Research context: Basic navigation reliability is important for exploratory visualization tools.

[ ] P0 — Add marker hover previews
    Description: Hovering over a map marker shows a small tooltip with word, language, region, date, and relation summary.
    Use case: Lets users inspect data quickly without opening a full side panel.
    Research context: Participants wanted fast access to details while exploring.

[ ] P0 — Add marker click selection
    Description: Clicking a marker selects it and highlights related routes, ancestors, descendants, or evidence.
    Use case: Turns the map from a passive display into an interactive investigation space.
    Research context: Supports drill-down from geographic overview into specific linguistic evidence.

[ ] P0 — Add route/path click selection
    Description: Clicking a route line selects the relationship between two nodes and opens relation-specific details.
    Use case: Lets users ask “why are these two places/words connected?”
    Research context: Participants emphasized the need to inspect evidence behind visual connections.

[ ] P0 — Add selected-item highlight styling
    Description: Selected nodes and paths receive a distinct visual treatment, while unrelated elements are dimmed.
    Use case: Makes the current focus visually clear.
    Research context: Important for dense geospatial graphs where many elements compete for attention.

[ ] P0 — Implement an EvidenceDrawer component
    Description: A right-side drawer that displays the underlying data for a selected marker, route, region, or annotation.
    Use case: Lets users inspect Wiktionary evidence instead of trusting the map blindly.
    Research context: Participants wanted access to the data behind visualizations, especially for linguistic interpretation.

[ ] P0 — Show marker evidence in EvidenceDrawer
    Description: For selected markers, show word/form, language, gloss, region, coordinates, date, source entry, and related terms.
    Use case: Helps users understand what each map point actually represents.
    Research context: Supports close reading after macro-level geographic exploration.

[ ] P0 — Show route evidence in EvidenceDrawer
    Description: For selected routes, show source language, target language, relation type, etymology text, and supporting source data.
    Use case: Helps users evaluate whether a path represents borrowing, descent, derivation, or uncertain relation.
    Research context: Participants wanted tools to explain connections, not just visualize them.

[ ] P0 — Add data quality badges
    Description: Display badges such as “date unknown,” “coordinates inferred,” “uncertain etymology,” or “missing source text.”
    Use case: Prevents the map from implying false certainty.
    Research context: Participants repeatedly noted that linguistic datasets are incomplete, irregular, and difficult to structure.

[ ] P0 — Add basic relation filters
    Description: Users can filter visible paths by relation type: borrowed from, derived from, descended from, cognate with, compound, affix, or uncertain.
    Use case: Lets users focus on one type of linguistic relationship at a time.
    Research context: Participants wanted more task-specific control over complex linguistic datasets.

[ ] P0 — Add “show path to root” filter
    Description: Shows only the selected word’s ancestry path back through known source forms.
    Use case: Useful for tracing the historical path of a single word.
    Research context: Supports etymological storytelling and simplified exploration.

[ ] P0 — Add “show descendants” filter
    Description: Shows only descendants or later forms branching out from the selected word.
    Use case: Useful for showing how a word spread or diversified.
    Research context: Participants were interested in historical spread, movement, and linguistic branching.

[ ] P0 — Add map state object
    Description: Create a central state object for camera position, zoom, selected item, active layers, filters, and current word.
    Use case: Provides the foundation for state-saving, share links, comparison, and reproducible views.
    Research context: Users wanted to save, revisit, and communicate specific visualization states.


================================================================================
P1 — HIGH-VALUE THESIS / DEMO FEATURES
================================================================================

[ ] P1 — Implement VisualizationState serialization
    Description: Convert the current map state into a JSON object containing search term, camera, zoom, layers, filters, timeline, selected item, and annotations.
    Use case: Allows views to be saved, restored, exported, or shared.
    Research context: Participants wanted bookmarking, returning to previous analysis, and saving work across sessions.

[ ] P1 — Add local state-saving
    Description: Save VisualizationState objects to local storage in the browser.
    Use case: Users can save named views without needing an account or backend.
    Research context: Supports lightweight persistence for prototype testing and thesis demos.

[ ] P1 — Add saved view manager
    Description: A panel where users can save, rename, duplicate, load, and delete saved map states.
    Use case: Lets users build a collection of meaningful visual states during analysis.
    Research context: Participants wanted to return to useful views rather than reconstructing them manually.

[ ] P1 — Add shareable state links
    Description: Encode the current VisualizationState into a URL parameter or backend state ID.
    Use case: Users can send someone else the same map view, layer setup, timeline position, and selected word.
    Research context: Participants wanted to communicate visual findings and preserve visualization context.

[ ] P1 — Add state import/export as JSON
    Description: Users can download or upload a JSON file representing a saved visualization state.
    Use case: Useful for reproducibility, debugging, sharing study tasks, and preserving analysis sessions.
    Research context: Supports transparent and reusable research workflows.

[ ] P1 — Implement AnnotationMode
    Description: A toggle that lets users add notes, highlights, arrows, regions, and custom links directly onto the map.
    Use case: Turns the map into a sensemaking workspace rather than just a display.
    Research context: Participants wanted to annotate visualizations, add interpretations, and save observations.

[ ] P1 — Add marker-attached annotations
    Description: Users can attach a note directly to a word/language marker.
    Use case: Useful for adding interpretation, questions, teaching notes, or reminders about specific data points.
    Research context: Supports close analysis and user-generated interpretation.

[ ] P1 — Add route-attached annotations
    Description: Users can attach a note to a specific etymological route or relationship.
    Use case: Useful for commenting on uncertain borrowing paths or interesting linguistic transitions.
    Research context: Participants wanted to explain or question relationships shown in the visualization.

[ ] P1 — Add free-floating map annotations
    Description: Users can place notes anywhere on the map independent of existing data.
    Use case: Useful for observations about regions, clusters, movement patterns, or map-level interpretation.
    Research context: Supports exploratory thinking beyond what the dataset explicitly encodes.

[ ] P1 — Add region drawing annotations
    Description: Users can draw circles, rectangles, or polygons around areas of interest.
    Use case: Useful for marking geographic clusters, cultural zones, or suspected regions of influence.
    Research context: Participants wanted more flexible region-based thinking than simple country/state maps.

[ ] P1 — Add path highlighting annotations
    Description: Users can manually highlight a sequence of nodes/routes as an interpreted historical path.
    Use case: Useful for presentations, teaching, and making a visual argument.
    Research context: Participants wanted visualizations to support storytelling and explanation.

[ ] P1 — Add custom user-created connections
    Description: Users can draw a hypothetical connection between two markers and label it as a user-created relation.
    Use case: Allows users to record patterns or hypotheses the system does not automatically show.
    Research context: One interview theme was that users may see meaningful relationships based on their own expertise/context.

[ ] P1 — Distinguish system data from user annotations
    Description: Use different styling or labels for Wiktionary-derived data versus user-created notes/connections.
    Use case: Prevents user hypotheses from being confused with source-backed data.
    Research context: Important for trust, evidence, and scholarly interpretation.

[ ] P1 — Add annotation categories
    Description: Let users tag notes as Observation, Hypothesis, Question, Teaching Note, or Presentation Note.
    Use case: Helps organize annotations by purpose.
    Research context: Supports multiple use cases: research, teaching, explanation, and exploratory analysis.

[ ] P1 — Add annotation layer toggle
    Description: User annotations appear as their own layer that can be hidden, shown, or exported.
    Use case: Lets users switch between clean source-data view and interpreted/annotated view.
    Research context: Participants wanted both exploration and communication modes.

[ ] P1 — Add timeline slider
    Description: A slider that filters visible nodes/routes by time period, century, or approximate date.
    Use case: Lets users see how a word’s geographic/etymological spread changes over time.
    Research context: Participants wanted diachronic exploration of language movement and historical development.

[ ] P1 — Add timeline playback
    Description: A play/pause animation that reveals nodes/routes in chronological order.
    Use case: Useful for showing linguistic spread as a story over time.
    Research context: Participants were interested in movement, history, and temporal storytelling.

[ ] P1 — Add uncertain-date handling
    Description: Items with unknown or approximate dates are shown with special styling or grouped into an “unknown date” category.
    Use case: Prevents incomplete data from disappearing or being misrepresented.
    Research context: Linguistic historical data is often partial or uncertain.

[ ] P1 — Sync timeline with map layers
    Description: Timeline changes update visible markers, routes, labels, and regions.
    Use case: Makes time manipulation affect the whole geospatial visualization consistently.
    Research context: Supports integrated exploration rather than separate disconnected views.

[ ] P1 — Add compare mode
    Description: A split-screen or toggle-based mode for comparing two words, language families, time periods, or relation types.
    Use case: Lets users compare patterns without relying on screenshots or memory.
    Research context: Participants wanted to compare different views, datasets, and linguistic patterns.

[ ] P1 — Add side-by-side map comparison
    Description: Show two map views next to each other with separate layer/filter settings.
    Use case: Useful for comparing two etymologies or two historical stages.
    Research context: Supports structured analysis and clearer study tasks.

[ ] P1 — Add synchronized pan/zoom in compare mode
    Description: Optionally link both comparison maps so moving one moves the other.
    Use case: Helps users compare the same geographic area across two conditions.
    Research context: Useful when comparing different words, periods, or relation types in the same region.

[ ] P1 — Add difference view
    Description: Highlight what appears, disappears, or changes between two selected states.
    Use case: Useful for comparing time periods or filtered relation types.
    Research context: Helps users identify meaningful changes rather than manually scanning both views.

[ ] P1 — Add custom region grouping
    Description: Allow data to be grouped by language family, geographic area, historical region, or user-selected cluster.
    Use case: Moves beyond modern political borders as the only geographic structure.
    Research context: Participants noted that simple country/state maps are often too limited for language research.

[ ] P1 — Add route/journey visualization
    Description: Show directional paths or arcs representing possible linguistic movement across regions.
    Use case: Helps communicate borrowing, spread, or contact pathways.
    Research context: Participants wanted to visualize movement and historical pathways, not just static points.

[ ] P1 — Add minimap / overview map
    Description: A small overview map showing the current viewport and distribution of visible data.
    Use case: Helps users stay oriented when zoomed into a dense area.
    Research context: Supports overview-plus-detail interaction.


================================================================================
P2 — EXPORT, PRESENTATION, AND POLISH FEATURES
================================================================================

[ ] P2 — Export current map as PNG
    Description: Save the current map view as a static image.
    Use case: Useful for thesis writing, presentations, reports, and quick sharing.
    Research context: Participants noted that journals, talks, and teaching often still require static images.

[ ] P2 — Export current map as SVG
    Description: Save the current map as a vector graphic.
    Use case: Useful for publication-quality figures and editing in design tools.
    Research context: Supports academic workflows where static, editable figures are needed.

[ ] P2 — Export map with/without annotations
    Description: Let users choose whether annotations appear in the exported image.
    Use case: Supports both clean figures and interpreted teaching/presentation figures.
    Research context: Participants wanted visualizations for both analysis and communication.

[ ] P2 — Export selected data as CSV
    Description: Download the currently visible or selected linguistic/geospatial data as a table.
    Use case: Lets users continue analysis in Excel, R, Python, or other tools.
    Research context: Many participants already work with tabular data and scripting workflows.

[ ] P2 — Export selected data as JSON
    Description: Download structured data for the current view.
    Use case: Useful for reproducibility, debugging, or integration with other tools.
    Research context: Supports expert workflows and transparent data reuse.

[ ] P2 — Export evidence report
    Description: Generate a Markdown or HTML summary of selected nodes, routes, evidence, and annotations.
    Use case: Helps users move from visual exploration into writing or presentation.
    Research context: Participants wanted visualizations to support storytelling and explanation.

[ ] P2 — Add presentation mode
    Description: A fullscreen mode with simplified controls, larger labels, and cleaner visual styling.
    Use case: Useful for thesis demos, conference talks, and classroom teaching.
    Research context: Participants emphasized communication, teaching, and making linguistic concepts easier to explain.

[ ] P2 — Add saved view sequence
    Description: Users can arrange saved states into an ordered slideshow-like sequence.
    Use case: Lets users build a guided visual story from overview to detail.
    Research context: Supports narrative explanation, which was repeatedly identified as valuable.

[ ] P2 — Add hide-controls mode
    Description: Temporarily hide panels, buttons, and UI chrome.
    Use case: Useful for screenshots, presentations, and focused viewing.
    Research context: Helps convert exploratory visualizations into clean communication artifacts.

[ ] P2 — Add high-contrast / presentation labels
    Description: Increase label size, contrast, and readability for projection or screenshots.
    Use case: Makes the tool more usable in classrooms and presentations.
    Research context: Participants noted that visualizations need to be readable in real-world teaching/presentation contexts.

[ ] P2 — Add keyboard shortcuts
    Description: Add shortcuts for toggling layers, saving state, opening annotation mode, resetting view, and opening the evidence drawer.
    Use case: Speeds up expert workflows.
    Research context: Participants differed in interaction preferences; some prefer efficient control over point-and-click UI.

[ ] P2 — Add command palette
    Description: A searchable menu for actions like “toggle labels,” “save view,” “show descendants,” or “export PNG.”
    Use case: Helps users quickly access features without hunting through panels.
    Research context: Useful as the tool gains more interaction options.

[ ] P2 — Add onboarding guide
    Description: A short guided tour explaining map layers, filters, evidence drawer, annotations, and saving.
    Use case: Helps new users understand the interaction model quickly.
    Research context: Participants noted that tools can fail adoption when users do not understand how to use them.

[ ] P2 — Add tooltip explanations for controls
    Description: Hovering over buttons explains what they do.
    Use case: Reduces confusion without cluttering the interface.
    Research context: Supports usability for both experts and non-experts.

[ ] P2 — Add offline/demo mode
    Description: Include preloaded example datasets and fallback behavior if live data or map tiles fail.
    Use case: Useful for thesis defense, demos, and conferences where internet may be unreliable.
    Research context: Participants mentioned that classroom/conference technology and internet access can be unreliable.

[ ] P2 — Add cached demo words
    Description: Bundle a few polished example word histories that always work.
    Use case: Ensures demos are stable even if the backend or external data fails.
    Research context: Important for presenting a research prototype reliably.

[ ] P2 — Add static fallback rendering
    Description: If the interactive map fails, show a static image or simplified fallback visualization.
    Use case: Prevents total failure during presentations or studies.
    Research context: Reliability was a recurring adoption concern.

[ ] P2 — Add accessibility checks
    Description: Check color contrast, keyboard navigation, screen-reader labels, and non-color encodings.
    Use case: Makes the visualization more usable for diverse users.
    Research context: Participants discussed communication barriers and the need for multiple ways to understand information.

[ ] P2 — Add performance optimization for dense maps
    Description: Use clustering, canvas/WebGL rendering, memoization, or viewport-based rendering for large datasets.
    Use case: Keeps the map responsive when many markers/routes are visible.
    Research context: Participants noted that large linguistic datasets can become difficult to visualize and manipulate.

[ ] P2 — Add marker clustering
    Description: Combine nearby markers into clusters at low zoom levels, then expand them when zooming in.
    Use case: Reduces clutter on global maps.
    Research context: Helps maintain overview readability with dense geographic data.

[ ] P2 — Add route bundling or route simplification
    Description: Reduce visual clutter by bundling similar routes or simplifying paths at low zoom.
    Use case: Makes borrowing/descent routes easier to read.
    Research context: Participants noted that complex visualizations can lose their purpose if they become too crowded.


================================================================================
RECOMMENDED IMPLEMENTATION ORDER
================================================================================

[ ] 1. Build LayerPanel and layer registry
    Description: Establishes the foundation for all geospatial manipulation.

[ ] 2. Add marker/route selection and EvidenceDrawer
    Description: Connects visual elements to underlying Wiktionary evidence.

[ ] 3. Add relation filters and path-focused views
    Description: Lets users simplify the map according to linguistic task.

[ ] 4. Add VisualizationState object
    Description: Creates the foundation for saving, sharing, annotations, and comparison.

[ ] 5. Add local state-saving and saved view manager
    Description: Lets users preserve meaningful map states.

[ ] 6. Add AnnotationMode
    Description: Supports live interpretation, teaching notes, and user-generated hypotheses.

[ ] 7. Add timeline slider and timeline-map synchronization
    Description: Supports diachronic exploration of linguistic spread.

[ ] 8. Add shareable state links
    Description: Lets users communicate exact visualization states.

[ ] 9. Add compare mode
    Description: Supports side-by-side analysis of words, languages, relations, or time periods.

[ ] 10. Add export tools
    Description: Supports thesis writing, presentations, teaching, and publication-style outputs.

[ ] 11. Add presentation mode and saved view sequence
    Description: Turns exploratory work into a guided visual story.

[ ] 12. Add offline/demo mode
    Description: Makes thesis demos and study sessions more reliable


================================================================================
ONE-SENTENCE DESIGN GOAL
================================================================================

Build WiktionaryViz as an interactive geospatial sensemaking workspace where users can manipulate linguistic map layers, inspect evidence, annotate interpretations, save/share visualization states, and compare historical-geographic views.