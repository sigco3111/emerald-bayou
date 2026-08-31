import * as THREE from 'three';
import { buildSkiff } from './npc.js';
import { animatePerson, cooler, person, wave } from './folk.js';
import { mulberry32 } from './noise.js';
import { regionAt } from './regions.js';
import { WORLD_HALF } from './heightfield.js';
import { cachedResource, sharedResource } from './cache.js';
import { emitWakeStamp } from './wakestamps.js';
import { emitMapMarker } from './mapmarkers.js';
import { clampWakeHeight, wakeSampleAt } from './wakefield.js';

const MPH = 2.23694;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const fmtDist = metres => metres < 305 ? `${Math.max(1, Math.round(metres * 3.28084))} ft` : `${(metres / 1609.344).toFixed(2)} mi`;
const OPEN_STAGES = new Set(['open', 'tow', 'marked']);
const SURVIVOR_STAGES = new Set(['waiting', 'aboard', 'reported']);

// A storm can leave several recovery sites alive for an in-game day. Their identical debris parts are immutable,
// so keep one GPU/CPU resource for every shape and surface instead of rebuilding a full set for every site.
const RECOVERY_GEO = Object.freeze({
  trunk: sharedResource(new THREE.CylinderGeometry(0.2, 0.36, 1, 9)),
  root: sharedResource(new THREE.IcosahedronGeometry(0.72, 1)),
  branch: sharedResource(new THREE.CylinderGeometry(0.045, 0.11, 2.7, 7)),
  branchEnd: sharedResource(new THREE.CylinderGeometry(0.035, 0.07, 0.52, 7)),
  sheetWide: sharedResource(new THREE.BoxGeometry(2.6, 0.07, 0.82)),
  sheetNarrow: sharedResource(new THREE.BoxGeometry(2.25, 0.07, 0.82)),
  buoy: sharedResource(new THREE.SphereGeometry(0.2, 10, 7)),
  pole: sharedResource(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 7)),
  flag: sharedResource(new THREE.PlaneGeometry(0.32, 0.2)),
  signal: sharedResource(new THREE.SphereGeometry(0.075, 8, 6)),
});
const RECOVERY_MAT = Object.freeze({
  bark: sharedResource(new THREE.MeshStandardMaterial({ color: 0x59402d, roughness: 1 })),
  broken: sharedResource(new THREE.MeshStandardMaterial({ color: 0x8c6e4e, roughness: 0.94 })),
  tin: sharedResource(new THREE.MeshStandardMaterial({ color: 0x667679, roughness: 0.46, metalness: 0.58 })),
  buoy: sharedResource(new THREE.MeshStandardMaterial({ color: 0xf05b24, roughness: 0.62 })),
  pole: sharedResource(new THREE.MeshStandardMaterial({ color: 0x353b39, roughness: 0.7, metalness: 0.35 })),
  rope: sharedResource(new THREE.LineBasicMaterial({ color: 0xc6a26d, transparent: true, opacity: 0.9, depthWrite: false })),
});
const SIGNAL_MATERIALS = new Map();

function recolor(group, color) {
  let owned = null;
  group.traverse(o => {
    if (owned || !o.isMesh || !o.material?.color || o.material.metalness < 0.45) return;
    owned = o.material.clone(); owned.color.setHex(color);
    owned.userData = { ...(owned.userData || {}), aftermathOwned: true };
    delete owned.userData.sharedResource;
    o.material = owned;
  });
  return owned;
}

function signal(parent, color, x = 0, y = 1, z = 0, range = 42) {
  const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
  const material = cachedResource(SIGNAL_MATERIALS, color, () => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const bulb = new THREE.Mesh(RECOVERY_GEO.signal, material);
  const light = new THREE.PointLight(color, 0, range, 2); group.add(bulb, light);
  return { group, bulb, light };
}

function disposeRig(rig) {
  if (!rig) return { geometries: 0, materials: 0 };
  // A rescued passenger can be parented to the player or receiving boat, outside the rig's original root.
  rig.survivor?.removeFromParent(); rig.bag?.removeFromParent();
  const roots = rig.group ? [rig.group, rig.rope, rig.workboat] : [rig.root, rig.receiver];
  for (const root of roots) root?.removeFromParent();
  const geometries = new Set(rig.ownedGeometries || []), materials = new Set(rig.ownedMaterials || []);
  for (const geometry of geometries) geometry?.dispose?.();
  for (const material of materials) material?.dispose?.();
  return { geometries: geometries.size, materials: materials.size };
}

function makeReceiverAgent(mesh) {
  return {
    mesh, role: 'storm-recovery', x: 0, z: 0, heading: 0, navHeading: 0, speed: 0, turn: 0, choice: 0,
    decisionT: 0, targetX: 0, targetZ: 0, safeX: 0, safeZ: 0, active: false, backing: false,
    shx: 0, shz: 0, groundT: 0, safe: true, navigationLights: true,
  };
}

function makeBlockageRig(scene, site, onHit) {
  const group = new THREE.Group(); group.name = `storm blockage ${site.id}`;
  const len = site.length;
  const trunk = new THREE.Mesh(RECOVERY_GEO.trunk, RECOVERY_MAT.bark); trunk.scale.y = len; trunk.rotation.z = Math.PI / 2; trunk.position.y = 0.12; group.add(trunk);
  const root = new THREE.Mesh(RECOVERY_GEO.root, RECOVERY_MAT.bark); root.scale.set(0.8, 0.55, 1.1); root.position.set(-len * 0.48, 0.05, 0); group.add(root);
  for (const [x, z, ry] of [[-0.28, 0.8, -0.66], [0.12, -0.7, 0.72], [0.34, 0.58, -0.58]]) {
    const branch = new THREE.Mesh(RECOVERY_GEO.branch, RECOVERY_MAT.bark);
    branch.position.set(x * len, 0.15, z); branch.rotation.set(0.2, 0, ry); group.add(branch);
    const end = new THREE.Mesh(RECOVERY_GEO.branchEnd, RECOVERY_MAT.broken); end.position.set(0, 1.52, 0); branch.add(end);
  }
  for (let i = 0; i < 2; i++) {
    const sheet = new THREE.Mesh(i ? RECOVERY_GEO.sheetNarrow : RECOVERY_GEO.sheetWide, RECOVERY_MAT.tin);
    sheet.position.set((i - 0.5) * 2.2, 0.28, (i ? -1 : 1) * 0.62); sheet.rotation.set(0.08, i ? -0.38 : 0.26, i ? -0.06 : 0.04); group.add(sheet);
  }
  const strobe = signal(group, 0xff6a25, 0, 1.12, 0, 54);
  const buoys = [];
  for (const x of [-len * 0.46, len * 0.46]) {
    const buoy = new THREE.Group(); buoy.position.set(x, 0.12, 0.75);
    const body = new THREE.Mesh(RECOVERY_GEO.buoy, RECOVERY_MAT.buoy); body.scale.y = 0.72; buoy.add(body);
    const pole = new THREE.Mesh(RECOVERY_GEO.pole, RECOVERY_MAT.pole); pole.position.y = 0.38; buoy.add(pole);
    const flag = new THREE.Mesh(RECOVERY_GEO.flag, RECOVERY_MAT.buoy); flag.position.set(0.16, 0.65, 0); buoy.add(flag);
    buoy.visible = false; group.add(buoy); buoys.push(buoy);
  }
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(group);

  const ropeGeo = new THREE.BufferGeometry(); ropeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  const rope = new THREE.Line(ropeGeo, RECOVERY_MAT.rope);
  rope.frustumCulled = false; rope.visible = false; scene.add(rope);
  const workboat = buildSkiff({ crew: true }); workboat.name = `FWC maintenance skiff ${site.id}`; const workboatPaint = recolor(workboat, 0x315e4d);
  const workLamp = signal(workboat, 0x2c83ff, 0, 1.36, -0.2, 62); workboat.visible = false; scene.add(workboat);
  const agent = makeReceiverAgent(workboat); agent.role = 'storm-maintenance';
  const obstacle = { ax: 0, az: 0, bx: 0, bz: 0, r: 0.75, tag: 'storm-debris', onHit };
  const workObstacle = { ax: 0, az: 0, bx: 0, bz: 0, r: 1.05, tag: 'FWC 정비 스키프' };
  return { group, rope, strobe, buoys, obstacle, workboat, workLamp, agent, workObstacle, ownedGeometries: [ropeGeo], ownedMaterials: workboatPaint ? [workboatPaint] : [] };
}

function makeSurvivorRig(scene, site) {
  const rr = mulberry32(site.seed ^ 0x51a7);
  const root = new THREE.Group(); root.name = `swamped skiff ${site.id}`;
  const skiff = buildSkiff({ crew: false }); skiff.position.y = -0.38; skiff.rotation.set(0.08, 0, 0.24); root.add(skiff);
  const survivor = person(rr, { pose: 'sitEdge', vest: true, hat: false }); survivor.position.set(-0.25, 0.28, -0.15); survivor.rotation.y = -0.4; root.add(survivor);
  const bag = cooler(rr); bag.scale.setScalar(0.86); bag.position.set(0.48, 0.2, 0.45); bag.rotation.z = 0.22; root.add(bag);
  const strobe = signal(root, 0xff6a25, 0.62, 1.2, -0.55, 58);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(root);

  const receiver = buildSkiff({ crew: true }); receiver.name = `FWC recovery skiff ${site.id}`; const receiverPaint = recolor(receiver, 0x315e4d);
  const receiverLamp = signal(receiver, 0x2c83ff, 0, 1.36, -0.2, 62); receiver.visible = false; scene.add(receiver);
  const agent = makeReceiverAgent(receiver);
  const wreckObstacle = { ax: 0, az: 0, bx: 0, bz: 0, r: 1.05, tag: 'swamped skiff' };
  const receiverObstacle = { ax: 0, az: 0, bx: 0, bz: 0, r: 1.05, tag: 'FWC 회수 스키프' };
  return { root, skiff, survivor, bag, strobe, receiver, receiverLamp, agent, wreckObstacle, receiverObstacle, ownedGeometries: [], ownedMaterials: receiverPaint ? [receiverPaint] : [] };
}

function sanitizeSite(raw) {
  if (!raw || !['blockage', 'survivor'].includes(raw.type)) return null;
  const validStages = raw.type === 'blockage' ? new Set(['open', 'tow', 'marked', 'cleared']) : new Set(['waiting', 'aboard', 'reported', 'rescued']);
  const site = {
    ...raw,
    id: String(raw.id || ''), type: raw.type, stage: validStages.has(raw.stage) ? raw.stage : (raw.type === 'blockage' ? 'open' : 'waiting'),
    x: finite(raw.x, NaN), z: finite(raw.z, NaN), heading: finite(raw.heading), channelHeading: finite(raw.channelHeading),
    seed: Math.abs(Math.trunc(finite(raw.seed, 1))) || 1, peak: clamp(finite(raw.peak, 0.8)), createdMinutes: Math.max(0, finite(raw.createdMinutes)),
    resolvedMinutes: Math.max(0, finite(raw.resolvedMinutes)), reward: Math.max(0, Math.round(finite(raw.reward))), known: raw.known !== false,
  };
  if (!site.id || !Number.isFinite(site.x) || !Number.isFinite(site.z) || Math.max(Math.abs(site.x), Math.abs(site.z)) >= WORLD_HALF) return null;
  if (site.type === 'blockage') Object.assign(site, {
    clearX: finite(raw.clearX, site.x), clearZ: finite(raw.clearZ, site.z), length: clamp(finite(raw.length, 10), 7.5, 13.5),
    vx: finite(raw.vx), vz: finite(raw.vz), spin: finite(raw.spin), ropeLength: clamp(finite(raw.ropeLength, 11), 6, 18),
    strain: Math.max(0, finite(raw.strain)), clearAt: Math.max(0, finite(raw.clearAt)), method: String(raw.method || ''),
    maintenanceX: Number.isFinite(Number(raw.maintenanceX)) ? Number(raw.maintenanceX) : null,
    maintenanceZ: Number.isFinite(Number(raw.maintenanceZ)) ? Number(raw.maintenanceZ) : null,
    maintenanceHeading: finite(raw.maintenanceHeading, site.channelHeading),
  });
  else Object.assign(site, {
    destX: finite(raw.destX, site.x), destZ: finite(raw.destZ, site.z), destHeading: finite(raw.destHeading),
    resolveAt: Math.max(0, finite(raw.resolveAt)), receiverX: finite(raw.receiverX, raw.destX), receiverZ: finite(raw.receiverZ, raw.destZ),
    receiverHeading: finite(raw.receiverHeading, raw.destHeading), method: String(raw.method || ''),
  });
  return site;
}

export class StormRecovery {
  constructor(o) {
    Object.assign(this, o); // scene, terrain, world, water, phys, boat, game, audio, environment, currents, incidents, encounters, story, radio, reputation, condition
    const saved = this.game.save.stormRecovery || {};
    const episode = saved.episode && typeof saved.episode === 'object' ? {
      startedMinutes: Math.max(0, finite(saved.episode.startedMinutes, this.environment.minutes)), peak: clamp(finite(saved.episode.peak)), windPeak: Math.max(0, finite(saved.episode.windPeak)),
    } : null;
    this.sites = Array.isArray(saved.sites) ? saved.sites.map(sanitizeSite).filter(Boolean).slice(-6) : [];
    this.state = this.game.save.stormRecovery = {
      version: 1, episode, pendingPeak: clamp(finite(saved.pendingPeak)), lastBatchMinutes: Math.max(0, finite(saved.lastBatchMinutes)),
      lastBatchAt: Math.max(0, finite(saved.lastBatchAt)), nextId: Math.max(1, Math.trunc(finite(saved.nextId, 1))),
      stats: { generated: 0, cleared: 0, rescued: 0, marked: 0, reported: 0, ...(saved.stats || {}) }, sites: this.sites,
    };
    this.rigs = new Map(); this.obs = []; this.phys.addObs('storm-recovery', this.obs);
    this.enabled = false; this.interact = false; this.alternate = false; this.prompting = false; this.interactiveNear = null;
    this.towSite = null; this.passengerSite = null; this.persistT = 6; this.weatherPersistT = 12; this.hitCd = 0; this.cleanupT = 20;
    this.disposedResources = { geometries: 0, materials: 0 };
    this.obLevel = 0; this.obPitch = 0.96; this.obX = 0; this.obZ = 0; this._f = new THREE.Vector2(); this._flow = new THREE.Vector2();
    for (const site of this.sites) this.buildRig(site);
    this.restoreActiveStates();
    this.keyHandler = e => {
      if (e.repeat || !this.enabled || this.game.paused) return;
      if (e.code === 'KeyE') this.interact = true;
      if (e.code === 'KeyF') this.alternate = true;
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  buildRig(site) {
    if (this.rigs.has(site.id)) return this.rigs.get(site.id);
    const rig = site.type === 'blockage'
      ? makeBlockageRig(this.scene, site, (into, nx, nz) => this.hitBlockage(site, into, nx, nz))
      : makeSurvivorRig(this.scene, site);
    this.rigs.set(site.id, rig); return rig;
  }

  releaseRig(rig) {
    const released = disposeRig(rig);
    this.disposedResources.geometries += released.geometries;
    this.disposedResources.materials += released.materials;
    return released;
  }

  restoreActiveStates() {
    let tow = false, passenger = false;
    for (const site of this.sites) {
      const rig = this.rigs.get(site.id);
      if (site.type === 'blockage' && site.stage === 'tow') {
        if (tow) site.stage = 'open'; else { tow = true; this.towSite = site; rig.rope.visible = true; }
      }
      if (site.type === 'blockage' && site.stage === 'marked') this.startMaintenance(site, rig, true);
      if (site.type === 'blockage' && site.stage === 'cleared' && site.method === 'workboat') {
        site.maintenanceX = Number.isFinite(site.maintenanceX) ? site.maintenanceX : site.x;
        site.maintenanceZ = Number.isFinite(site.maintenanceZ) ? site.maintenanceZ : site.z;
        rig.agent.active = false;
        rig.workboat.position.set(site.maintenanceX, this.water.waveHeight(site.maintenanceX, site.maintenanceZ, 0) - 0.05, site.maintenanceZ);
        rig.workboat.rotation.y = site.maintenanceHeading;
      }
      if (site.type === 'survivor' && site.stage === 'aboard') {
        if (passenger) site.stage = 'waiting'; else { passenger = true; this.passengerSite = site; this.attachPassenger(site, rig); }
      }
      if (site.type === 'survivor' && site.stage === 'reported') this.startReceiver(site, rig, true);
      if (site.type === 'survivor' && site.stage === 'rescued') this.attachToReceiver(site, rig);
    }
  }

  persist() { this.state.sites = this.sites; this.game.persist(); }
  blocking() { return Boolean(this.towSite || this.passengerSite); }
  capturesInput(code) { return (code === 'KeyE' || code === 'KeyF') && Boolean(this.blocking() || this.interactiveNear); }
  canInteract() {
    return !this.game.state && !this.game.paused && !this.story.blocking() && !this.encounters.active && !this.incidents.active && !this.game.life?.traffic?.activeCollision()
      && !this.game.dockCamp && !this.game.dockJob && !this.game.atBoard && !this.condition.serviceHere;
  }

  findSpot(min = 300, max = 720) {
    const p = this.phys;
    for (let k = 0; k < 180; k++) {
      const a = p.heading + (Math.random() - 0.5) * Math.PI * 1.9, r = min + Math.random() * (max - min);
      const x = p.pos.x - Math.sin(a) * r, z = p.pos.y - Math.cos(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) > WORLD_HALF - 650 || this.terrain.heightAt(x, z) > -0.78 || this.terrain.heightAt(x, z) < -5.8 || this.world.blockedAt(x, z)) continue;
      if (this.sites.some(s => Math.hypot(s.x - x, s.z - z) < 190) || this.game.jobs.some(j => Math.hypot(j.x - x, j.z - z) < 130)) continue;
      let heading = 0, best = -1e9;
      for (let i = 0; i < 16; i++) {
        const h = i / 16 * Math.PI * 2, fx = -Math.sin(h), fz = -Math.cos(h);
        const depths = [-72, -34, 34, 72].map(d => -this.terrain.heightAt(x + fx * d, z + fz * d));
        if (Math.min(...depths) < 0.58) continue;
        const score = depths.reduce((sum, d) => sum + Math.min(4.5, d), 0);
        if (score > best) { best = score; heading = h; }
      }
      if (best > 3) return { x, z, heading };
    }
    return null;
  }

  clearPoint(at) {
    const rx = -Math.cos(at.heading), rz = Math.sin(at.heading);
    let best = null, score = -1e9;
    for (const side of [-1, 1]) for (const dist of [26, 34, 42, 52, 64, 76]) {
      const x = at.x + rx * side * dist, z = at.z + rz * side * dist, h = this.terrain.heightAt(x, z);
      // A cleared tree belongs against the flooded shelf, not forty yards farther down the same working cut.
      if (h > -0.22 || h < -3.4 || this.world.blockedAt(x, z)) continue;
      const s = Math.abs(h + 0.55) * -0.75 + dist * 0.012;
      if (s > score) { score = s; best = { x, z }; }
    }
    if (best) return best;
    const fx = -Math.sin(at.heading), fz = -Math.cos(at.heading);
    return { x: at.x + fx * 46, z: at.z + fz * 46 };
  }

  destination(at) {
    for (let k = 0; k < 120; k++) {
      const a = at.heading + Math.PI + (Math.random() - 0.5) * 1.8, r = 310 + Math.random() * 230;
      const x = at.x - Math.sin(a) * r, z = at.z - Math.cos(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) > WORLD_HALF - 500 || this.terrain.heightAt(x, z) > -0.75 || this.terrain.heightAt(x, z) < -5.5 || this.world.blockedAt(x, z)) continue;
      return { x, z, heading: a + Math.PI };
    }
    return { x: this.game.dockTie.x, z: this.game.dockTie.z, heading: 0 };
  }

  makeSite(type, at, peak) {
    const id = `storm-${this.state.nextId++}`, seed = (Date.now() ^ this.state.nextId * 0x9e3779b1) >>> 0;
    const base = { id, type, x: at.x, z: at.z, channelHeading: at.heading, heading: at.heading, seed, peak, createdMinutes: this.environment.minutes, resolvedMinutes: 0, known: true, method: '' };
    if (type === 'blockage') {
      const clear = this.clearPoint(at);
      return { ...base, stage: 'open', heading: at.heading + Math.PI / 2, clearX: clear.x, clearZ: clear.z, length: 9.5 + (seed % 35) / 10, vx: 0, vz: 0, spin: 0, ropeLength: 11, strain: 0, clearAt: 0, reward: Math.round((300 + peak * 130) / 10) * 10 };
    }
    const dest = this.destination(at);
    return { ...base, stage: 'waiting', destX: dest.x, destZ: dest.z, destHeading: dest.heading, resolveAt: 0, receiverX: dest.x, receiverZ: dest.z, receiverHeading: dest.heading, reward: Math.round((380 + peak * 150) / 10) * 10 };
  }

  spawnBatch(peak = 1, nearby = false) {
    const unresolved = this.sites.filter(s => !['cleared', 'rescued'].includes(s.stage)).length;
    if (unresolved >= 4) return false;
    const types = peak >= 0.82 && unresolved <= 2 ? ['blockage', 'survivor'] : ['blockage'];
    let made = 0;
    for (const type of types.slice(0, 4 - unresolved)) {
      const at = this.findSpot(nearby ? 92 : 300, nearby ? 135 : 760); if (!at) continue;
      const site = this.makeSite(type, at, peak); this.sites.push(site); this.buildRig(site); made++;
      const region = regionAt(site.x, site.z);
      if (type === 'blockage') this.radio.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: `${region.name}의 폭풍 점검: 가동 중인 해협에 부러진 사이프러스와 지붕재가 흩어져 있습니다. 주황 스트로브가 그 위에서 켜져 있습니다. 표시하거나 끌어내세요.`, priority: 3, key: `aftermath:blockage:${idSafe(site.id)}`, cooldown: 0 });
      else this.radio.transmit({ channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: `${region.name}에 침수된 스키프가 있고 부상자 한 명이 아직 탑승 중입니다. 타워 보트가 가장 가까운 천수역 선체를 보유하고 있습니다. 구조 스키프는 해협 바깥에서 대기 중입니다.`, priority: 3, key: `aftermath:survivor:${idSafe(site.id)}`, cooldown: 0 });
    }
    if (!made) return false;
    this.state.stats.generated += made; this.state.lastBatchMinutes = this.environment.minutes; this.state.lastBatchAt = Date.now(); this.state.pendingPeak = 0;
    this.game.toast('폭풍 여파', `${made}개의 복구 ${made === 1 ? '호출이' : '호출들이'} 해도에 있습니다.`, 3.4); this.persist(); return true;
  }

  trackWeather() {
    const V = this.environment.values, severe = V.storm > 0.72 && V.wind > 11;
    if (severe) {
      if (!this.state.episode) { this.state.episode = { startedMinutes: this.environment.minutes, peak: V.storm, windPeak: V.wind }; this.persist(); }
      else { this.state.episode.peak = Math.max(this.state.episode.peak, V.storm); this.state.episode.windPeak = Math.max(this.state.episode.windPeak, V.wind); }
    } else if (this.state.episode && V.storm < 0.46) {
      const episode = this.state.episode, duration = this.environment.minutes - episode.startedMinutes;
      if (episode.peak >= 0.78 && duration >= 8) this.state.pendingPeak = Math.max(this.state.pendingPeak, episode.peak);
      this.state.episode = null; this.persist();
    }
    const cooled = !this.state.lastBatchAt || Date.now() - this.state.lastBatchAt > 180000;
    if (this.state.pendingPeak > 0 && cooled && !this.game.state && !this.story.blocking() && !this.blocking()) this.spawnBatch(this.state.pendingPeak, false);
  }

  setPrompt(html) { this.game.el.prompt.innerHTML = html; this.game.el.prompt.classList.add('on'); this.prompting = true; }
  clearPrompt() { if (this.prompting) this.game.el.prompt.classList.remove('on'); this.prompting = false; }

  attachTow(site) {
    if (site.stage !== 'open' || this.towSite || this.passengerSite) return;
    const d = Math.hypot(site.x - this.phys.pos.x, site.z - this.phys.pos.y);
    site.stage = 'tow'; site.ropeLength = clamp(d + 1.2, 7, 16); site.strain = 0; this.towSite = site;
    this.rigs.get(site.id).rope.visible = true; this.clearPrompt(); this.audio.checkpoint();
    this.game.toast('견인 라인 고정', '표시된 포켓으로 사이프러스를 부드럽게 밀어 넣으세요. F가 라인을 놓습니다.', 3); this.persist();
  }

  dropTow(parted = false) {
    const site = this.towSite; if (!site) return;
    site.stage = 'open'; site.strain = 0; this.rigs.get(site.id).rope.visible = false; this.towSite = null; this.phys.towDrag = 0;
    this.game.toast(parted ? '견인 라인 절단' : '견인 라인 해제', parted ? '장력이 너무 큽니다. 다시 나란히 붙어 재설정하세요.' : '장애물이 여전히 해협에 남아 있습니다.', 2.8); this.persist();
  }

  maintenanceStart(site) {
    const base = site.channelHeading || 0;
    for (const turn of [Math.PI, 0, Math.PI * 0.5, -Math.PI * 0.5]) for (const r of [145, 185, 115, 225]) {
      const a = base + turn, x = site.x - Math.sin(a) * r, z = site.z - Math.cos(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) > WORLD_HALF - 180 || this.world.blockedAt(x, z) || this.terrain.heightAt(x, z) > -0.62) continue;
      const mx = (x + site.x) * 0.5, mz = (z + site.z) * 0.5;
      if (this.world.blockedAt(mx, mz) || this.terrain.heightAt(mx, mz) > -0.48) continue;
      return { x, z, heading: Math.atan2(-(site.x - x), -(site.z - z)) };
    }
    const fallback = this.destination({ x: site.x, z: site.z, heading: site.channelHeading });
    return { x: fallback.x, z: fallback.z, heading: Math.atan2(-(site.x - fallback.x), -(site.z - fallback.z)) };
  }

  startMaintenance(site, rig, restore = false) {
    if (rig.agent.active) return;
    const saved = restore && Number.isFinite(site.maintenanceX) && Number.isFinite(site.maintenanceZ);
    const at = saved ? { x: site.maintenanceX, z: site.maintenanceZ, heading: site.maintenanceHeading } : this.maintenanceStart(site);
    this.incidents.setAgent(rig.agent, at.x, at.z, at.heading, restore ? 2 : 4.8);
    site.maintenanceX = at.x; site.maintenanceZ = at.z; site.maintenanceHeading = at.heading;
  }

  markBlockage(site) {
    if (!OPEN_STAGES.has(site.stage) || site.stage === 'marked') return;
    if (this.towSite === site) { this.rigs.get(site.id).rope.visible = false; this.towSite = null; this.phys.towDrag = 0; }
    site.stage = 'marked'; site.clearAt = this.environment.minutes + 24; site.strain = 0; this.state.stats.marked++;
    const rig = this.rigs.get(site.id); for (const b of rig.buoys) b.visible = true;
    this.startMaintenance(site, rig, false);
    this.radio.transmit({ channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: `주황 표시 복사 완료. 폭풍 교통이 정리되면 정비 스키프가 장애물을 치웁니다.`, priority: 2, key: `aftermath:marked:${idSafe(site.id)}`, cooldown: 0 });
    this.reputation.change('fwc', 0.2, 'storm-obstruction-marked', '가동 해협을 막은 폭풍 잔해에 사용할 수 있는 좌표를 표시했습니다.', true);
    this.game.toast('장애물 표시 완료', 'FWC 정비팀이 좌표를 확보했습니다. 잔해는 그들의 스키프가 도착할 때까지 남습니다.', 3); this.persist();
  }

  resolveBlockage(site, method = 'tow') {
    if (site.stage === 'cleared') return;
    if (this.towSite === site) { this.rigs.get(site.id).rope.visible = false; this.towSite = null; this.phys.towDrag = 0; }
    const rig = this.rigs.get(site.id);
    if (method === 'workboat') {
      site.maintenanceX = rig.agent.x; site.maintenanceZ = rig.agent.z; site.maintenanceHeading = rig.agent.heading; rig.agent.active = false;
      rig.workboat.position.set(site.maintenanceX, this.water.waveHeight(site.maintenanceX, site.maintenanceZ, 0) - 0.05, site.maintenanceZ); rig.workboat.rotation.y = site.maintenanceHeading;
    }
    site.stage = 'cleared'; site.method = method; site.resolvedMinutes = this.environment.minutes; site.x = site.clearX; site.z = site.clearZ; site.vx = site.vz = site.spin = 0; site.strain = 0;
    for (const b of rig.buoys) b.visible = false;
    this.state.stats.cleared++;
    if (method === 'tow') {
      this.game.addCash(site.reward); this.reputation.change('locals', 0.65, 'storm-cut-cleared', '가동 해협에서 폭풍으로 쓰러진 사이프러스를 끌어냈습니다.', true);
      this.reputation.change('fwc', 0.3, 'storm-cut-cleared', 'FWC가 타워 보트가 해협 장애물을 치웠다고 기록했습니다.', false);
      this.game.bountyToast(`폭풍 해협 재개방 <b>+$${site.reward}</b>`); this.audio.complete();
      this.radio.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: '해협이 열렸습니다. 사이프러스가 둑에 붙었고 가운데로 깨끗한 물이 흐릅니다.', priority: 2, key: `aftermath:clear:${idSafe(site.id)}`, cooldown: 0 });
    } else {
      const pay = 90; this.game.addCash(pay); this.game.bountyToast(`정비 보수 확인 <b>+$${pay}</b>`); this.audio.checkpoint();
      this.radio.transmit({ channel: 'FWC TAC', speaker: 'FWC MAINTENANCE', text: '표시된 장애물이 둑에 닿았습니다. 가동 해협이 다시 열렸습니다. 좋은 좌표입니다, 타워 보트.', priority: 2, key: `aftermath:workboat:${idSafe(site.id)}`, cooldown: 0 });
    }
    this.persist();
  }

  hitBlockage(site, into, nx, nz) {
    if (!OPEN_STAGES.has(site.stage) || into < 1.3) return;
    site.vx -= nx * into * 0.34; site.vz -= nz * into * 0.34; site.spin += (Math.random() - 0.5) * into * 0.07;
    if (this.hitCd <= 0 && into > 2.4) { this.hitCd = 3.5; this.audio.knock(clamp(into / 8, 0.2, 0.9)); this.game.toast('폭풍 장애물', '선체 아래에 지붕재와 사이프러스가 있습니다. 프로펠러가 걸리기 전에 뒤로 빠지세요.', 2.5); }
  }

  updateRope(site, rig, t, dt) {
    const p = this.phys, f = p.forward(this._f), sx = p.pos.x - f.x * 2.55, sz = p.pos.y - f.y * 2.55;
    const dx = sx - site.x, dz = sz - site.z, d = Math.hypot(dx, dz) || 1, tension = Math.max(0, d - site.ropeLength), nx = dx / d, nz = dz / d;
    if (tension > 0) {
      site.vx += nx * tension * 1.38 * dt; site.vz += nz * tension * 1.38 * dt;
      p.vel.x -= nx * tension * 0.16 * dt; p.vel.y -= nz * tension * 0.16 * dt;
    }
    site.strain = tension > 5.5 ? site.strain + (tension - 5.5) / 4 * dt : Math.max(0, site.strain - dt * 1.5);
    p.towDrag = Math.max(p.towDrag, 0.68);
    const arr = rig.rope.geometry.attributes.position.array;
    for (let i = 0; i < 16; i++) {
      const k = i / 15, x = sx + (site.x - sx) * k, z = sz + (site.z - sz) * k;
      arr[i * 3] = x; arr[i * 3 + 1] = this.water.waveHeight(x, z, t) + 0.22 - Math.sin(k * Math.PI) * 0.18; arr[i * 3 + 2] = z;
    }
    rig.rope.geometry.attributes.position.needsUpdate = true; rig.rope.visible = true;
    if (d > site.ropeLength + 10 || site.strain > 1.4) this.dropTow(true);
  }

  updateBlockage(site, rig, dt, t) {
    const active = OPEN_STAGES.has(site.stage), dPlayer = Math.hypot(site.x - this.phys.pos.x, site.z - this.phys.pos.y);
    if (active) {
      const flow = this.currents ? this.currents.flowAt(site.x, site.z, this._flow) : null;
      const targetX = flow ? flow.x * 0.08 : 0, targetZ = flow ? flow.y * 0.08 : 0, follow = 1 - Math.exp(-dt * 0.45);
      site.vx += (targetX - site.vx) * follow; site.vz += (targetZ - site.vz) * follow; site.spin *= Math.exp(-dt * 0.75);
      if (site.stage === 'tow' && this.towSite === site) {
        this.updateRope(site, rig, t, dt);
      }
      const nx = site.x + site.vx * dt, nz = site.z + site.vz * dt;
      if (this.terrain.heightAt(nx, nz) < -0.2 && !this.world.blockedAt(nx, nz)) { site.x = nx; site.z = nz; } else { site.vx *= -0.25; site.vz *= -0.25; }
      site.heading += site.spin * dt;
      if (site.stage === 'tow' && Math.hypot(site.x - site.clearX, site.z - site.clearZ) < 8.5) this.resolveBlockage(site, 'tow');
      if (site.stage === 'marked') {
        if (!rig.agent.active) this.startMaintenance(site, rig, true);
        this.incidents.updateAgent(rig.agent, dt, t, site.x, site.z, 8.2, 9);
        site.maintenanceX = rig.agent.x; site.maintenanceZ = rig.agent.z; site.maintenanceHeading = rig.agent.heading;
        const gap = Math.hypot(rig.agent.x - site.x, rig.agent.z - site.z);
        if ((this.environment.minutes >= site.clearAt && gap < 14) || this.environment.minutes > site.clearAt + 18) this.resolveBlockage(site, 'workboat');
      }
    }
    const age = this.environment.minutes - site.resolvedMinutes, show = active ? dPlayer < 1050 : age < 720 && dPlayer < 650;
    rig.group.visible = show; rig.rope.visible = Boolean(show && this.towSite === site);
    if (show) {
      rig.group.position.set(site.x, this.water.waveHeight(site.x, site.z, t) - 0.13, site.z); rig.group.rotation.set(Math.sin(t * 0.6 + site.seed) * 0.025, site.heading, Math.sin(t * 0.77 + site.seed) * 0.04, 'YXZ');
      const pulse = 0.5 + Math.sin(t * 5.2) * 0.5; rig.strobe.light.intensity = active ? 18 + pulse * 82 : 0; rig.strobe.bulb.scale.setScalar(0.75 + pulse * 0.45);
      for (const b of rig.buoys) b.visible = site.stage === 'marked';
      if (dPlayer < (active ? 95 : 65)) {
        const dx = Math.cos(site.heading) * site.length * 0.43, dz = -Math.sin(site.heading) * site.length * 0.43, o = rig.obstacle;
        o.ax = site.x - dx; o.az = site.z - dz; o.bx = site.x + dx; o.bz = site.z + dz; this.obs.push(o);
      }
    }
    const workPresent = site.stage === 'marked' || (site.stage === 'cleared' && site.method === 'workboat' && age < 72);
    const dWork = Math.hypot(site.maintenanceX - this.phys.pos.x, site.maintenanceZ - this.phys.pos.y);
    rig.workboat.visible = workPresent && dWork < 1050;
    if (rig.workboat.visible) {
      if (!rig.agent.active) { rig.workboat.position.set(site.maintenanceX, this.water.waveHeight(site.maintenanceX, site.maintenanceZ, t) - 0.05, site.maintenanceZ); rig.workboat.rotation.y = site.maintenanceHeading; }
      const pulse = 0.5 + Math.sin(t * 4.9) * 0.5; rig.workLamp.light.intensity = 10 + pulse * 78; rig.workLamp.bulb.scale.setScalar(0.75 + pulse * 0.4);
      if (dWork < 72) this.addBoatObstacle(site.maintenanceX, site.maintenanceZ, site.maintenanceHeading, rig.workObstacle);
    } else rig.workLamp.light.intensity = 0;
  }

  attachPassenger(site, rig) {
    this.boat.add(rig.survivor, rig.bag); rig.survivor.position.set(0.56, 0.67, 0.32); rig.survivor.rotation.set(0, 2.65, 0);
    rig.bag.position.set(-0.65, 0.61, 0.58); rig.bag.rotation.set(0.03, -0.2, 0.02); rig.survivor.visible = rig.bag.visible = true;
    this.phys.loaded = Math.max(this.phys.loaded, 0.24);
  }

  attachToReceiver(site, rig) {
    rig.receiver.add(rig.survivor, rig.bag); rig.survivor.position.set(0.46, 0.46, -0.35); rig.survivor.rotation.set(0, 2.8, 0);
    rig.bag.position.set(-0.48, 0.3, 0.62); rig.bag.rotation.set(0, 0.2, 0); rig.survivor.visible = rig.bag.visible = true;
  }

  boardSurvivor(site) {
    if (site.stage !== 'waiting' || this.passengerSite || this.towSite) return;
    const rig = this.rigs.get(site.id); site.stage = 'aboard'; this.passengerSite = site; this.attachPassenger(site, rig); this.clearPrompt(); this.audio.pickup();
    this.radio.transmit({ channel: 'FWC TAC', speaker: 'FWC RECOVERY', text: '타워 보트, 트랜스폰더를 확보했습니다. 환자를 파란 구조 등불에 데려오고 옆에 정지하세요.', priority: 3, key: `aftermath:aboard:${idSafe(site.id)}`, cooldown: 0 });
    this.game.toast('부상자 탑승', 'FWC 구조팀이 파란 등불에서 대기 중입니다.', 3.2); this.persist();
  }

  startReceiver(site, rig, restore = false) {
    const x = restore ? finite(site.receiverX, site.destX) : site.destX, z = restore ? finite(site.receiverZ, site.destZ) : site.destZ;
    this.incidents.setAgent(rig.agent, x, z, restore ? finite(site.receiverHeading, site.destHeading) : site.destHeading, restore ? 2 : 0);
  }

  reportSurvivor(site) {
    if (site.stage !== 'waiting') return;
    const rig = this.rigs.get(site.id); site.stage = 'reported'; site.resolveAt = this.environment.minutes + 24; this.state.stats.reported++; this.startReceiver(site, rig, false); this.clearPrompt();
    this.reputation.change('fwc', 0.2, 'storm-survivor-fix', '침수된 폭풍 스키프에 대해 정확한 좌표를 전달했습니다.', true);
    this.radio.transmit({ channel: 'FWC TAC', speaker: 'FWC RECOVERY', text: '좌표 복사 완료. 천수역 구조팀이 접근 중입니다. 현장에 머무르면 주황 스트로브 주변을 비워두세요.', priority: 3, key: `aftermath:reported:${idSafe(site.id)}`, cooldown: 0 });
    this.game.toast('좌표 전달', 'FWC 구조팀이 해협으로 진입 중입니다.', 3); this.persist();
  }

  resolveSurvivor(site, method = 'aboard') {
    if (site.stage === 'rescued') return;
    const rig = this.rigs.get(site.id); site.stage = 'rescued'; site.method = method; site.resolvedMinutes = this.environment.minutes;
    if (this.passengerSite === site) { this.passengerSite = null; this.phys.loaded = 0; }
    if (method === 'aboard') {
      rig.agent.active = false; site.receiverX = site.destX; site.receiverZ = site.destZ; site.receiverHeading = site.destHeading;
      rig.receiver.position.set(site.destX, this.water.waveHeight(site.destX, site.destZ, 0) - 0.05, site.destZ); rig.receiver.rotation.y = site.destHeading;
      this.attachToReceiver(site, rig); this.game.addCash(site.reward);
      this.reputation.change('locals', 0.9, 'storm-boater-recovered', '폭풍 해협에서 부상자를 수송했습니다.', true);
      this.reputation.change('fwc', 0.4, 'storm-boater-recovered', '구조 스키프에 폭풍 부상자를 직접 인계했습니다.', false);
      this.game.bountyToast(`폭풍 복구 완료 <b>+$${site.reward}</b>`); this.audio.complete();
      this.radio.transmit({ channel: 'FWC TAC', speaker: 'FWC RECOVERY', text: '환자와 방수 가방이 탑승했습니다. 맥박 안정. 타워 보트, 선미 비우고 결제 호출을 받으세요.', priority: 3, key: `aftermath:rescued:${idSafe(site.id)}`, cooldown: 0 });
    } else {
      rig.agent.active = false; site.receiverX = site.x; site.receiverZ = site.z; site.receiverHeading = rig.agent.heading;
      rig.receiver.position.set(site.x, this.water.waveHeight(site.x, site.z, 0) - 0.05, site.z); rig.receiver.rotation.y = site.receiverHeading; this.attachToReceiver(site, rig);
      this.game.addCash(70); this.game.bountyToast('복구 좌표 확인 <b>+$70</b>'); this.audio.checkpoint();
      this.radio.transmit({ channel: 'FWC TAC', speaker: 'FWC RECOVERY', text: '환자가 침수 선체에서 내렸습니다. 주황 스트로브 좌표 덕분에 바로 들어왔습니다.', priority: 2, key: `aftermath:reported-clear:${idSafe(site.id)}`, cooldown: 0 });
    }
    this.state.stats.rescued++; if (this.game.wpTarget?.recovery) this.game.wpTarget = null; this.persist();
  }

  updateSurvivor(site, rig, dt, t) {
    const dSite = Math.hypot(site.x - this.phys.pos.x, site.z - this.phys.pos.y), age = this.environment.minutes - site.resolvedMinutes;
    rig.root.visible = dSite < (SURVIVOR_STAGES.has(site.stage) ? 1000 : age < 720 ? 620 : 0);
    if (rig.root.visible) {
      rig.root.position.set(site.x, this.water.waveHeight(site.x, site.z, t) - 0.12, site.z); rig.root.rotation.set(Math.sin(t * 0.63 + site.seed) * 0.035, site.heading, Math.sin(t * 0.84 + site.seed) * 0.055, 'YXZ');
      const pulse = 0.5 + Math.sin(t * 5.8) * 0.5; rig.strobe.light.intensity = SURVIVOR_STAGES.has(site.stage) ? 15 + pulse * 88 : 0; rig.strobe.bulb.scale.setScalar(0.7 + pulse * 0.5);
      if ((site.stage === 'waiting' || site.stage === 'reported') && rig.survivor.parent === rig.root) {
        animatePerson(rig.survivor, t, dt, { x: this.phys.pos.x, z: this.phys.pos.y, speed: this.phys.speed });
        if (dSite < 90 && rig.survivor.userData.waveT <= 0) wave(rig.survivor);
      }
    }
    if (site.stage === 'aboard' && rig.survivor.parent === this.boat) animatePerson(rig.survivor, t, dt, null);

    if (site.stage === 'reported') {
      if (!rig.agent.active) this.startReceiver(site, rig, true);
      this.incidents.updateAgent(rig.agent, dt, t, site.x, site.z, 8.6, 10);
      site.receiverX = rig.agent.x; site.receiverZ = rig.agent.z; site.receiverHeading = rig.agent.heading;
      const gap = Math.hypot(rig.agent.x - site.x, rig.agent.z - site.z);
      if (gap < 13 || this.environment.minutes > site.resolveAt + 18) this.resolveSurvivor(site, 'reported');
    } else if (site.stage === 'aboard') {
      rig.agent.active = false; rig.receiver.position.set(site.destX, this.water.waveHeight(site.destX, site.destZ, t) - 0.05, site.destZ); rig.receiver.rotation.y = site.destHeading;
    } else if (site.stage === 'rescued') {
      rig.agent.active = false; rig.receiver.position.set(site.receiverX, this.water.waveHeight(site.receiverX, site.receiverZ, t) - 0.05, site.receiverZ); rig.receiver.rotation.y = site.receiverHeading;
      if (rig.survivor.parent === rig.receiver) animatePerson(rig.survivor, t, dt, null);
    }
    const rx = site.stage === 'reported' ? rig.agent.x : site.stage === 'rescued' ? site.receiverX : site.destX;
    const rz = site.stage === 'reported' ? rig.agent.z : site.stage === 'rescued' ? site.receiverZ : site.destZ;
    const dReceiver = Math.hypot(rx - this.phys.pos.x, rz - this.phys.pos.y);
    rig.receiver.visible = ['aboard', 'reported', 'rescued'].includes(site.stage) && dReceiver < 1050 && (site.stage !== 'rescued' || age < 720);
    if (rig.receiver.visible) {
      const pulse = 0.5 + Math.sin(t * 4.7) * 0.5; rig.receiverLamp.light.intensity = 10 + pulse * 82; rig.receiverLamp.bulb.scale.setScalar(0.75 + pulse * 0.4);
    } else rig.receiverLamp.light.intensity = 0;
    if (rig.root.visible && dSite < 72 && site.stage !== 'aboard') this.addBoatObstacle(site.x, site.z, site.heading, rig.wreckObstacle);
    if (rig.receiver.visible && dReceiver < 72) this.addBoatObstacle(rx, rz, site.stage === 'reported' ? rig.agent.heading : site.destHeading, rig.receiverObstacle);
  }

  addBoatObstacle(x, z, heading, obstacle) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    obstacle.ax = x + fx * 2.1; obstacle.az = z + fz * 2.1; obstacle.bx = x - fx * 2.1; obstacle.bz = z - fz * 2.1; this.obs.push(obstacle);
  }

  handleInteraction() {
    this.interactiveNear = null;
    if (!this.canInteract()) { this.clearPrompt(); this.interact = this.alternate = false; return; }
    if (this.towSite) {
      this.interactiveNear = this.towSite; this.setPrompt('<b>F</b> 견인 라인을 놓아라'); if (this.alternate) this.dropTow(false);
      this.interact = this.alternate = false; return;
    }
    if (this.passengerSite) {
      const site = this.passengerSite, d = Math.hypot(site.destX - this.phys.pos.x, site.destZ - this.phys.pos.y); this.interactiveNear = site;
      if (d < 14 && this.phys.speed * MPH < 6) { this.setPrompt('<b>E</b> 부상자를 FWC 구조팀에 인계하라'); if (this.interact) this.resolveSurvivor(site, 'aboard'); }
      else this.clearPrompt();
      this.interact = this.alternate = false; return;
    }
    let nearest = null, best = 16;
    for (const site of this.sites) {
      if (!['open', 'waiting'].includes(site.stage)) continue;
      const d = Math.hypot(site.x - this.phys.pos.x, site.z - this.phys.pos.y); if (d < best) { best = d; nearest = site; }
    }
    this.interactiveNear = nearest;
    if (!nearest || this.phys.speed * MPH >= 6) this.clearPrompt();
    else if (nearest.type === 'blockage') {
      this.setPrompt('<b>E</b> 견인 라인을 붙여라 <i>· F FWC 정비팀에 표시하라</i>');
      if (this.interact) this.attachTow(nearest); else if (this.alternate) this.markBlockage(nearest);
    } else {
      this.setPrompt('<b>E</b> 부상자를 태워라 <i>· F FWC에 좌표를 전달하라</i>');
      if (this.interact) this.boardSurvivor(nearest); else if (this.alternate) this.reportSurvivor(nearest);
    }
    this.interact = this.alternate = false;
  }

  activeHudSite() {
    if (this.towSite || this.passengerSite) return this.towSite || this.passengerSite;
    let nearest = null, best = 360;
    for (const site of this.sites) {
      if (!OPEN_STAGES.has(site.stage) && !SURVIVOR_STAGES.has(site.stage)) continue;
      const d = Math.hypot(site.x - this.phys.pos.x, site.z - this.phys.pos.y); if (d < best) { best = d; nearest = site; }
    }
    return nearest;
  }

  hud() {
    const site = this.activeHudSite(); if (!site) return null;
    const region = regionAt(site.x, site.z).name;
    if (site.stage === 'tow') return { title: '폭풍 복구', obj: '가동 해협에서 장애물을 견인해라', sub: `${fmtDist(Math.hypot(site.x - site.clearX, site.z - site.clearZ))} 표시 포켓까지 · ${site.strain > 0.7 ? '라인에 강한 장력' : '일정한 장력을 유지'} · F 라인 해제` };
    if (site.stage === 'aboard') return { title: '폭풍 복구', obj: '부상자를 FWC 구조팀에 데려가라', sub: `${fmtDist(Math.hypot(this.phys.pos.x - site.destX, this.phys.pos.y - site.destZ))} · 파란 등불 옆에 정지` };
    if (site.stage === 'open') return { title: '폭풍 복구', obj: '전방에 폭풍 장애물', sub: `${region} · 견인해 치우거나 정비팀에 표시` };
    if (site.stage === 'marked') {
      const A = this.rigs.get(site.id)?.agent, distance = A?.active ? ` · 정비 스키프 ${fmtDist(Math.hypot(A.x - site.x, A.z - site.z))} 떨어짐` : '';
      return { title: '폭풍 복구', obj: '표시된 장애물이 해협에 남아 있습니다', sub: `${region}${distance}` };
    }
    if (site.stage === 'reported') return { title: '폭풍 복구', obj: 'FWC 구조팀이 접근 중', sub: `${region} · 주황 스트로브 주변을 비워두세요` };
    return { title: '폭풍 복구', obj: '침수된 스키프 위의 부상자', sub: `${region} · 태우거나 좌표를 전달하세요` };
  }

  markers() {
    return this.sites.filter(s => !['cleared', 'rescued'].includes(s.stage)).map(site => ({
      x: site.stage === 'aboard' ? site.destX : site.x, z: site.stage === 'aboard' ? site.destZ : site.z,
      color: site.type === 'blockage' ? '#f07a2e' : '#79d6a0',
      label: site.stage === 'tow' ? '견인 중인 폭풍 장애물' : site.stage === 'marked' ? '표시된 폭풍 장애물' : site.stage === 'aboard' ? 'FWC 구조 픽업' : site.stage === 'reported' ? 'FWC 폭풍 복구' : site.type === 'blockage' ? '폭풍 장애물' : '침수 스키프',
    }));
  }

  pushMarkers() {
    for (const mark of this.markers()) {
      const d = Math.hypot(mark.x - this.phys.pos.x, mark.z - this.phys.pos.y); if (d > 1450 && !this.blocking()) continue;
      emitMapMarker(this.game, mark.x, mark.z, mark.color === '#f07a2e' ? 'hazard' : 'dot', mark.color, 0, this.blocking());
    }
    for (const site of this.sites) {
      if (site.type !== 'blockage' || site.stage !== 'marked') continue;
      const A = this.rigs.get(site.id).agent;
      if (A.active) emitMapMarker(this.game, A.x, A.z, 'boat', '#5aa7ff', A.heading);
    }
    if (this.towSite) this.game.wpTarget = { x: this.towSite.clearX, z: this.towSite.clearZ, label: '맑은 물 포켓', color: '#f07a2e', recovery: true };
    else if (this.passengerSite) this.game.wpTarget = { x: this.passengerSite.destX, z: this.passengerSite.destZ, label: 'FWC 복구', color: '#79d6a0', recovery: true };
    else if (this.game.wpTarget?.recovery) this.game.wpTarget = null;
  }

  updateAudio() {
    this.obLevel = 0; this.obPitch = 0.96; this.obX = 0; this.obZ = 0;
    for (const site of this.sites) {
      const movingWorkboat = site.type === 'blockage' && site.stage === 'marked';
      const movingRecovery = site.type === 'survivor' && site.stage === 'reported';
      if (!movingWorkboat && !movingRecovery) continue;
      const rig = this.rigs.get(site.id), A = rig.agent, d = Math.hypot(A.x - this.phys.pos.x, A.z - this.phys.pos.y);
      if (A.active && d < 160) { const level = (0.25 + 0.7 * Math.min(1, A.speed / 9)) * (1 - d / 160); if (level > this.obLevel) { this.obLevel = level; this.obX = A.x; this.obZ = A.z; } }
    }
  }

  prune() {
    const keep = [];
    for (const site of this.sites) {
      const resolved = ['cleared', 'rescued'].includes(site.stage), age = this.environment.minutes - site.resolvedMinutes;
      if (!resolved || age < 1440) { keep.push(site); continue; }
      const rig = this.rigs.get(site.id);
      this.releaseRig(rig);
      this.rigs.delete(site.id);
    }
    if (keep.length !== this.sites.length) { this.sites = keep; this.state.sites = keep; this.persist(); }
  }

  update(dt, t, enabled = true) {
    this.enabled = enabled; this.hitCd = Math.max(0, this.hitCd - dt); this.obs.length = 0;
    if (enabled) this.trackWeather();
    const step = enabled ? dt : 0;
    for (const site of this.sites) {
      const rig = this.rigs.get(site.id) || this.buildRig(site);
      if (site.type === 'blockage') this.updateBlockage(site, rig, step, t); else this.updateSurvivor(site, rig, step, t);
    }
    if (enabled) this.handleInteraction(); else { this.interact = this.alternate = false; this.clearPrompt(); }
    this.pushMarkers(); this.updateAudio();
    if (enabled && (this.blocking() || this.sites.some(s => s.stage === 'reported' || s.stage === 'marked') || this.state.episode)) {
      this.persistT -= dt; if (this.persistT <= 0) { this.persistT = 6; this.persist(); }
    }
    this.cleanupT -= dt; if (this.cleanupT <= 0) { this.cleanupT = 20; this.prune(); }
  }

  wakeHeightAt(x, z, t) {
    let height = 0;
    for (let i = 0; i < this.sites.length; i++) {
      const site = this.sites[i];
      const movingWorkboat = site.type === 'blockage' && site.stage === 'marked';
      const movingRecovery = site.type === 'survivor' && site.stage === 'reported';
      if (!movingWorkboat && !movingRecovery) continue;
      const A = this.rigs.get(site.id)?.agent;
      if (!A?.active || A.backing || A.speed <= 2.2) continue;
      const dx = x - A.x, dz = z - A.z; if (dx * dx + dz * dz > 10609) continue;
      height += wakeSampleAt(A.x, A.z, A.heading, A.speed, 9, 0.095, x, z, t);
    }
    return clampWakeHeight(height, 0.2);
  }

  visitActiveVessels(visitor) {
    for (let i = 0; i < this.sites.length; i++) {
      const site = this.sites[i];
      const movingWorkboat = site.type === 'blockage' && site.stage === 'marked';
      const movingRecovery = site.type === 'survivor' && site.stage === 'reported';
      if (!movingWorkboat && !movingRecovery) continue;
      const agent = this.rigs.get(site.id)?.agent;
      if (agent?.active) visitor(agent.x, agent.z, agent.speed, 'skiff', agent);
    }
  }

  stamps(out) {
    for (const site of this.sites) {
      if (site.type === 'blockage' && OPEN_STAGES.has(site.stage) && Math.hypot(site.x - this.phys.pos.x, site.z - this.phys.pos.y) < 95 && Math.hypot(site.vx, site.vz) > 0.18) emitWakeStamp(out, site.x, site.z, 2.4, -0.2, 0.32, 2.2);
      const movingWorkboat = site.type === 'blockage' && site.stage === 'marked';
      const movingRecovery = site.type === 'survivor' && site.stage === 'reported';
      if (!movingWorkboat && !movingRecovery) continue;
      const A = this.rigs.get(site.id).agent; if (!A.active || A.speed < 2 || Math.hypot(A.x - this.phys.pos.x, A.z - this.phys.pos.y) > 95) continue;
      const fx = -Math.sin(A.heading), fz = -Math.cos(A.heading), sp = Math.min(1, A.speed / 9);
      emitWakeStamp(out, A.x - fx * 1.8, A.z - fz * 1.8, 1.1, 0.5 * sp, 1.4 * sp, 1);
    }
  }

  forceBatch(peak = 1, nearby = true) {
    const severity = clamp(peak, 0.82, 1);
    return this.spawnBatch(severity, nearby) || (nearby && this.spawnBatch(severity, false));
  }
  resetDebug() {
    if (this.towSite) { this.rigs.get(this.towSite.id).rope.visible = false; this.towSite = null; this.phys.towDrag = 0; }
    if (this.passengerSite) { this.passengerSite = null; this.phys.loaded = 0; }
    for (const rig of this.rigs.values()) this.releaseRig(rig);
    this.sites = []; this.rigs.clear(); this.obs.length = 0; this.state.sites = this.sites; this.state.episode = null; this.state.pendingPeak = 0; this.state.lastBatchMinutes = 0; this.state.lastBatchAt = 0; this.state.nextId = 1;
    this.state.stats = { generated: 0, cleared: 0, rescued: 0, marked: 0, reported: 0 };
    this.clearPrompt(); if (this.game.wpTarget?.recovery) this.game.wpTarget = null; this.persist();
  }
}

function idSafe(id) { return String(id).replace(/[^a-z0-9-]/gi, ''); }
