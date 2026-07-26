import Phaser from 'phaser';

const FRAG = `
#define SHADER_NAME CHRONO_FISHEYE

precision mediump float;

uniform sampler2D uMainSampler;
uniform float amount;
uniform float chroma;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord - 0.5;
  float r = length(uv);
  float k = 1.0 + amount * 2.4;
  vec2 warped = uv * (1.0 - amount * 0.9 * r) * k;
  float swirl = amount * 3.0 * (0.35 - r);
  float s = sin(swirl);
  float c = cos(swirl);
  warped = vec2(warped.x * c - warped.y * s, warped.x * s + warped.y * c);
  vec2 base = warped + 0.5;

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

  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAG });
  }

  override onPreRender(): void {
    this.set1f('amount', this.amount);
    this.set1f('chroma', this.chroma);
  }
}

export const FISHEYE_KEY = 'Fisheye';
