import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Warm grade + vignette + faint grain, plus a tint used for damage feedback.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uVignette: { value: 0.32 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uHurt;
    uniform float uVignette;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // gentle warm split: lift shadows towards amber, keep highlights creamy
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(1.06, 0.98, 0.86), 0.6);
      col += vec3(0.02, 0.012, 0.0) * (1.0 - smoothstep(0.0, 0.4, l));
      vec2 q = vUv - 0.5;
      float r = dot(q, q);
      float vig = 1.0 - smoothstep(0.12, 0.75, r) * uVignette;
      col *= vig;
      // damage: warm rose edges
      col = mix(col, col * vec3(1.25, 0.6, 0.5) + vec3(0.12, 0.02, 0.0), uHurt * smoothstep(0.05, 0.4, r));
      col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.012;
      gl_FragColor = vec4(col, c.a);
    }`,
};

// Runs before bloom. A single NaN, Inf or absurdly bright pixel (a razor-sharp sun glint,
// a shader edge case) would otherwise be blurred by the bloom into a huge black rectangle
// for that frame. Invalid pixels become black, and brightness is capped well above white.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 48.0), clamp(c.a, 0.0, 1.0));
    }`,
};

export class PostFX {
  // weaponCamera: the guns get their own (narrower) field of view, like most shooters.
  constructor(renderer, scene, weaponScene, camera, weaponCamera = camera) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    // Multisampled HDR target so edges stay smooth through post-processing.
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.mainPass = new RenderPass(scene, camera);
    this.weaponPass = new RenderPass(weaponScene, weaponCamera);
    this.weaponPass.clear = false;
    this.weaponPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.5, 1.0);
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();
    this.composer.addPass(this.mainPass);
    this.composer.addPass(this.weaponPass);
    this.sanitize = new ShaderPass(SanitizeShader);
    this.composer.addPass(this.sanitize);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.output);
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
  }

  setPixelRatio(r) {
    this.composer.setPixelRatio(r);
  }

  setBloom(on) {
    this.bloom.enabled = on;
  }

  render(dt, hurt) {
    this.grade.uniforms.uTime.value += dt;
    this.grade.uniforms.uHurt.value = hurt;
    this.composer.render(dt);
  }
}
