# WIKTIONARYVIZ GEOSPATIAL INTERACTION TODO LIST

Priority key:
P0 = must-have for the core prototype
P1 = high-value thesis/demo feature
P2 = polish, export, or quality-of-life feature


[ ] P0 — Fix compare-mode control overlap
    Description: Prevent the playback and control bar from overlapping other UI in compare layouts.
    Use case: Keeps controls usable in the dual-view mode.
    Research context: The transcript noted layout overlap in compare mode.

[ ] P0 — Improve recommendation logic and explanation text
    Description: Rework the scoring so it does not over-bias descendant paths or translations and explain the recommendation in more relevant terms.
    Use case: Makes the Inspire Me results understandable and trustworthy.
    Research context: The participant was confused by why some layers were preferred and others were not.

[ ] P1 — Add hover/help affordances for hidden or dense information
    Description: Provide a clear affordance for hover-only details such as question-mark icons or explicit hint text.
    Use case: Makes hidden explanatory content discoverable.
    Research context: The transcript showed repeated confusion about hover-only information.

[ ] P1 — Add approximate dates where the data can support them
    Description: Surface years or date ranges when available and label uncertainty where dates are disputed.
    Use case: Helps users understand historical change over time.
    Research context: The participant kept asking for years to interpret the visualization.

[ ] P1 — Add a machine-generated explanation only if it is grounded in source data
    Description: If an LLM is used for help text, anchor it to cited records and surface uncertainty explicitly.
    Use case: Reduces the risk of hallucinated historical explanations.
    Research context: The team already expressed concern about ungrounded generated explanations.

[ ] P2 — Consider a multi-word or aggregate network view
    Description: Add a broader view that shows movement patterns across many words without requiring one word at a time.
    Use case: Supports larger historical questions about language movement.
    Research context: The participant was interested in broader patterns like transportation or communication effects.

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

[ ] P1 — Add marker-attached annotations
    Description: Users can attach a note directly to a word/language marker.
    Use case: Useful for adding interpretation, questions, teaching notes, or reminders about specific data points.
    Research context: Supports close analysis and user-generated interpretation.

[ ] P1 — Add route-attached annotations
    Description: Users can attach a note to a specific etymological route or relationship.
    Use case: Useful for commenting on uncertain borrowing paths or interesting linguistic transitions.
    Research context: Participants wanted to explain or question relationships shown in the visualization.

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

[ ] P2 — Add performance optimization for dense maps
    Description: Use clustering, canvas/WebGL rendering, memoization, or viewport-based rendering for large datasets.
    Use case: Keeps the map responsive when many markers/routes are visible.
    Research context: Participants noted that large linguistic datasets can become difficult to visualize and manipulate.

[ ] P2 — Add route bundling or route simplification
    Description: Reduce visual clutter by bundling similar routes or simplifying paths at low zoom.
    Use case: Makes borrowing/descent routes easier to read.
    Research context: Participants noted that complex visualizations can lose their purpose if they become too crowded.

[ ] P3 - Add loading indicator for descendants

[ ] P3 - Change opacity of other brnaches in descendants mode

[ ] P3 - Escape doesnt work in annotation mode

[ ] P3 - Add events logger, e.g. button clicks, node clicks, etc. for research purposes