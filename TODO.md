# TODO — More tolerant hazard collisions

Make hazard/spike collisions require at least 10px² overlap with the actual drawn spike image.

- [x] Step 0: Understand current hazard collision & rendering (GameScene.ts)
- [x] Step 1: Draft plan and get user confirmation
- [x] Step 2: Add precise geometry helpers (polygonArea, clipPlane, rectPolygonOverlap, hazardOverlapArea) in GameScene.ts
- [x] Step 3: Replace rectsOverlap hazard checks in tickBody with >=1px overlap test
- [x] Step 4: Verify build/typecheck (typecheck + lint both pass)
