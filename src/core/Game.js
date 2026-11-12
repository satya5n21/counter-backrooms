import * as THREE from 'three';
import { DIFFICULTY } from '../config.js';
import { Input } from './Input.js';
import { Settings } from './Settings.js';
import { PostFX } from './PostFX.js';
import { Level } from '../world/Level.js';
import { Atmosphere } from '../world/Atmosphere.js';
import { Effects } from '../fx/Effects.js';
import { Player } from '../player/Player.js';
import { Weapons } from '../weapons/Weapons.js';
import { BotManager } from '../ai/Bots.js';
import { Pickups } from '../game/Pickups.js';
import { WaveDirector } from '../game/WaveDirector.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';
import { Audio } from '../audio/Audio.js';

export class Game {
  // assets: result of loadAssets() (models, textures, sky), or null for the procedural look.
  constructor(container, assets = null) {
    this.container = container;
    this.assets = assets;
    this.settings = new Settings();
    this.state = 'menu';
    this.time = 0;
    this.menuTime = 0;
    this.deathTimer = 0;
    this.stats = { kills: 0, shots: 0, hits: 0, time: 0, waves: 0, reached: 0 };

    // renderer
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // the world is static: bake the sun shadows once
    renderer.shadowMap.needsUpdate = true;
    container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd2a873, 20, 95);
    this.weaponScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.04, 700);
    this.camera.rotation.order = 'YXZ';
    // The guns use their own fixed, narrower field of view so they don't stretch at high FOV.
    this.weaponCamera = new THREE.PerspectiveCamera(54, 1, 0.01, 20);
    this._setupEnvironment();

    this.input = new Input(renderer.domElement);
    this.audio = new Audio(this.settings);
    this.hud = new HUD();

    this.level = new Level();
    this.level.build(this.scene, assets);
    this.atmosphere = new Atmosphere(this.scene, this.level, assets?.hdri);
    this.effects = new Effects(this.scene);

    this.player = new Player(this);
    this.weapons = new Weapons(this);
    this.bots = new BotManager(this);
    this.pickups = new Pickups(this);
    this.waves = new WaveDirector(this);
    this.player.reset();

    this.postfx = new PostFX(renderer, this.scene, this.weaponScene, this.camera, this.weaponCamera);
    this.menus = new Menus(this);

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
      else if (locked && this.state === 'paused') this.resume();
    };
    renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' && this.state === 'playing') {
        if (this.input.locked) this.input.unlock(); else this.pause();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.input.unlock();
        this.pause();
      }
    });

    window.addEventListener('resize', () => this.resize());
    this.applyQuality();

    this.clock = new THREE.Clock();
    this.weaponScene.visible = false;
    this.menus.show('menu');
    renderer.setAnimationLoop(() => this.tick());
    window.__game = this; // handy for debugging from the console
  }

  get difficulty() { return this.settings.difficulty; }

  // Image-based lighting from the sunset photo, kept low: the rooms are indoors, and on
  // the guns a stronger sky reflection turns dark metal into chrome.
  _setupEnvironment() {
    const hdri = this.assets?.hdri;
    if (!hdri) return;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromEquirectangular(hdri.texture).texture;
    pmrem.dispose();
    const rot = Atmosphere.sunAlignment(hdri.sun);
    for (const [scene, k] of [[this.scene, 0.3], [this.weaponScene, 0.35]]) {
      scene.environment = env;
      scene.environmentIntensity = k;
      scene.environmentRotation.set(0, rot, 0);
    }
  }

  // Compile shaders and upload textures before the loading screen goes away.
  async warmUp() {
    const shown = this.weapons.models.map((m) => m.group.visible);
    this.weapons.models.forEach((m) => { m.group.visible = true; });
    this.weaponScene.visible = true;
    const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      await Promise.race([
        Promise.all([
          this.renderer.compileAsync(this.scene, this.camera),
          this.renderer.compileAsync(this.weaponScene, this.weaponCamera),
        ]),
        timeout(8000),
      ]);
      this.weaponScene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
            if (m[k]) this.renderer.initTexture(m[k]);
          }
        }
      });
    } catch (err) {
      console.warn('warm-up skipped:', err);
    }
    this.weapons.models.forEach((m, i) => { m.group.visible = shown[i]; });
    this.weaponScene.visible = this.state === 'playing';
    this.tick();
  }

  applyQuality() {
    const high = this.settings.quality !== 'low';
    this.pixelRatio = high ? Math.min(window.devicePixelRatio || 1, 1.5) : 0.75;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.postfx.setPixelRatio(this.pixelRatio);
    this.postfx.setBloom(high);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.postfx.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = w / h;
    this.weaponCamera.updateProjectionMatrix();
    const px = h * this.pixelRatio;
    this.atmosphere.setViewportHeight(px);
    this.effects.setViewportHeight(px * 0.6);
  }

  // ---------- flow ----------
  startGame() {
    this.audio.init();
    this.bots.clear();
    this.pickups.clear();
    this.effects.clear();
    this.hud.reset();
    this.player.reset();
    this.weapons.reset();
    this.waves.reset();
    this.time = 0;
    this.deathTimer = 0;
    this.stats = { kills: 0, shots: 0, hits: 0, time: 0, waves: 0, reached: 0 };
    this.hud.setKills(0);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    // a couple of supplies to start with
    const spots = this.level.pickupSpots;
    if (spots.length > 1) { this.pickups.spawn('ammo', spots[0]); this.pickups.spawn('health', spots[spots.length - 1]); }

    this.state = 'playing';
    this.menus.show(null);
    this.hud.show(true);
    this.weaponScene.visible = true;
    this.audio.setPaused(false);
    this.input.lock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.menus.show('pause');
    this.audio.setPaused(true);
  }

  requestResume() {
    this.audio.init();
    this.input.lock();
    // If the browser refuses the lock (e.g. right after Esc), let the player retry.
    setTimeout(() => {
      if (this.state === 'paused' && !this.input.locked) this.menus.showResumeNote();
    }, 500);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.menus.show(null);
    this.audio.setPaused(false);
    this.clock.getDelta();
  }

  toMenu() {
    this.input.unlock();
    this.state = 'menu';
    this.bots.clear();
    this.pickups.clear();
    this.effects.clear();
    this.hud.show(false);
    this.weaponScene.visible = false;
    this.menus.show('menu');
    this.audio.setPaused(false);
  }

  onBotKilled(bot) {
    this.stats.kills++;
    this.hud.setKills(this.stats.kills);
    const r = Math.random();
    if (r < 0.1) this.pickups.spawn('health', bot.pos, 25);
    else if (r < 0.22) this.pickups.spawn('ammo', bot.pos, 25);
  }

  onPlayerDeath() {
    this.deathTimer = 2.2;
    this.stats.time = this.time;
    this.stats.reached = this.waves.wave;
    this.audio.gameOver();
    this.hud.banner('The light fades', '');
  }

  _gameOver() {
    this.state = 'gameover';
    this.input.unlock();
    this.hud.show(false);
    this.weaponScene.visible = false;
    this.menus.showGameOver(this.stats, DIFFICULTY[this.difficulty].label);
  }

  // ---------- loop ----------
  _menuCamera(dt) {
    this.menuTime += dt;
    const t = this.menuTime;
    const cam = this.camera;
    cam.position.set(11.5 + Math.sin(t * 0.05) * 1.2, 1.55 + Math.sin(t * 0.3) * 0.03, 30 + Math.sin(t * 0.035) * 9);
    cam.rotation.set(0.04 + Math.sin(t * 0.07) * 0.03, Math.PI / 2 + 0.55 + Math.sin(t * 0.045) * 0.25, 0);
    if (cam.fov !== 70) { cam.fov = 70; cam.updateProjectionMatrix(); }
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const st = this.state;

    if (st === 'menu') {
      this._menuCamera(dt);
    } else if (st === 'playing') {
      this.time += dt;
      if (this.player.alive) {
        this.player.update(dt);
      } else {
        // slow sink to the floor on death
        this.player.pos.y = Math.max(-1.1, this.player.pos.y - dt * 0.8);
        this.player.pitch += (0.5 - this.player.pitch) * dt;
        this.player.applyCamera();
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) this._gameOver();
      }
      this.weapons.update(dt, this.player.alive);
      this.bots.update(dt);
      this.pickups.update(dt);
      if (this.player.alive) this.waves.update(dt);
      this.hud.update(dt, this.weapons, this.player);
    }

    if (st !== 'paused') this.effects.update(dt);
    this.atmosphere.update(dt, this.camera);
    this.audio.updateListener(this.camera);

    let hurt = this.hud.hurt;
    if (st === 'playing' && this.player.health < 30) hurt = Math.max(hurt, 0.25 + Math.sin(this.time * 4) * 0.1);
    if (st === 'playing' && !this.player.alive) hurt = Math.max(hurt, 0.6);
    this.weaponCamera.position.copy(this.camera.position);
    this.weaponCamera.quaternion.copy(this.camera.quaternion);
    if (!this.weapons.modelled && this.weaponCamera.fov !== this.camera.fov) {
      // the primitive guns were placed for the main camera's field of view
      this.weaponCamera.fov = this.camera.fov;
      this.weaponCamera.updateProjectionMatrix();
    }
    this.postfx.render(dt, hurt);
    this.input.endFrame();
  }
}
