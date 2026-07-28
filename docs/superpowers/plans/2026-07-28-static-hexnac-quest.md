# Static HexNAcQuest Implementation Plan

1. Establish a clean isolated worktree and run the existing prediction tests.
2. Derive a committed golden classification fixture from the canonical legacy
   example and add failing unit tests for the public model and CSV contracts.
3. Implement the framework-independent core, model manifest, and pinned CSV
   parser until the unit suite passes.
4. Add failing browser tests, then implement the Web Worker, analysis UI,
   static pages, namespaced assets, progress, cancellation, pagination, chart,
   and CSV download.
5. Replace external HexNAcQuest links, add site-wide footer links, document
   maintenance and deployment, and extend static smoke checks and CI.
6. Run focused tests, all existing tests, static smoke tests, and three-browser
   tests; review the changes and address findings.
7. Merge and push the source branch, deploy `frontend/` to the GitHub Pages
   repository, and verify the production routes and browser workflow.
8. Archive both shinyapps.io deployments only after production verification,
   then confirm both repositories are clean and synchronized.
