import * as THREE from 'three';
import {
  plasterTextures, floorTexture, walnutTexture, linenTexture, rugTexture,
  paintingTexture, haloTexture, braidTexture, tiled,
} from './textures.js';

/**
 * Shared material library. Created once and reused by the room, the showcase
 * stages and the product plates.
 */
export function createMaterials({ lite = false } = {}) {
  const plaster = plasterTextures(lite ? 384 : 512);
  const floorTex = floorTexture(lite ? 768 : 1024);
  const walnutTex = walnutTexture(lite ? 384 : 512);
  const linenTex = linenTexture();

  const std = (o) => new THREE.MeshStandardMaterial(o);

  const M = {
    haloTex: haloTexture(),
    braidTex: braidTexture(),
    linenTex,
    walnutTex,
    plasterTex: plaster,

    wall: std({ map: tiled(plaster.map, 3, 1.2), bumpMap: tiled(plaster.bump, 3, 1.2), bumpScale: 0.55, roughness: 0.96, color: 0x9d9078 }),
    wallSide: std({ map: tiled(plaster.map, 3.5, 1.2), bumpMap: tiled(plaster.bump, 3.5, 1.2), bumpScale: 0.55, roughness: 0.96, color: 0x9d9078 }),
    ceiling: std({ map: tiled(plaster.map, 3, 3), bumpMap: tiled(plaster.bump, 3, 3), bumpScale: 0.3, roughness: 0.98, color: 0xcdbf9f }),
    floor: std({ map: tiled(floorTex, 6, 1.6), roughness: 0.42, metalness: 0.0 }),
    panel: std({ map: tiled(walnutTex, 1.4, 1.4), roughness: 0.55, color: 0xcfa98a }),
    trim: std({ map: tiled(walnutTex, 4, 0.4), roughness: 0.5, color: 0xa88567 }),
    furniture: std({ map: tiled(walnutTex, 1.3, 1.3), roughness: 0.42, color: 0xd9b394 }),
    plasterTrim: std({ map: tiled(plaster.map, 1, 1), bumpMap: tiled(plaster.bump, 1, 1), bumpScale: 1.5, roughness: 0.9, color: 0xf3e8d2 }),
    rug: std({ map: rugTexture(), roughness: 1 }),
    painting: std({ map: paintingTexture(), roughness: 0.6 }),

    brass: std({ color: 0xc09a58, metalness: 0.95, roughness: 0.3 }),
    brassAged: std({ color: 0x8a6a3a, metalness: 0.9, roughness: 0.46 }),
    patina: std({ color: 0x3a3226, metalness: 0.7, roughness: 0.5 }),
    gilt: std({ color: 0xa8824a, metalness: 0.9, roughness: 0.38 }),
    leather: std({ color: 0x5c2a2e, roughness: 0.5 }),
    leatherDark: std({ color: 0x3a1a1d, roughness: 0.6 }),
    ceramic: std({ color: 0xe6dcc6, roughness: 0.3 }),
    book1: std({ color: 0x4a2024, roughness: 0.8 }),
    book2: std({ color: 0x4d5238, roughness: 0.8 }),
    book3: std({ color: 0xc9b48a, roughness: 0.85 }),
    cord: std({ map: null, color: 0xffffff, roughness: 0.9 }),
    amberGlass: std({ color: 0x7a4a14, roughness: 0.1, metalness: 0.0, emissive: 0xff9a3c, emissiveIntensity: 0 }),
  };
  M.cord.map = M.braidTex;
  return M;
}

/** emissive material that a lamp drives with setPower(). */
export function glowMaterial(color, { opacity = 1, map = null, side = THREE.FrontSide, roughness = 0.6, base = 0xf1e5cb } = {}) {
  return new THREE.MeshStandardMaterial({
    color: base, map, roughness, metalness: 0,
    emissive: new THREE.Color(color), emissiveIntensity: 0,
    transparent: opacity < 1, opacity, side, depthWrite: opacity >= 1,
  });
}
