import * as THREE from 'three';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { GTAOPass } from './vendor/addons/postprocessing/GTAOPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';

/** Contact occlusion in linear colour space, followed by the renderer's tone mapping. */
export class RenduStudio {
  constructor({ renderer, scene, camera }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.beauty = new RenderPass(scene, camera);
    this.occlusion = new GTAOPass(scene, camera, 1, 1, undefined,
      { radius: .65, distanceExponent: 1.5, thickness: .65, distanceFallOff: 1, scale: 1, samples: 8 },
      { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, samples: 8, rings: 2 });
    this.occlusion.blendIntensity = .46;
    this.output = new OutputPass();
    for (const pass of [this.beauty, this.occlusion, this.output]) this.composer.addPass(pass);
  }
  setNodeCount(count) { this.nodeCount = count; }
  resize(width, height) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
  }
  render() {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    const autoReset = this.renderer.info.autoReset;
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    try { this.composer.render(); }
    finally { this.renderer.info.autoReset = autoReset; }
  }
  dispose() {
    for (const pass of [this.beauty, this.occlusion, this.output]) pass.dispose?.();
    this.composer.dispose();
  }
}
