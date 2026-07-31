# Menu Music Fix - TODO

- [x] Analyze the root cause (race condition: `playMenu()` called before `init()` finishes rendering)
- [x] Get user approval on plan
- [x] Edit `src/game/music.ts`:
  - [x] Add `_initPromise` field to track pending initialization
  - [x] Modify `init()` to store and return the promise (prevent duplicate concurrent renders)
  - [x] Modify `playMenu()` to await `init()` if buffer not ready
  - [x] Modify `playLevel()` to await `init()` if buffer not ready
- [x] Verify compilation with `npx tsc --noEmit`
