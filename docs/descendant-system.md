# Descendant System: Correct Mental Model and Intended Behavior

## Purpose

The descendant system in WiktionaryViz is intended to behave like an on-demand etymological tree explorer, not like a precomputed global descendant graph.

The user starts from a specific word, finds the likely ancestral root, and then explores outward one branch at a time. The app should reveal only the next relevant descendants of the currently selected node, and only when the user chooses to expand that branch.

This makes the interaction exploratory, local, and controllable instead of memory-heavy and graph-wide.

---

## The core idea

The system should support two directions:

1. Backward tracing from the user’s chosen word to its likely root or ancestral origin
2. Forward expansion from a selected node to its immediate descendants

These are different operations with different goals:

- Backward tracing answers: “Where did this word come from?”
- Forward expansion answers: “What spread from this ancestor?”

The descendant UI should be built around the second one: the user expands the lineage from the currently focused node.

---

## Correct workflow

### 1. Start from the user’s chosen word

Suppose the user searches for:

- `oranye` (Indonesian)

The app should look up that word’s etymology templates and trace backward through the ancestry chain.

Example chain:

- `oranye`
- Dutch `oranje`
- Middle Dutch `arance`
- Old French `orenge`
- Italian `arancia`
- Arabic `نَارَنْج` (`nāranj`)
- Persian `نارنگ` (`nārang`)
- Sanskrit `नारङ्ग` (`nāraṅga`)
- Dravidian

The app should identify the deepest or most likely root candidate and treat that as the root focus node.

### 2. Resolve the root candidate conservatively

The root is not necessarily a real Wiktionary page entry. In many cases, a proto-form or reconstructed ancestor is only present in an etymology template, not as a normal dictionary page.

That means the app should:

- inspect etymology templates
- keep the deepest explicit ancestor candidate
- rank proto-like candidates higher when they are likely roots
- allow a root that is synthetic or reconstructed

This is not the same as requiring a page-backed article for every root.

### 3. Focus the root node

Once the system resolves the likely root, it should display that root as the current focus node.

At this stage, the root may be shown as:

- a highlighted node on the map
- a graph vertex in the tree
- the selected center of the current lineage branch

The user should now be able to click that node to expand it.

### 4. Expand only the next immediate descendants

When the user clicks the root node, the app should request only the immediate next layer of descendants for that node.

For example, from the Dravidian root the next visible descendants might include things like:

- Hindi
- Urdu
- Gujarati
- Marathi
- Bengali
- Punjabi
- and other immediate child forms or branches

The app should not ask for the entire descendant graph under the root, only the next immediate descendants at that level.

### 5. Expand a child node the same way

After the user clicks one of the immediate descendant nodes, such as `Hindi`, the system should expand that node’s immediate descendants rather than re-expanding the whole graph.

So the interaction is incremental:

- root clicked → show immediate descendants
- Hindi clicked → show Hindi’s immediate descendants
- Persian clicked → show Persian’s immediate descendants
- Arabic clicked → show Arabic’s immediate descendants

This creates a gradually built tree that reflects the user’s exploration path.

---

## Why this differs from a full descendant graph

A naive implementation might compute a massive descendant tree from the root in one step. That is dangerous because:

- the descendant graph can be enormous
- many ancestral roots are reconstructed and have no page entry
- a single expansion may traverse a large graph and consume a huge amount of memory
- the UI becomes slow or freezes while waiting for all data to resolve

That is not what the user wants.

The correct design is a branch-by-branch expansion model where each click triggers a bounded, local fetch.

---

## The intended data model

The system should conceptually operate like this:

- Node: a word-form, ancestor, or proto-form
- Parent/ancestor relation: backward etymology path
- Child/descendant relation: next-generation branching form
- Root: the selected ancestor to begin exploring from
- Expansion: retrieve the children of a node
- Focus: the currently selected node
- Branch: a path of connected nodes

The tree is not precomputed globally; it is built progressively in the UI.

---

## The ideal API behavior

The backend should support a small, explicit set of operations.

### A. Resolve root from a user word

Endpoint behavior:

- input: a word plus optional language
- output: ranked ancestor/root candidates
- selects the most likely root based on etymology template ancestry and proto-heuristics

This is a resolution step, not a full descendant expansion step.

### B. Expand children for a selected node

Endpoint behavior:

- input: a node identity (word + language or canonical graph key)
- output: immediate child nodes only
- limit depth and node count aggressively
- return a bounded result, not the complete subtree

This is the critical operation for responsiveness.

### C. Collapse or hide a branch

The UI should allow a user to hide an expanded branch when they want to reduce clutter.

This keeps the graph local and readable.

### D. Focus a node without expanding everything

A click on a node should not necessarily trigger the full graph expansion. It should set the focus and, if the branch is not already expanded, optionally fetch only the immediate children.

---

## Why “root first click” should not fetch the whole subtree

This is the single biggest design mistake to avoid.

If the first click on a root triggers the full descendant graph, the system can:

- explode in memory usage
- trigger too many backend traversals
- stall the UI
- overwhelm the whole local machine

Instead, the first click should either:

- fetch only the immediate descendants of the root, or
- treat the root as a focus node with no automatic expansion beyond the first visible layer

This is the safe and correct behavior.

---

## The correct expansion rule

A good rule is:

- expand one node at a time
- fetch only the next layer of child nodes
- cap total children per expansion
- cap overall graph depth exposed to the user
- never precompute the full descendant tree for the root unless the user explicitly asks for a deeper view

This preserves responsiveness while still allowing the user to explore the lineage interactively.

---

## Example: the intended user flow for `oranye`

The intended flow is roughly:

1. Search `oranye`
2. Resolve likely ancestral root: Dravidian or reconstructed proto root
3. Display root node as current focus
4. Click root node
5. Fetch next immediate descendants, such as Hindi, Urdu, Gujarati, etc.
6. User clicks Hindi
7. Fetch Hindi’s immediate descendants
8. User clicks Persian
9. Fetch Persian’s immediate descendants
10. User clicks Arabic
11. Fetch Arabic’s immediate descendants
12. Continue as long as the user wants

This is the desired “slowly building, on-demand expandable/collapse iterable graph tree.”

---

## Why the interface should be iterative

The user is not trying to view the whole etymological family tree in one shot.

The user is trying to:

- understand the path of a word
- inspect one branch at a time
- compare sibling branches
- form hypotheses about origin and diffusion

That’s inherently an iterative task. The interface should support that by letting the user build the graph gradually and deliberately.

---

## Design principle

The system should respect this principle:

“Only expand what the user is actively inspecting.”

That means:

- resolve root once
- reveal local branch children only when needed
- avoid full-tree precomputation
- keep branch depth bounded
- dim or preserve focus on the active lineage
- treat ancestor tracing and descendant expansion as separate but complementary operations

---

## Summary

The descendant system should not be thought of as “expand the whole root graph.”

It should be understood as:

- resolve a word’s likely root
- focus that root
- expand one selected node into its immediate descendants
- repeat incrementally as the user explores
- keep the graph bounded, responsive, and user-driven

That is the correct foundation for the descendant explorer in WiktionaryViz.

---

## Short version of the intended behavior

> The app should backtrace from the user’s word to the likely ancestor root, then allow the user to expand that root and each subsequent node one branch at a time. Each click reveals only the immediate descendants of the focused node, creating a progressively built, on-demand lineage tree rather than a massive precomputed descendant graph.
