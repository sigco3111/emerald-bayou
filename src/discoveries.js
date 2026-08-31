import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wreck } from './markers.js';
import { regionAt } from './regions.js';
import { WORLD_HALF } from './heightfield.js';
import { emitMapMarker } from './mapmarkers.js';
import { emitWakeStamp } from './wakestamps.js';

const MPH = 2.23694;
export const PYTHON_SEGMENT_COUNT = 18;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export const FIELD_DISCOVERIES = Object.freeze([
  Object.freeze({
    id: 'roseate-roost', kind: 'roost', name: '붉은따오기 집단', short: '붉은따오기', region: 'rookery', place: '루커리 레이크',
    color: '#ed91ab', reward: 225, hold: 7, minDistance: 20, maxDistance: 54, maxMph: 4.8,
    hint: '루커리 레이크 · 새벽 또는 황혼의 잔잔한 수면',
    intro: '안쪽 둑에 아홉 마리의 붉은따오기가 앉아 있습니다. 웨이크가 닿지 않게 하세요.',
    success: '성체 일곱 마리와 어린 새 두 마리를 둥지를 흩뜨리지 않고 기록했습니다.',
    rumor: '새벽빛에 서쪽 루커리로 붉은따오기들이 내려앉았습니다. 분홍빛 새를 본다면 웨이크가 닿기 전에 프로펠러를 멈추세요.',
    followup: '조류 팀이 타워 보트 로그에서 아홉 마리를 확인했습니다. 그 둥지에는 어린 새 두 마리가 있었으므로 오늘은 안쪽 둑에서 표본 채집이 금지됩니다.',
  }),
  Object.freeze({
    id: 'tagged-sawfish', kind: 'sawfish', name: '표지 부착 톱니 상어', short: '표지 상어', region: 'mangrove', place: '맹그로브 리치',
    color: '#71c9be', reward: 340, hold: 9, minDistance: 14, maxDistance: 42, maxMph: 6,
    hint: '맹그로브 리치 · 새벽 또는 황혼 무렵의 밀물',
    intro: '수신기가 음향 표지 신호를 잡고 있습니다. 핑을 따라가되 동물에게 충분한 공간을 남기세요.',
    success: '표지, 길이, 이동 위치를 동물에게 다가가지 않고 기록했습니다.',
    rumor: '톱니 상어 수신기가 밀물 때 맹그로브 리치에서 깨어났습니다. 헐거워진 송신기가 아니라 살아있는 표지입니다. 정지 상태로 핑을 따라가세요.',
    followup: '톱니 상어 위치가 3년 전 멕시코 만에서 표지한 암컷과 일치합니다. 생물학자들이 그녀를 다시 육묘수 도감에 올렸습니다.',
  }),
  Object.freeze({
    id: 'python-crossing', kind: 'python', name: '수영하는 버마 왕뱀', short: '왕뱀 횡단', region: 'cypress', place: '사이프러스 리치',
    color: '#c8a56c', reward: 275, hold: 7.5, minDistance: 13, maxDistance: 38, maxMph: 4.5,
    hint: '사이프러스 리치 · 황혼 또는 새벽의 따뜻하고 잔잔한 물',
    intro: '수면에 길고 황갈색의 몸체가 보입니다. 정지 상태로 멀리서, 야외 카메라가 잡을 때까지 프레임 안에 담으세요.',
    success: '사진, 방향, 위치를 FWC에 보냈습니다. 포획 시도는 하지 않았습니다.',
    rumor: '이번 주 사이프러스 리치 수로를 황갈색 왕뱀이 두 번 건넜습니다. 다시 헤엄쳐 나온다면 웨이크를 피해 깨끗한 사진을 찍고 위치를 알려주세요. 손은 보트 안에 두세요.',
    followup: '사진이 깨끗합니다. 외래종 대응팀이 방향과 새로운 수색 구역을 확보했습니다. 손은 보트 안에 두세요.',
  }),
  Object.freeze({
    id: 'logging-skiff', kind: 'wreck', name: '해몬드 벌목 보트', short: '벌목 스키프', region: 'cypress', place: 'Cypress Reach',
    color: '#d6b16d', reward: 180,
    hint: '사이프러스 리치 · 오래된 사이프러스 무릎 아래의 썰물',
    intro: '수위가 낮아져 나무 스키프와 각인된 제조사 명판이 드러났습니다.',
    success: '해몬드 사이프러스 사 14호 선체가 도감에 추가되었습니다.',
    rumor: '사이프러스 무릎 아래로 오래된 알루미늄이 보이고 있습니다. 썰물이 제조사 명판을 드러냈다면 밀물이 다시 가져가기 전에 기록하세요.',
    followup: '그 제조사 번호는 1962년 이후 사라졌던 해몬드 14호 선체에 해당합니다. 카운티 기록 보관소가 드디어 위치를 확보했습니다.',
  }),
]);

const DISCOVERY_BY_ID = new Map(FIELD_DISCOVERIES.map(discovery => [discovery.id, discovery]));

function hourIn(hour, start, end) {
  const h = ((Number(hour) % 24) + 24) % 24;
  return start <= end ? h >= start && h <= end : h >= start || h <= end;
}

export function fieldDiscoveryEligible(discovery, snapshot) {
  const definition = typeof discovery === 'string' ? DISCOVERY_BY_ID.get(discovery) : discovery;
  if (!definition || snapshot.region !== definition.region) return false;
  const storm = Number(snapshot.storm) || 0, rain = Number(snapshot.rain) || 0, wind = Number(snapshot.wind) || 0;
  if (definition.kind === 'roost') {
    const lightWindow = hourIn(snapshot.hour, 5.25, 8.4) || hourIn(snapshot.hour, 17.15, 20.35);
    return lightWindow && storm < 0.34 && rain < 0.42 && wind < 11.5;
  }
  if (definition.kind === 'sawfish') {
    const feedingWindow = hourIn(snapshot.hour, 4.6, 9.5) || hourIn(snapshot.hour, 16.1, 22.15);
    return feedingWindow && Number(snapshot.tideRate) > 0.025 && Number(snapshot.waterLevel) > -0.18 && storm < 0.46 && wind < 14;
  }
  if (definition.kind === 'python') {
    const crossingWindow = hourIn(snapshot.hour, 17.35, 8.15);
    return crossingWindow && storm < 0.36 && rain < 0.48 && wind < 9.5 && Number(snapshot.waterLevel) > -0.3;
  }
  return Number(snapshot.waterLevel) < -0.13 && Number(snapshot.tideRate) < -0.025 && storm < 0.56;
}

export function eligibleFieldDiscoveries(snapshot, found = [], excluded = []) {
  const done = new Set(Array.isArray(found) ? found : []), blocked = new Set(Array.isArray(excluded) ? excluded : []);
  return FIELD_DISCOVERIES.filter(discovery => !done.has(discovery.id) && !blocked.has(discovery.id) && fieldDiscoveryEligible(discovery, snapshot));
}

export function observationStep(discovery, state) {
  const definition = typeof discovery === 'string' ? DISCOVERY_BY_ID.get(discovery) : discovery;
  if (!definition || !definition.hold) return { progress: 0, qualifies: false, complete: false };
  const distance = Number(state.distance), speedMph = Number(state.speedMph), wake = Math.abs(Number(state.wake) || 0), dt = Math.max(0, Number(state.dt) || 0);
  const visible = state.visible !== false;
  const wakeSafe = definition.kind === 'roost' ? wake < 0.018 : definition.kind === 'python' ? wake < 0.024 : true;
  const qualifies = visible && distance >= definition.minDistance && distance <= definition.maxDistance && speedMph <= definition.maxMph && wakeSafe;
  const previous = clamp(Number(state.progress) || 0, 0, definition.hold);
  const progress = clamp(previous + (qualifies ? dt : -dt * 1.35), 0, definition.hold);
  return { progress, qualifies, complete: progress >= definition.hold };
}

function fieldObservationTrunkBlocked(blockers, x, z) {
  const grid = blockers?.trunkGrid;
  if (!grid?.get) return false;
  const cell = Math.max(2, Number(blockers.cell) || 10), cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  for (let offsetX = -1; offsetX <= 1; offsetX++) for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
    const trunks = grid.get(`${cx + offsetX},${cz + offsetZ}`); if (!trunks) continue;
    for (const trunk of trunks) {
      const dx = x - trunk.x, dz = z - trunk.z, clearance = (Number(trunk.r) || 0) + 0.22;
      if (dx * dx + dz * dz < clearance * clearance) return true;
    }
  }
  return false;
}

export function fieldObservationSightline(terrain, waterLevel, fromX, fromZ, toX, toZ, samples = 8, blockers = null) {
  if (!terrain?.heightAt || ![waterLevel, fromX, fromZ, toX, toZ].every(Number.isFinite)) return false;
  const count = Math.max(3, Math.min(18, Math.round(Number(samples) || 8)));
  for (let index = 1; index <= count; index++) {
    const ratio = index / count, x = fromX + (toX - fromX) * ratio, z = fromZ + (toZ - fromZ) * ratio, height = terrain.heightAt(x, z);
    if (!Number.isFinite(height) || height > waterLevel - 0.08 || fieldObservationTrunkBlocked(blockers, x, z)) return false;
  }
  return true;
}

export function ensureDiscoverySave(save) {
  const source = save.discoveries && typeof save.discoveries === 'object' ? save.discoveries : {};
  const found = [...new Set(Array.isArray(source.found) ? source.found.filter(id => DISCOVERY_BY_ID.has(id)) : [])];
  const records = source.records && typeof source.records === 'object' ? source.records : {};
  const missed = source.missed && typeof source.missed === 'object' ? source.missed : {};
  save.discoveries = { found, records, missed };
  return save.discoveries;
}

export function discoverySnapshot(environment, regions) {
  return {
    region: regions?.current?.id || '', hour: Number(environment?.hour) || 0, day: Math.max(1, Number(environment?.day) || 1),
    waterLevel: Number(environment?.waterLevel) || 0, tideRate: Number(environment?.tideRate) || 0,
    storm: Number(environment?.values?.storm) || 0, rain: Number(environment?.values?.rain) || 0, wind: Number(environment?.values?.wind) || 0,
  };
}

function coloredGeometry(geometry, color) {
  const result = geometry.toNonIndexed(), count = result.getAttribute('position').count, values = new Float32Array(count * 3), tint = new THREE.Color(color);
  for (let index = 0; index < count; index++) { values[index * 3] = tint.r; values[index * 3 + 1] = tint.g; values[index * 3 + 2] = tint.b; }
  result.setAttribute('color', new THREE.BufferAttribute(values, 3)); return result;
}

function makeSpoonbillGeometry() {
  const parts = [];
  const add = (geometry, color) => { parts.push(coloredGeometry(geometry, color)); };
  const body = new THREE.SphereGeometry(0.19, 12, 8); body.scale(1, 0.78, 1.8); body.translate(0, 0.72, 0); add(body, 0xdf89a2);
  const wing = new THREE.SphereGeometry(0.17, 10, 7); wing.scale(1.1, 0.43, 1.8); wing.translate(0, 0.77, 0.02); add(wing, 0xf0a8b7);
  const neck = new THREE.CylinderGeometry(0.035, 0.047, 0.52, 7); neck.rotateX(0.44); neck.translate(0, 1.01, -0.18); add(neck, 0xdf89a2);
  const neckTop = new THREE.CylinderGeometry(0.03, 0.035, 0.32, 7); neckTop.rotateX(-0.38); neckTop.translate(0, 1.31, -0.15); add(neckTop, 0xdf89a2);
  const head = new THREE.SphereGeometry(0.065, 9, 7); head.scale(1, 0.86, 1.42); head.translate(0, 1.48, -0.23); add(head, 0xe8b0b4);
  const bill = new THREE.BoxGeometry(0.07, 0.035, 0.5); bill.translate(0, 1.46, -0.51); add(bill, 0x716b68);
  const spoon = new THREE.SphereGeometry(0.07, 8, 6); spoon.scale(0.9, 0.26, 1.45); spoon.translate(0, 1.46, -0.79); add(spoon, 0x716b68);
  for (const x of [-0.055, 0.055]) { const leg = new THREE.CylinderGeometry(0.012, 0.014, 0.72, 5); leg.translate(x, 0.35, 0.04); add(leg, 0x9e6971); }
  const geometry = mergeGeometries(parts, false); geometry.computeBoundingSphere(); return geometry;
}

function makeRoostRig() {
  const root = new THREE.Group(); root.name = '풀링 붉은따오기 군락지'; root.visible = false;
  const birds = [], offsets = [
    [-3.8, -1.1], [-2.3, 1.4], [-0.9, -0.6], [0.8, 1.6], [2.2, -1.3], [3.8, 0.8], [-1.8, -2.5], [1.1, -2.7], [3.1, 2.5],
  ];
  for (let i = 0; i < offsets.length; i++) {
    const [x, z] = offsets[i]; birds.push({ x, z, heading: 0.35 + i * 1.71, scale: 0.92 + (i % 4) * 0.045, flyX: Math.cos(i * 1.37), flyZ: Math.sin(i * 1.37) });
  }
  const mesh = new THREE.InstancedMesh(makeSpoonbillGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88 }), birds.length);
  mesh.name = '9개 인스턴스 붉은따오기'; mesh.castShadow = true; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(mesh);
  return { root, birds, mesh, dummy: new THREE.Object3D() };
}

function triangleGeometry(points) {
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.computeVertexNormals(); return geometry;
}

function makeSawfishRig() {
  const root = new THREE.Group(); root.name = '풀링 태그 부착 톱니 상어'; root.visible = false;
  const hide = new THREE.MeshStandardMaterial({ color: 0x697a78, roughness: 0.75, metalness: 0.06 });
  const fin = new THREE.MeshStandardMaterial({ color: 0x5d6d6b, roughness: 0.82, side: THREE.DoubleSide });
  const tagMaterial = new THREE.MeshStandardMaterial({ color: 0xe27a32, roughness: 0.42, emissive: 0x351305, emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), hide); body.scale.set(1, 0.48, 2.8); root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 8), hide); head.scale.set(1.45, 0.45, 1.25); head.position.set(0, -0.01, -1.15); root.add(head);
  const rostrum = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 1.75), hide); rostrum.position.set(0, -0.01, -2.05); root.add(rostrum);
  const toothPositions = [];
  for (let i = 0; i < 11; i++) {
    const z = -1.27 - i * 0.145, width = 0.12 + i * 0.008;
    toothPositions.push(-0.07, -0.005, z, -width, -0.005, z - 0.035, 0.07, -0.005, z, width, -0.005, z - 0.035);
  }
  const toothGeometry = new THREE.BufferGeometry(); toothGeometry.setAttribute('position', new THREE.Float32BufferAttribute(toothPositions, 3));
  const teeth = new THREE.LineSegments(toothGeometry, new THREE.LineBasicMaterial({ color: 0xc0c5bf, transparent: true, opacity: 0.86 })); root.add(teeth);
  const fins = new THREE.Mesh(triangleGeometry([-0.15, 0, -0.62, -1.1, -0.05, 0.22, -0.2, 0, 0.58, 0.15, 0, -0.62, 1.1, -0.05, 0.22, 0.2, 0, 0.58]), fin); root.add(fins);
  const dorsal = new THREE.Mesh(triangleGeometry([-0.13, 0.02, 0.08, 0, 0.72, 0.42, 0.13, 0.02, 0.65]), fin); root.add(dorsal);
  const tail = new THREE.Group(); tail.position.z = 1.35;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.27, 1.4, 9), hide); stem.rotation.x = Math.PI / 2; stem.position.z = 0.65; tail.add(stem);
  const caudal = new THREE.Mesh(triangleGeometry([0, 0, 1.22, -0.15, 0.02, 0.92, 0, 0.82, 1.55, 0, 0, 1.22, 0.15, 0.02, 0.92, 0, -0.62, 1.52]), fin); tail.add(caudal); root.add(tail);
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), tagMaterial); tag.rotation.z = Math.PI / 2; tag.position.set(0.34, 0.08, 0.12); root.add(tag);
  root.traverse(object => { if (object.isMesh) object.castShadow = true; });
  return { root, tail, tag };
}

function makePythonSegmentGeometry() {
  const geometry = new THREE.SphereGeometry(1, 12, 8).toNonIndexed(), position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3), tan = new THREE.Color(0xa98553), blotch = new THREE.Color(0x3d3424), underside = new THREE.Color(0xcbb78c), color = new THREE.Color();
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const patch = Math.sin(x * 5.7 + z * 3.3) + Math.cos(z * 6.1 - y * 2.8) + Math.sin((x - z) * 4.2);
    color.copy(y < -0.3 ? underside : patch > 0.38 ? blotch : tan);
    colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeBoundingSphere(); return geometry;
}

function makePythonRig() {
  const root = new THREE.Group(); root.name = '풀링 수영 버마 왕뱀'; root.visible = false;
  const mesh = new THREE.InstancedMesh(makePythonSegmentGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.02 }), PYTHON_SEGMENT_COUNT);
  mesh.name = 'one 18-segment instanced Burmese python'; mesh.castShadow = true; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(mesh);
  return { root, mesh, dummy: new THREE.Object3D() };
}

function makeWreckRig() {
  const root = wreck(); root.name = 'pooled Hammond logging skiff'; root.visible = false;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, 0.2), new THREE.MeshStandardMaterial({ color: 0xaa8548, roughness: 0.38, metalness: 0.78, emissive: 0x251704, emissiveIntensity: 0.16 }));
  plate.position.set(-0.08, 0.09, -1.48); plate.rotation.set(0.08, 0.38, 1.24); root.add(plate);
  return { root, plate };
}

function siteDepthAllowed(kind, depth) {
  if (kind === 'sawfish') return depth >= 1.3 && depth <= 4.8;
  if (kind === 'python') return depth >= 0.24 && depth <= 3.2;
  if (kind === 'roost') return depth >= -0.06 && depth <= 0.42;
  return depth >= -0.12 && depth <= 0.34;
}

export function findFieldDiscoverySite(discovery, context, nearby = false, random = Math.random) {
  const definition = typeof discovery === 'string' ? DISCOVERY_BY_ID.get(discovery) : discovery;
  if (!definition) return null;
  const { phys, terrain, world, environment } = context, forward = phys.forward(new THREE.Vector2()), right = phys.right(new THREE.Vector2());
  const min = nearby ? 42 : 105, max = nearby ? 68 : 190, sideMax = nearby ? 44 : 125;
  for (let attempt = 0; attempt < 120; attempt++) {
    const ahead = min + random() * (max - min), side = (random() - 0.5) * sideMax * 2;
    const x = phys.pos.x + forward.x * ahead + right.x * side, z = phys.pos.y + forward.y * ahead + right.y * side;
    if (Math.max(Math.abs(x), Math.abs(z)) > WORLD_HALF - 180 || regionAt(x, z).id !== definition.region || world?.blockedAt(x, z)) continue;
    const ground = terrain.heightAt(x, z), depth = environment.waterLevel - ground;
    if (definition.kind === 'python' && (ground > -1.48 || fieldObservationTrunkBlocked(phys, x, z))) continue;
    if (siteDepthAllowed(definition.kind, depth)) return { x, z, ground, heading: random() * Math.PI * 2 };
  }
  return null;
}

export class FieldDiscoveryDirector {
  constructor(options) {
    Object.assign(this, options); // scene, terrain, world, water, phys, game, audio, environment, regions, life, law, reputation, encounters
    this.store = ensureDiscoverySave(this.game.save); this.active = null; this.next = 38 + Math.random() * 34; this.interact = false; this.prompting = false;
    this.rigs = { 'roseate-roost': makeRoostRig(), 'tagged-sawfish': makeSawfishRig(), 'python-crossing': makePythonRig(), 'logging-skiff': makeWreckRig() };
    for (const rig of Object.values(this.rigs)) this.scene.add(rig.root);
    this.keyHandler = event => {
      if (event.code === 'KeyE' && !event.repeat) this.interact = true;
      if (import.meta.env.DEV && event.code === 'F12' && event.shiftKey && !event.ctrlKey && !event.repeat) {
        event.preventDefault();
        const restoreDebug = restore => {
          this.close(0); this.environment.minutes = restore.minutes; this.environment.minutesPerSecond = restore.minutesPerSecond; this.environment.persistT = restore.environmentPersistT; this.environment.syncClockAndTide();
          if (this.story?.state) { this.story.state.stage = restore.storyStage; this.story.offerT = restore.storyOfferT; }
          this.game.save.cash = restore.cash; this.store.found = restore.found; this.store.records = restore.records; this.store.missed = restore.missed;
          this.game.save.environment = restore.environmentSave;
          if (window.__dbg) { if (restore.freeCam === undefined) delete window.__dbg.freeCam; else window.__dbg.freeCam = restore.freeCam; }
          this.phys.reset(restore.x, restore.z, restore.heading); this.debugRestore = null; this.game.persist();
        };
        if (this.debugRestore) {
          restoreDebug(this.debugRestore); return;
        }
        this.debugRestore = {
          x: this.phys.pos.x, z: this.phys.pos.y, heading: this.phys.heading, minutes: this.environment.minutes, minutesPerSecond: this.environment.minutesPerSecond,
          environmentPersistT: this.environment.persistT, environmentSave: JSON.parse(JSON.stringify(this.game.save.environment || {})),
          storyStage: this.story?.state?.stage || 'dormant', storyOfferT: this.story?.offerT || 0, cash: this.game.save.cash,
          freeCam: window.__dbg?.freeCam,
          found: [...this.store.found], records: JSON.parse(JSON.stringify(this.store.records)), missed: JSON.parse(JSON.stringify(this.store.missed)),
        };
        if (this.story?.state) { this.story.state.stage = 'dormant'; this.story.offerT = 999; }
        this.environment.minutes = (this.environment.day - 1) * 1440 + 18.7 * 60; this.environment.minutesPerSecond = 0; this.environment.persistT = Number.MAX_SAFE_INTEGER; this.environment.syncClockAndTide(); this.phys.reset(-4120.23, -1225.17, 1.9635);
        if (this.start('python-crossing', true, true)) {
          const active = this.active, offsets = [-Math.PI / 2, Math.PI / 2, -1.2, 1.2, -0.85, 0.85]; let boatX = active.x, boatZ = active.z, foundBoat = false;
          outer: for (const distance of [14, 17, 20]) for (const offset of offsets) {
            const bearing = active.heading + offset, candidateX = active.x + Math.sin(bearing) * distance, candidateZ = active.z + Math.cos(bearing) * distance;
            const depth = this.environment.waterLevel - this.terrain.heightAt(candidateX, candidateZ);
            const clear = fieldObservationSightline(this.terrain, this.environment.waterLevel, candidateX, candidateZ, active.x, active.z, Math.ceil(distance / 4), this.phys);
            if (depth > 0.42 && depth < 4.2 && clear && !this.world?.blockedAt(candidateX, candidateZ)) { boatX = candidateX; boatZ = candidateZ; foundBoat = true; break outer; }
          }
          if (!foundBoat) { restoreDebug(this.debugRestore); return; }
          const lookHeading = Math.atan2(-(active.x - boatX), -(active.z - boatZ)); active.debugInspect = true; active.life = 999;
          this.phys.reset(boatX, boatZ, lookHeading); active.distance = Math.hypot(active.x - boatX, active.z - boatZ); active.visible = true; active.sightT = 0.18;
          if (window.__dbg) {
            const centerX = active.x + Math.sin(active.heading) * 1.9, centerZ = active.z + Math.cos(active.heading) * 1.9;
            window.__dbg.freeCam = { x: centerX + Math.cos(active.heading) * 7.2, y: this.environment.waterLevel + 2.45, z: centerZ - Math.sin(active.heading) * 7.2, tx: centerX, ty: this.environment.waterLevel - 0.02, tz: centerZ };
          }
          this.reveal(active); return;
        }
        restoreDebug(this.debugRestore);
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  snapshot() { return discoverySnapshot(this.environment, this.regions); }

  busy() {
    if (this.active?.debugInspect) return false;
    return Boolean(this.game.state || this.game.paused || this.game.resultOpen || this.game.menuOpen || this.game.mapOpen || this.story?.blocking?.() || this.aftermath?.blocking?.()
      || this.encounters?.active || this.incidents?.active || this.law?.pursuit || this.life?.traffic?.activeCollision?.());
  }

  start(id = '', nearby = false, forced = false) {
    if (this.active) this.close(30);
    const snapshot = this.snapshot();
    const failedToday = Object.entries(this.store.missed).filter(([, record]) => Number(record?.day) === snapshot.day).map(([key]) => key);
    const choices = forced && id ? [DISCOVERY_BY_ID.get(id)].filter(Boolean) : eligibleFieldDiscoveries(snapshot, this.store.found, failedToday);
    const definition = id ? choices.find(choice => choice.id === id) : choices[Math.floor(Math.random() * choices.length)];
    if (!definition) { this.next = 34 + Math.random() * 38; return false; }
    const site = findFieldDiscoverySite(definition, this, nearby); if (!site) { this.next = 18 + Math.random() * 18; return false; }
    const rig = this.rigs[definition.id]; rig.root.visible = true;
    const active = this.active = {
      definition, x: site.x, z: site.z, centerX: site.x, centerZ: site.z, ground: site.ground, heading: site.heading,
      state: 'unnoticed', known: false, hold: 0, life: 210, resolveT: 0, pingT: 0.4, spookT: 0, orbit: site.heading, orbitDirection: Math.random() < 0.5 ? -1 : 1,
      desiredHeading: site.heading, turnT: 7 + Math.random() * 6, sightT: 0, visible: false,
    };
    if (definition.kind === 'roost') {
      rig.root.position.set(site.x, Math.max(site.ground, this.environment.waterLevel - 0.08), site.z); rig.root.rotation.y = site.heading;
      this.animateRoost(active, 0, 0);
    } else if (definition.kind === 'wreck') {
      rig.root.position.set(site.x, site.ground + 0.66, site.z); rig.root.rotation.set(0.02, site.heading, 0.04);
    } else if (definition.kind === 'python') this.placePython(active, 0);
    else this.placeSawfish(active, 0);
    const fieldTeam = definition.kind === 'sawfish' || definition.kind === 'python';
    this.radio?.transmit({ channel: fieldTeam ? 'FWC TAC' : 'CH 68', speaker: fieldTeam ? '글레이즈 야외팀' : '마라 킨 · 타워', text: definition.rumor, priority: 1, key: `discovery:rumor:${definition.id}:${snapshot.day}`, cooldown: 99999 });
    return true;
  }

  reveal(active) {
    if (active.known) return;
    active.known = true; active.state = 'observing'; this.game.wpTarget = null;
    this.game.toast(active.definition.name, active.definition.intro, 4.2);
  }

  setPrompt(text) {
    if (this.game.dockCamp || this.game.dockJob || this.game.atBoard) { this.prompting = false; delete this.game.el.prompt.dataset.discovery; return; }
    this.game.el.prompt.innerHTML = `<b>E</b> ${text}`; this.game.el.prompt.classList.add('on'); this.game.el.prompt.dataset.discovery = this.active?.definition.id || '';
    this.prompting = true;
  }

  clearPrompt(preserveGamePrompt = false) {
    if (!this.prompting && !this.game.el.prompt.dataset.discovery) return;
    if (!preserveGamePrompt && this.game.el.prompt.dataset.discovery) this.game.el.prompt.classList.remove('on');
    delete this.game.el.prompt.dataset.discovery; this.prompting = false;
  }

  playerWakeAt(x, z, t) {
    const sample = this.life?.traffic?.playerWakeAt; if (!sample) return 0;
    return Math.max(Math.abs(sample.call(this.life.traffic, x, z, t)), Math.abs(sample.call(this.life.traffic, x, z, t + 0.28)));
  }

  animateRoost(active, dt, t) {
    const rig = this.rigs[active.definition.id], flushed = active.state === 'failed', flight = flushed ? clamp(1 - active.resolveT / 5.5) : 0;
    for (let index = 0; index < rig.birds.length; index++) {
      const bird = rig.birds[index], lift = flight * (2.2 + (index % 3) * 0.55);
      const birdMesh = rig.dummy; birdMesh.position.set(bird.x + bird.flyX * flight * 13, Math.sin(t * 1.4 + index) * 0.018 + lift, bird.z + bird.flyZ * flight * 13);
      birdMesh.rotation.set(flushed ? -0.32 + Math.sin(t * 12 + index) * 0.14 : 0, bird.heading, flushed ? Math.sin(t * 10 + index) * 0.28 : Math.sin(t * 0.8 + index) * 0.018);
      birdMesh.scale.setScalar(bird.scale); birdMesh.updateMatrix(); rig.mesh.setMatrixAt(index, birdMesh.matrix);
    }
    rig.mesh.instanceMatrix.needsUpdate = true;
  }

  placeSawfish(active, t) {
    const rig = this.rigs[active.definition.id], surface = Math.sin(t * 0.42 + active.orbit) * 0.11;
    rig.root.position.set(active.x, this.water.waveHeight(active.x, active.z, t) - 0.53 + surface, active.z);
    rig.root.rotation.set(-0.04 + surface * 0.3, active.heading, Math.sin(t * 0.65) * 0.035);
    rig.tail.rotation.y = Math.sin(t * (active.spookT > 0 ? 8 : 4.2) + active.orbit) * (active.spookT > 0 ? 0.36 : 0.16);
    rig.tag.material.emissiveIntensity = 0.15 + Math.max(0, Math.sin(t * 4)) * 0.28;
  }

  moveSawfish(active, dt, t) {
    const px = this.phys.pos.x, pz = this.phys.pos.y;
    active.spookT = Math.max(0, active.spookT - dt); active.orbit += dt * 0.14 * active.orbitDirection;
    let targetX = active.centerX + Math.cos(active.orbit) * 18, targetZ = active.centerZ + Math.sin(active.orbit) * 13, speed = 0.78;
    if (active.spookT > 0) {
      const dx = active.x - px, dz = active.z - pz, distance = Math.hypot(dx, dz) || 1;
      targetX = active.x + dx / distance * 40; targetZ = active.z + dz / distance * 40; speed = 2.25;
    }
    const targetHeading = Math.atan2(-(targetX - active.x), -(targetZ - active.z));
    active.heading += clamp(angleDelta(active.heading, targetHeading), -dt * 0.85, dt * 0.85);
    const nx = active.x - Math.sin(active.heading) * speed * dt, nz = active.z - Math.cos(active.heading) * speed * dt;
    const depth = this.environment.waterLevel - this.terrain.heightAt(nx, nz);
    if (depth > 1.05 && !this.world?.blockedAt(nx, nz)) { active.x = nx; active.z = nz; }
    else { active.orbitDirection *= -1; active.heading += dt * 1.4; }
    this.placeSawfish(active, t);
  }

  placePython(active, t) {
    const rig = this.rigs[active.definition.id], phase = t * 2.45 + active.orbit;
    const dive = active.state === 'failed' ? clamp(1 - active.resolveT / 5.5) : 0;
    rig.root.position.set(active.x, this.water.waveHeight(active.x, active.z, t) - 0.025 - dive * 1.25, active.z); rig.root.rotation.set(0, active.heading, 0);
    for (let index = 0; index < PYTHON_SEGMENT_COUNT; index++) {
      const along = index / (PYTHON_SEGMENT_COUNT - 1), amplitude = 0.07 + along * 0.24;
      const lateral = Math.sin(phase - index * 0.7) * amplitude, nextLateral = Math.sin(phase - (index + 1) * 0.7) * amplitude;
      const segment = rig.dummy, radius = index === 0 ? 0.205 : 0.18 * (1 - along * 0.68);
      segment.position.set(lateral, -along * 0.022, index * 0.235); segment.rotation.set(0, Math.atan2(nextLateral - lateral, 0.235), Math.sin(phase - index * 0.7) * 0.035);
      segment.scale.set(radius, radius * (index === 0 ? 0.58 : 0.66), index === 0 ? 0.31 : 0.235); segment.updateMatrix(); rig.mesh.setMatrixAt(index, segment.matrix);
    }
    rig.mesh.instanceMatrix.needsUpdate = true;
  }

  movePython(active, dt, t) {
    if (active.debugInspect) { this.placePython(active, t); return; }
    active.turnT -= dt;
    if (active.state === 'failed') {
      const dx = active.x - this.phys.pos.x, dz = active.z - this.phys.pos.y;
      active.desiredHeading = Math.atan2(-dx, -dz);
    } else if (active.turnT <= 0) {
      active.desiredHeading += (Math.random() - 0.5) * 0.78; active.turnT = 7 + Math.random() * 7;
    }
    const turnRate = active.state === 'failed' ? 1.3 : 0.42;
    active.heading += clamp(angleDelta(active.heading, active.desiredHeading), -dt * turnRate, dt * turnRate);
    const speed = active.state === 'failed' ? 1.55 : 0.62, nx = active.x - Math.sin(active.heading) * speed * dt, nz = active.z - Math.cos(active.heading) * speed * dt;
    const depth = this.environment.waterLevel - this.terrain.heightAt(nx, nz);
    if (depth > 0.18 && depth < 4.2 && !this.world?.blockedAt(nx, nz)) { active.x = nx; active.z = nz; }
    else { active.desiredHeading += Math.PI * (0.72 + Math.random() * 0.56); active.turnT = 3.2; }
    this.placePython(active, t);
  }

  complete(active) {
    if (active.state === 'logged') return;
    const definition = active.definition, snapshot = this.snapshot(); active.state = 'logged'; active.resolveT = 6.5; this.clearPrompt();
    if (!this.store.found.includes(definition.id)) this.store.found.push(definition.id);
    this.store.records[definition.id] = {
      day: snapshot.day, hour: Math.round(snapshot.hour * 10) / 10, region: definition.region,
      x: Math.round(active.x), z: Math.round(active.z), weather: this.environment.key,
      waterLevel: Math.round(snapshot.waterLevel * 1000) / 1000, tideRate: Math.round(snapshot.tideRate * 1000) / 1000,
    };
    this.game.addCash(definition.reward); this.game.bounties?.event('discover', 1); this.audio.complete();
    const faction = definition.kind === 'wreck' ? 'locals' : 'fwc';
    const reputation = definition.kind === 'sawfish' ? 0.5 : definition.kind === 'python' ? 0.4 : 0.3;
    this.reputation?.change(faction, reputation, `field-note:${definition.id}`, definition.success, false);
    this.game.toast(definition.name, `${definition.success} · +$${definition.reward}`, 5.2);
    this.radio?.transmit({ channel: definition.kind === 'wreck' ? 'CH 68' : 'FWC TAC', speaker: definition.kind === 'wreck' ? 'MARA KEENE · TOWER' : 'GLADES FIELD TEAM', text: definition.followup, priority: 2, key: `discovery:logged:${definition.id}`, cooldown: 99999 });
    this.game.persist();
  }

  fail(active, reason, strike = false) {
    if (active.state === 'failed') return;
    active.state = 'failed'; active.resolveT = 5.5; active.hold = 0; this.clearPrompt();
    const previous = this.store.missed[active.definition.id] || {};
    this.store.missed[active.definition.id] = { day: this.environment.day, count: Math.min(99, (Number(previous.count) || 0) + 1) };
    if (strike) {
      this.law?.violation(0.62, '보호 상어 충돌');
      this.reputation?.change('fwc', -0.7, 'sawfish-strike', 'The field team logged the tower hull after a protected-animal strike.', false);
      this.audio.thud(1.1);
    } else if (active.definition.kind === 'python') this.audio.splash(0.22);
    else this.audio.squawk(0.45, active.x, active.z);
    this.game.toast(active.definition.name, reason, 4.2); this.game.persist();
  }

  updateRoost(active, dt, t) {
    this.animateRoost(active, dt, t);
    const distance = Math.hypot(active.x - this.phys.pos.x, active.z - this.phys.pos.y), speedMph = this.phys.speed * MPH, wake = this.playerWakeAt(active.x, active.z, t);
    active.distance = distance; active.wake = wake; if (distance < 96) this.reveal(active);
    if (!active.known) return;
    if ((wake > 0.026 && distance < 78) || (distance < 11 && speedMph > 7)) { this.fail(active, '웨이크가 먼저 둑에 닿았습니다. 둥지의 새들이 호수 위로 흩어졌습니다.'); return; }
    const step = observationStep(active.definition, { distance, speedMph, wake, dt, progress: active.hold }); active.hold = step.progress;
    if (step.complete) this.complete(active);
  }

  updateSawfish(active, dt, t) {
    this.moveSawfish(active, dt, t);
    const distance = Math.hypot(active.x - this.phys.pos.x, active.z - this.phys.pos.y), speedMph = this.phys.speed * MPH;
    active.distance = distance; active.pingT -= dt;
    if (active.pingT <= 0 && distance < 240) {
      const closeness = 1 - clamp((distance - 12) / 228); this.audio.tagPing?.(0.06 + closeness * 0.24, closeness);
      active.pingT = 0.65 + (1 - closeness) * 2.8;
    }
    if (distance < 138) this.reveal(active); if (!active.known) return;
    if (distance < 3.4 && speedMph > 6) { this.fail(active, '선체가 동물을 가로질렀습니다. FWC가 보호종 충돌을 기록했습니다.', true); return; }
    if (distance < 13 && speedMph > 7.5) { active.spookT = Math.max(active.spookT, 5.5); active.hold = 0; }
    const step = observationStep(active.definition, { distance, speedMph, dt, progress: active.hold }); active.hold = step.progress;
    if (step.complete) this.complete(active);
  }

  updatePython(active, dt, t) {
    this.movePython(active, dt, t);
    const distance = Math.hypot(active.x - this.phys.pos.x, active.z - this.phys.pos.y), speedMph = this.phys.speed * MPH, wake = this.playerWakeAt(active.x, active.z, t);
    active.distance = distance; active.wake = wake; active.sightT -= dt;
    if (active.sightT <= 0) {
      active.visible = fieldObservationSightline(this.terrain, this.environment.waterLevel, this.phys.pos.x, this.phys.pos.y, active.x, active.z, Math.ceil(Math.min(distance, 85) / 5), this.phys);
      active.sightT = distance < 112 ? 0.18 : 0.42;
    }
    if (distance < 112 && active.visible) this.reveal(active); if (!active.known) return;
    if ((wake > 0.034 && distance < 58) || (distance < 8 && speedMph > 5.5)) { this.fail(active, '프로펠러 워시가 수면 자국을 깨뜨렸습니다. 왕뱀이 탄닌 아래로 잠수해 사라졌습니다.'); return; }
    const step = observationStep(active.definition, { distance, speedMph, wake, visible: active.visible, dt, progress: active.hold }); active.hold = step.progress;
    if (active.debugInspect) { active.hold = Math.min(active.hold, active.definition.hold * 0.62); return; }
    if (step.complete) this.complete(active);
  }

  updateWreck(active) {
    const distance = Math.hypot(active.x - this.phys.pos.x, active.z - this.phys.pos.y), speedMph = this.phys.speed * MPH; active.distance = distance;
    if (distance < 78) this.reveal(active); if (!active.known) return;
    if (this.environment.waterLevel > -0.025) { this.game.toast('홍수가 명판을 덮었습니다', '이 잔해는 다음 썰물에 다시 모습을 보일 것입니다.', 3.4); this.close(120); return; }
    if (distance < 14) {
      if (speedMph <= 4.5) { this.setPrompt("스키프의 제조사 명판을 기록"); if (this.interact) this.complete(active); }
      else this.setPrompt('4.5 mph 이하로 정지해 명판을 읽으세요');
    } else this.clearPrompt(this.game.dockCamp || this.game.dockJob || this.game.atBoard);
  }

  updateActive(dt, t) {
    const active = this.active; if (!active) return;
    if (active.state === 'logged' || active.state === 'failed') {
      if (active.definition.kind === 'roost') this.animateRoost(active, dt, t);
      else if (active.definition.kind === 'sawfish') this.moveSawfish(active, dt, t);
      else if (active.definition.kind === 'python') this.movePython(active, dt, t);
      active.resolveT -= dt; if (active.resolveT <= 0) this.close(active.state === 'logged' ? 110 : 150); return;
    }
    active.life -= dt;
    if (active.life <= 0 || Math.hypot(active.x - this.phys.pos.x, active.z - this.phys.pos.y) > 760) {
      if (active.known) this.game.toast('야외 신호 상실', '관찰이 끝나기 전에 물이 흘러갔습니다.', 3.2);
      this.close(100); return;
    }
    if (active.definition.kind === 'roost') this.updateRoost(active, dt, t);
    else if (active.definition.kind === 'sawfish') this.updateSawfish(active, dt, t);
    else if (active.definition.kind === 'python') this.updatePython(active, dt, t);
    else this.updateWreck(active, dt, t);
  }

  close(cooldown = 80) {
    this.clearPrompt(this.game.dockCamp || this.game.dockJob || this.game.atBoard);
    for (const rig of Object.values(this.rigs)) rig.root.visible = false;
    this.active = null; this.next = cooldown + Math.random() * 38;
  }

  hud() {
    const active = this.active; if (!active?.known || this.busy()) return null;
    if (active.state === 'logged') return { title: '야외 기록 완료', obj: active.definition.name, sub: active.definition.success };
    if (active.state === 'failed') return { title: '야외 관찰 실패', obj: active.definition.name, sub: '같은 조건이 다른 날 다시 올 수도 있습니다.' };
    if (active.definition.kind === 'wreck') return { title: '저수위 야외 기록', obj: active.distance < 14 ? '정지해 옆에 붙어 제조사 명판을 읽으세요' : '홍수가 덮기 전에 가까이서 작업', sub: '명판은 잔해에 그대로 남아 있습니다. 선체 번호를 도감에 기록하세요.' };
    const percent = Math.round(active.hold / active.definition.hold * 100), inRange = active.distance >= active.definition.minDistance && active.distance <= active.definition.maxDistance;
    if (active.definition.kind === 'roost') return { title: '붉은따오기 둥지', obj: `관찰 진행 · ${percent}%`, sub: inRange ? '4.8 mph 이하로 유지하고 웨이크가 둑에 닿지 않게 하세요' : '새들로부터 20~54 m 거리 유지' };
    if (active.definition.kind === 'python') return { title: '왕뱀 횡단', obj: `사진 촬영 · ${percent}%`, sub: !active.visible ? '둑이 카메라를 가립니다. 같은 수로로 다가가세요.' : inRange ? '4.5 mph 이하로 유지하고 웨이크를 선체 뒤에 두세요' : '13~38 m 거리 유지. 포획을 시도하지 마세요.' };
    return { title: '표지 부착 톱니 상어', obj: `수신기 측정 · ${percent}%`, sub: active.spookT > 0 ? '동물이 놀랐습니다. 거리를 벌리고 프로펠러를 낮추세요.' : inRange ? '수신기가 태그를 잡을 때까지 6 mph 이하' : '14~42 m에서 핑을 추적하세요' };
  }

  stamps(out) {
    const active = this.active; if (!active || active.definition.kind !== 'python' || active.state === 'failed') return 0;
    const trailX = active.x + Math.sin(active.heading) * 1.55, trailZ = active.z + Math.cos(active.heading) * 1.55;
    return emitWakeStamp(out, trailX, trailZ, 0.92, -0.11, 0.16, 1.05) ? 1 : 0;
  }

  markers() {
    const markers = [];
    for (const definition of FIELD_DISCOVERIES) {
      const record = this.store.records[definition.id];
      if (this.store.found.includes(definition.id) && Number.isFinite(record?.x) && Number.isFinite(record?.z)) markers.push({ x: record.x, z: record.z, label: definition.short, color: definition.color, found: true });
    }
    const active = this.active;
    if (active?.known && !this.store.found.includes(active.definition.id)) markers.push({ x: active.x, z: active.z, label: active.definition.short, color: active.definition.color, live: true });
    return markers;
  }

  menuEntries() {
    return FIELD_DISCOVERIES.map(definition => {
      const record = this.store.records[definition.id], found = this.store.found.includes(definition.id);
      return { ...definition, found, record: found ? record : null };
    });
  }

  update(dt, t, enabled = true) {
    const pressed = this.interact; this.interact = false;
    if (!enabled) { this.clearPrompt(this.game.dockCamp || this.game.dockJob || this.game.atBoard); return; }
    this.interact = pressed;
    if (this.active) {
      if (!this.busy()) this.updateActive(dt, t);
      else {
        if (this.active.definition.kind === 'roost') this.animateRoost(this.active, dt, t);
        else if (this.active.definition.kind === 'sawfish') this.moveSawfish(this.active, dt, t);
        else if (this.active.definition.kind === 'python') this.movePython(this.active, dt, t);
        this.clearPrompt(this.game.dockCamp || this.game.dockJob || this.game.atBoard);
      }
      const active = this.active;
      if (active?.known && Math.hypot(active.x - this.phys.pos.x, active.z - this.phys.pos.y) < 900) emitMapMarker(this.game, active.x, active.z, 'dot', active.definition.color);
      this.interact = false; return;
    }
    if (this.busy()) return;
    this.next -= dt; if (this.next > 0) return;
    this.start();
  }

  resourceStats() {
    const geometries = new Set(), materials = new Set(); let objects = 0;
    for (const rig of Object.values(this.rigs)) rig.root.traverse(object => {
      objects++; if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material)); else if (object.material) materials.add(object.material);
    });
    return { rigs: Object.keys(this.rigs).length, objects, geometries: geometries.size, materials: materials.size, active: this.active?.definition.id || '' };
  }
}
