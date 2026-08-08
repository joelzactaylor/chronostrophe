# Phaser Matter Migration Plan

- [ ] Add Phaser Matter physics config to `src/main.ts`
- [ ] Update `GameScene` to use `this.matter.world`
- [ ] Update `World` constructor to accept `Phaser.Physics.Matter.World`
- [ ] Migrate `cratePhysics.ts` usage into `World`
- [ ] Confirm `src/core/cratePhysics.ts` is referenced and compatible
- [ ] Remove any standalone `matter-js` imports if present
- [ ] Run `npm run typecheck` and `npm run build`
