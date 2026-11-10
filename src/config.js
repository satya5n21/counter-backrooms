import * as THREE from 'three';

export const CELL = 2.5;        // metres per map cell
export const WALL_H = 3.0;      // ceiling height
export const EYE_H = 1.62;      // player eye height
export const PLAYER_RADIUS = 0.35;
export const PLAYER_MAX_HEALTH = 100;

// Direction *towards* the sun: low in the west-south-west, golden hour.
export const SUN_DIR = new THREE.Vector3(-1, 0.4, 0.36).normalize();

// Difficulty changes how well bots aim/react and how tough/hard-hitting they are.
export const DIFFICULTY = {
  easy: {
    label: 'Easy',
    aimSpread: 0.085,      // radians of random error per shot
    reaction: 0.95,        // seconds between first seeing you and firing
    turnSpeed: 2.4,        // how fast their aim tracks you (rad/s)
    lead: 0.0,             // how much they predict your movement
    fireInterval: [1.7, 2.6],
    boltSpeed: 12,
    health: 55,
    damage: 5,
  },
  normal: {
    label: 'Normal',
    aimSpread: 0.045,
    reaction: 0.55,
    turnSpeed: 4.0,
    lead: 0.4,
    fireInterval: [1.1, 1.8],
    boltSpeed: 16,
    health: 85,
    damage: 8,
  },
  hard: {
    label: 'Hard',
    aimSpread: 0.02,
    reaction: 0.28,
    turnSpeed: 7.0,
    lead: 0.8,
    fireInterval: [0.7, 1.2],
    boltSpeed: 21,
    health: 125,
    damage: 12,
  },
};

// Every wave nudges the same knobs a little further.
export function scaledDifficulty(key, wave) {
  const d = DIFFICULTY[key];
  const w = Math.max(0, wave - 1);
  return {
    ...d,
    aimSpread: d.aimSpread * Math.pow(0.95, w),
    reaction: Math.max(0.15, d.reaction * Math.pow(0.96, w)),
    turnSpeed: d.turnSpeed * (1 + 0.03 * w),
    health: d.health * (1 + 0.08 * w),
    damage: d.damage * (1 + 0.05 * w),
  };
}

export const BOT_TYPES = {
  drifter: { scale: 1.0, speed: 3.1, health: 1.0, damage: 1.0, fireMul: 1.0, bolts: 1, color: 0xffd49a },
  wisp:    { scale: 0.8, speed: 4.9, health: 0.6, damage: 0.7, fireMul: 0.7, bolts: 1, color: 0xffb0a0 },
  warden:  { scale: 1.25, speed: 2.2, health: 2.6, damage: 1.2, fireMul: 1.5, bolts: 3, color: 0xc4c2ff },
};

export const WEAPONS = [
  {
    id: 'pistol', name: 'Pistol', slot: 1,
    damage: 28, fireDelay: 0.16, auto: false,
    mag: 12, reserve: Infinity, maxReserve: Infinity, reloadTime: 1.1,
    spread: 0.005, moveSpread: 0.02, bloomPerShot: 0.006, bloomMax: 0.02,
    recoil: 0.022, pellets: 1, headMult: 2.0, range: 120, falloff: null,
  },
  {
    id: 'rifle', name: 'Rifle', slot: 2,
    damage: 19, fireDelay: 0.095, auto: true,
    mag: 30, reserve: 90, maxReserve: 240, reloadTime: 1.75,
    spread: 0.007, moveSpread: 0.03, bloomPerShot: 0.0045, bloomMax: 0.045,
    recoil: 0.011, pellets: 1, headMult: 1.8, range: 150, falloff: null,
  },
  {
    id: 'shotgun', name: 'Shotgun', slot: 3,
    damage: 12, fireDelay: 0.8, auto: false,
    mag: 6, reserve: 18, maxReserve: 48, reloadTime: 0.5, shellReload: true,
    spread: 0.07, moveSpread: 0.02, bloomPerShot: 0, bloomMax: 0,
    recoil: 0.07, pellets: 9, headMult: 1.4, range: 45, falloff: [8, 24, 0.35],
  },
];
