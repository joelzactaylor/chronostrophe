/**
 * The smallest thing that looks like Phaser's Matter binding.
 *
 * `World` constructs a `CrateWorld` and never steps it — the authoritative
 * simulation is the deterministic one in `src/core/physics.ts` — so a headless
 * run only has to satisfy the constructor: make bodies, put them in a composite.
 */
const noop = () => {};

const Body = {
  setInertia: noop,
  setPosition: noop,
  setVelocity: noop,
  setAngle: noop,
  setAngularVelocity: noop,
  setStatic: noop,
  translate: noop,
};

const Matter = {
  Bodies: {
    rectangle: (x, y, w, h, options = {}) => ({
      position: { x, y },
      velocity: { x: 0, y: 0 },
      angle: 0,
      angularVelocity: 0,
      bounds: { min: { x: x - w / 2, y: y - h / 2 }, max: { x: x + w / 2, y: y + h / 2 } },
      isStatic: !!options.isStatic,
      ...options,
    }),
  },
  Composite: { add: noop, remove: noop },
  Body,
  Bounds: { overlaps: () => false },
  SAT: { collides: () => ({ collided: false }) },
  Engine: { update: noop },
};

class PostFXPipeline {}

const Phaser = {
  Physics: { Matter: { Matter } },
  Renderer: { WebGL: { Pipelines: { PostFXPipeline } } },
  Scene: class {},
};

export default Phaser;
export { Phaser };
