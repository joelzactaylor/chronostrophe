import Phaser from 'phaser';

const FRAG = `
#define SHADER_NAME CHRONO_FISHEYE

precision mediump float;

uniform sampler2D uMainSampler;
uniform float amount;
uniform float chroma;
uniform vec2 centre;
uniform float aspect;
uniform float swirlAmt;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord - centre;
  // Measure distance in square units so the warp is round on a wide viewport.
  vec2 ruv = vec2(uv.x * aspect, uv.y);
  float r = length(ruv);
  float k = 1.0 + amount * 2.4;
  vec2 warped = uv * (1.0 - amount * 0.9 * r) * k;
  float swirl = amount * swirlAmt * (0.35 - r);
  float s = sin(swirl);
  float c = cos(swirl);
  warped = vec2(warped.x * c - warped.y * s, warped.x * s + warped.y * c);
  vec2 base = warped + centre;

  vec2 off = normalize(uv + 1e-5) * chroma * 0.02;
  float red = texture2D(uMainSampler, base + off).r;
  vec4 mid = texture2D(uMainSampler, base);
  float blue = texture2D(uMainSampler, base - off).b;

  vec3 col = vec3(red, mid.g, blue);
  col *= 1.0 - amount * 0.45 * smoothstep(0.1, 0.75, r);
  gl_FragColor = vec4(col, mid.a);
}
`;

export class FisheyePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  amount = 0;
  chroma = 0;
  /** Where the warp is centred, in texture coordinates; the middle by default. */
  centreX = 0.5;
  centreY = 0.5;
  aspect = 1;
  /** How much the warp twists as well as bulges. */
  swirl = 3;

  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAG });
  }

  override onPreRender(): void {
    this.set1f('amount', this.amount);
    this.set1f('chroma', this.chroma);
    this.set2f('centre', this.centreX, this.centreY);
    this.set1f('aspect', this.aspect);
    this.set1f('swirlAmt', this.swirl);
  }
}

export const FISHEYE_KEY = 'Fisheye';
