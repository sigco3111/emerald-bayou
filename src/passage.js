import * as THREE from 'three';
import { buildSkiff } from './npc.js';
import { regionAt } from './regions.js';
import { emitWakeStamp } from './wakestamps.js';
import { emitMapMarker } from './mapmarkers.js';
import { wakeSampleAt } from './wakefield.js';

const MPH = 2.23694;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const PASSAGE_COORDS = {
  wreck: { x: -4120.231362133571, z: -1225.1721411512312, heading: 1.9634954084936207, region: 'cypress' },
  aid: { x: -5955.010777408952, z: -1666.495293931879, heading: 1.1780972450961724, region: 'cypress' },
  cache: { x: 3494.2398245425384, z: -4557.591286691637, heading: 0, region: 'mangrove' },
};

function recolor(group, color) {
  let done = false;
  group.traverse(o => {
    if (done || !o.isMesh || !o.material?.color || o.material.metalness < 0.45) return;
    o.material = o.material.clone(); o.material.color.setHex(color); done = true;
  });
}

function signal(parent, color, x, y, z, range = 48) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 9, 7), mat);
  const light = new THREE.PointLight(color, 0, range, 2); g.add(bulb, light); parent.add(g);
  return { group: g, bulb, light, mat };
}

function medicalCooler() {
  const g = new THREE.Group(); g.name = '밀봉 의료용 콜러';
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x24708d, roughness: 0.62, metalness: 0.05 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0xe5e2d5, roughness: 0.7, metalness: 0.02 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x182320, roughness: 0.78, metalness: 0.18 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3efe2, roughness: 0.62 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.48, 0.58), bodyMat); body.position.y = 0.02; g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.13, 0.64), lidMat); lid.position.y = 0.325; g.add(lid);
  for (const x of [-0.3, 0.3]) { const latch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.045), dark); latch.position.set(x, 0.08, 0.31); g.add(latch); }
  for (const z of [-0.296, 0.296]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.085, 0.018), white); a.position.set(0, 0.03, z); g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.28, 0.018), white); b.position.set(0, 0.03, z); g.add(b);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function injuredCourier() {
  const g = new THREE.Group(); g.name = 'Nolan Pike';
  const skin = new THREE.MeshStandardMaterial({ color: 0xaa7859, roughness: 0.86 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x5a665f, roughness: 0.92 });
  const vest = new THREE.MeshStandardMaterial({ color: 0xe46c25, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x242a29, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.46, 4, 8), shirt); torso.position.y = 0.47; torso.rotation.z = -0.18; g.add(torso);
  const vestFront = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.38, 0.16), vest); vestFront.position.set(0, 0.48, -0.11); vestFront.rotation.z = -0.18; g.add(vestFront);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), skin); head.position.set(-0.08, 0.86, 0); g.add(head);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.34, 4, 6), pants); leg.position.set(sx * 0.12, 0.16, -0.18); leg.rotation.x = -1.1; g.add(leg);
  }
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 4, 6), skin); arm.position.set(0.27, 0.63, -0.02); arm.rotation.z = -0.9; g.add(arm); g.userData.waveArm = arm;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}

export class FalsePassage {
  constructor(parent) {
    this.P = parent;
    const saved = parent.state.passage || {};
    this.state = parent.state.passage = {
      stage: saved.stage || 'dormant', branch: saved.branch || '', ending: saved.ending || '', approached: Boolean(saved.approached),
      offerAt: Number(saved.offerAt) || 0, retryAt: Number(saved.retryAt) || 0, completedAt: Number(saved.completedAt) || 0,
      consequenceAt: Number(saved.consequenceAt) || 0, consequence: Boolean(saved.consequence), cargoUntil: Number(saved.cargoUntil) || 0,
      routeBand: Math.max(0, Math.min(2, Number(saved.routeBand) || 0)), chaseStarted: Boolean(saved.chaseStarted), chaseCleared: Boolean(saved.chaseCleared),
      coolerX: Number(saved.coolerX), coolerZ: Number(saved.coolerZ), coords: saved.coords || null,
    };
    // These berths were validated against terrain, settlements, jobs, and deep-water
    // clearance. Keep them deterministic so a new game does not search the whole map.
    if (!this.state.coords || this.state.coords.cache?.region !== 'mangrove') this.state.coords = this.makeCoords();
    const C = this.state.coords;
    if (!Number.isFinite(this.state.coolerX)) this.state.coolerX = C.wreck.x + Math.cos(C.wreck.heading + 0.85) * 7;
    if (!Number.isFinite(this.state.coolerZ)) this.state.coolerZ = C.wreck.z + Math.sin(C.wreck.heading + 0.85) * 7;
    this.choiceT = 0; this.routeStart = 0; this.routeBand = this.state.routeBand; this.persistT = 5; this.enabled = false;
    this.chaseActive = false; this.chaseDelay = 0; this.chasePressure = 0; this.lostT = 0; this.hitCd = 0;
    this._flow = new THREE.Vector2(); this._f = new THREE.Vector2(); this._r = new THREE.Vector2();
    this.obs = []; this.P.phys.addObs('story-false-passage', this.obs);
    this.wreckObs = { ax: 0, az: 0, bx: 0, bz: 0, r: 1.08, tag: 'courier wreck' };
    this.recipientObs = { ax: 0, az: 0, bx: 0, bz: 0, r: 1.05, tag: 'work skiff' };
    this.coolerObs = { x: 0, z: 0, r: 0.78, tag: 'medical cooler' };
    this.chaserObs = { ax: 0, az: 0, bx: 0, bz: 0, r: 1.08, tag: 'pursuing skiff', onHit: (into, nx, nz) => this.chaserHit(into, nx, nz) };
    this.rigs = this.makeRigs();
    this.P.scene.add(this.rigs.wreck, this.rigs.aid, this.rigs.cache, this.rigs.runner, this.rigs.patrol, this.rigs.cooler);
    this.agent = { mesh: this.rigs.runner, active: false };
    this.obLevel = 0; this.obPitch = 0.92; this.obX = 0; this.obZ = 0;
    if (this.eligible() && !this.state.offerAt && this.state.stage === 'dormant') this.arm(60000);
    this.restore(); this.persist();
  }

  makeCoords() {
    return {
      wreck: { ...PASSAGE_COORDS.wreck },
      aid: { ...PASSAGE_COORDS.aid },
      cache: { ...PASSAGE_COORDS.cache },
    };
  }

  makeRigs() {
    const wreck = buildSkiff({ crew: false }); recolor(wreck, 0x77858b); wreck.visible = false;
    if (wreck.userData.motor) wreck.userData.motor.rotation.x = -0.62;
    const survivor = injuredCourier(); survivor.position.set(-0.12, 0.55, -0.45); survivor.rotation.y = Math.PI; wreck.add(survivor);
    const strobe = signal(wreck, 0xff6a35, -0.32, 1.2, -0.1, 62);
    const aid = buildSkiff({ crew: true }); recolor(aid, 0x416b79); aid.visible = false; const aidLamp = signal(aid, 0xf5df9c, 0, 1.3, -0.2, 56);
    const cache = buildSkiff({ crew: true }); recolor(cache, 0x392d28); cache.visible = false; const cacheLamp = signal(cache, 0x4f8fff, 0, 1.3, -0.2, 58);
    const runner = buildSkiff({ crew: true }); recolor(runner, 0x34251f); runner.visible = false; const runnerLamp = signal(runner, 0xe79735, 0, 1.25, -0.2, 46);
    const patrol = buildSkiff({ crew: true }); recolor(patrol, 0x315e50); patrol.visible = false;
    const blue = signal(patrol, 0x327eff, -0.26, 1.35, -0.2, 54), red = signal(patrol, 0xff372b, 0.26, 1.35, -0.2, 54);
    const cooler = medicalCooler(); cooler.visible = false;
    return { wreck, survivor, strobe, aid, aidLamp, cache, cacheLamp, runner, runnerLamp, patrol, blue, red, cooler };
  }

  persist() { this.P.persist(); }
  eligible() { return this.P.state.stage === 'complete' && this.P.state.consequence; }
  busy() { return ['search', 'choice', 'delivery'].includes(this.state.stage); }
  blocking() { return this.busy(); }

  arm(delay = 75000) {
    if (this.state.stage !== 'dormant' || this.state.offerAt) return;
    this.state.offerAt = Date.now() + delay; this.persist();
  }

  hideRigs() {
    for (const m of [this.rigs.wreck, this.rigs.aid, this.rigs.cache, this.rigs.runner, this.rigs.patrol, this.rigs.cooler]) m.visible = false;
    this.rigs.survivor.visible = false; this.rigs.strobe.light.intensity = this.rigs.aidLamp.light.intensity = this.rigs.cacheLamp.light.intensity = 0;
    this.rigs.runnerLamp.light.intensity = this.rigs.blue.light.intensity = this.rigs.red.light.intensity = 0;
  }

  restore() {
    this.hideRigs(); this.stopChaser(false, false);
    const s = this.state.stage;
    if (['search', 'choice', 'delivery'].includes(s)) {
      this.rigs.wreck.visible = true; this.rigs.survivor.visible = true;
      if (s === 'search' || s === 'choice') {
        this.P.scene.add(this.rigs.cooler); this.rigs.cooler.visible = true;
        this.rigs.wreck.add(this.rigs.survivor); this.rigs.survivor.position.set(-0.12, 0.55, -0.45); this.rigs.survivor.rotation.set(0, Math.PI, 0);
      }
      else {
        this.P.boat.add(this.rigs.cooler); this.rigs.cooler.position.set(0.68, 0.72, -1.25); this.rigs.cooler.rotation.set(0.02, 0.12, -0.02); this.rigs.cooler.visible = true;
        if (this.state.branch === 'rescue') { this.P.boat.add(this.rigs.survivor); this.rigs.survivor.position.set(-0.48, 0.58, -0.28); this.rigs.survivor.rotation.set(0, -0.35, 0); }
        else { this.rigs.wreck.add(this.rigs.survivor); this.rigs.survivor.position.set(-0.12, 0.55, -0.45); this.rigs.survivor.rotation.set(0, Math.PI, 0); }
        this.P.phys.loaded = Math.max(this.P.phys.loaded, this.state.branch === 'rescue' ? 0.34 : 0.22);
        const d = this.destination(); this.routeStart = Math.max(1, Math.hypot(d.x - this.P.phys.pos.x, d.z - this.P.phys.pos.y)); this.routeBand = this.state.routeBand;
        this.rigs.aid.visible = this.state.branch === 'rescue'; this.rigs.cache.visible = this.state.branch === 'runner';
        if (this.state.branch === 'runner') {
          const remaining = Math.max(0, (this.state.cargoUntil - Date.now()) / 1000);
          if (remaining > 0) { this.P.law.hotCargoT = Math.max(this.P.law.hotCargoT, remaining); this.P.law.attention = Math.max(this.P.law.attention, 1.35); this.P.law.lastReason = '도난 의료용 화물 신고 접수'; }
        }
        if (this.state.chaseStarted && !this.state.chaseCleared) this.chaseDelay = 2.5;
      }
    } else if (s === 'complete' && this.state.ending === 'rescue') {
      this.rigs.aid.add(this.rigs.cooler); this.rigs.cooler.position.set(0.48, 0.7, -1.0); this.rigs.cooler.rotation.set(0, -0.18, 0);
      this.rigs.aid.add(this.rigs.survivor); this.rigs.survivor.position.set(-0.42, 0.56, -0.3); this.rigs.survivor.rotation.set(0, 0.2, 0);
    } else if (s === 'complete' && this.state.ending === 'runner') {
      this.P.rigs.lostKey.add(this.rigs.cooler); this.rigs.cooler.position.set(-0.48, 0.7, -1.02); this.rigs.cooler.rotation.set(0, -0.15, 0);
      this.rigs.wreck.add(this.rigs.survivor); this.rigs.survivor.position.set(-0.12, 0.55, -0.45); this.rigs.survivor.rotation.set(0, Math.PI, 0);
    }
  }

  offer(force = false) {
    if (!this.eligible() || !['dormant', 'failed'].includes(this.state.stage)) return false;
    if (!force && (Date.now() < this.state.offerAt || this.P.game.state || this.P.encounters.active || this.P.incidents.active || this.P.environment.values.storm > 0.94)) return false;
    const C = this.state.coords.wreck;
    Object.assign(this.state, {
      stage: 'search', branch: '', ending: '', approached: false, retryAt: 0, completedAt: 0, consequenceAt: 0, consequence: false,
      cargoUntil: 0, routeBand: 0, chaseStarted: false, chaseCleared: false,
      coolerX: C.x + Math.cos(C.heading + 0.85) * 7, coolerZ: C.z + Math.sin(C.heading + 0.85) * 7,
    });
    this.routeBand = 0; this.choiceT = 0; this.restore(); this.persist();
    if (this.P.state.ending === 'runner') {
      this.P.call('CH 16', 'MARA KEENE · TOWER', 'West Cut의 잘못된 빨간 표지 때문에 클리닉 배달원이 사이프러스에 빠졌습니다. Nolan Pike가 기한을 넘겼고, 제가 왜 이 선체를 호출하는지 아실 겁니다.', 4, 'passage-offer-runner');
    } else {
      this.P.call('CH 68', 'LEON DOSS · OLD MILL', '제가 West Cut 케이지를 다시 설치한 후 누군가 잘랐습니다. 클리닉 배달원이 등대 아래 어딘가에 부딪혔고, Nolan Pike는 그 후로 응답이 없습니다.', 4, 'passage-offer-local');
    }
    this.P.call('CH 16', 'MARA KEENE · TOWER', '마지막 캐리어는 표지 서쪽. 흰 스키프, 파란 의료용 콜러, 1명 탑승.', 3, 'passage-fix');
    this.P.game.toast('잘못된 항로', 'West Cut에서 클리닉 배달원 실종.', 3.4); return true;
  }

  destination() { return this.state.branch === 'runner' ? this.state.coords.cache : this.state.coords.aid; }

  marker() {
    const s = this.state.stage, C = this.state.coords;
    if (s === 'search' || s === 'choice') return { ...(this.state.approached ? { x: this.state.coolerX, z: this.state.coolerZ } : { x: C.wreck.x + 55, z: C.wreck.z - 35 }), color: '#e6d07a', label: this.state.approached ? 'Nolan의 의료용 콜러' : '배달원의 마지막 캐리어', story: true };
    if (s === 'delivery') { const d = this.destination(); return { x: d.x, z: d.z, color: this.state.branch === 'runner' ? '#5b8fff' : '#f0d989', label: this.state.branch === 'runner' ? 'Cal의 차단점' : 'Split Pine 구조 보트', story: true }; }
    return null;
  }

  hud() {
    if (!this.busy()) return null;
    const s = this.state.stage, m = this.marker();
    if (s === 'search') return { title: '잘못된 항로', obj: '클리닉 배달원을 찾아라', sub: `${regionAt(m.x, m.z).name} · West Cut에서 마지막 캐리어` };
    if (s === 'choice') return { title: '잘못된 항로', obj: 'Nolan은 부상당했습니다. 콜러는 밀봉되어 있습니다.', sub: 'E · 둘 다 태워라  ·  F · Cal을 위해 콜러만 가져가라' };
    const d = this.destination(); return { title: '잘못된 항로', obj: this.state.branch === 'runner' ? '콜러를 Cal의 차단점에 전달하라' : 'Nolan을 Split Pine 구조 보트로 보내라', sub: `${regionAt(d.x, d.z).name} · 6 mph 이하로 도착` };
  }

  menuLine() {
    const s = this.state;
    if (s.stage === 'dormant') return this.eligible() ? '잘못된 항로 · 무전 대기 중' : '잘못된 항로 · 잠김';
    if (s.stage === 'search') return '잘못된 항로 · 클리닉 배달원 찾기';
    if (s.stage === 'choice') return '잘못된 항로 · Nolan 발견';
    if (s.stage === 'delivery') return `잘못된 항로 · ${s.branch === 'runner' ? 'Cal의 차단점' : 'Split Pine'}행`;
    if (s.stage === 'failed') return '잘못된 항로 · 재정비 중';
    return `잘못된 항로 · ${s.ending === 'runner' ? '콜러 매각' : 'Nolan 구조'}`;
  }

  updateCooler(dt, t) {
    const C = this.state.coords.wreck, f = this.P.currents.flowAt(this.state.coolerX, this.state.coolerZ, this._flow);
    this.state.coolerX += f.x * dt * 0.72; this.state.coolerZ += f.y * dt * 0.72;
    const dx = C.x - this.state.coolerX, dz = C.z - this.state.coolerZ, d = Math.hypot(dx, dz);
    if (d > 18) { this.state.coolerX += dx / d * (d - 18) * dt * 0.65; this.state.coolerZ += dz / d * (d - 18) * dt * 0.65; }
    const q = this.rigs.cooler; q.position.set(this.state.coolerX, this.P.water.waveHeight(this.state.coolerX, this.state.coolerZ, t) - 0.02, this.state.coolerZ);
    q.rotation.set(Math.sin(t * 0.8) * 0.1, C.heading - 0.35, Math.cos(t * 0.92) * 0.13);
    this.persistT -= dt; if (this.persistT <= 0) { this.persistT = 5; this.persist(); }
  }

  placeWreck(t) {
    this.P.placeBoat(this.rigs.wreck, this.state.coords.wreck, t, 0.11);
    const a = this.rigs.survivor.userData.waveArm; if (a) a.rotation.z = -0.8 - Math.sin(t * 3.1) * 0.5;
  }

  updateSearch(dt, t) {
    this.updateCooler(dt, t); this.placeWreck(t);
    const d = Math.min(Math.hypot(this.state.coolerX - this.P.phys.pos.x, this.state.coolerZ - this.P.phys.pos.y), Math.hypot(this.state.coords.wreck.x - this.P.phys.pos.x, this.state.coords.wreck.z - this.P.phys.pos.y));
    if (!this.state.approached && d < 135) {
      this.state.approached = true; this.state.stage = 'choice'; this.choiceT = 0; this.persist();
      this.P.call('CH 16', 'NOLAN PIKE · 클리닉 배달원', '타워 보트, 아직 여기 있습니다. 어깨가 심합니다. 스키프가 갈라졌을 때 콜러가 빠졌습니다.', 4, 'passage-nolan');
      this.P.call('CH 72', 'CAL ROOK · LOST KEY', '파란 콜러는 밀봉된 채로 내게로 와야 합니다. 배달원은 16번에 그대로 두세요. 9백, 순찰선에 안 걸리면 2백 추가.', 3, 'passage-cal-offer');
      this.P.game.toast('Nolan Pike 발견', '부상을 입었습니다. 의료용 콜러가 물 위에 있습니다.', 3.2);
    }
    const m = this.marker(); this.P.game.wpTarget = m ? { ...m } : null;
  }

  updateChoice(dt, t) {
    this.choiceT += dt; this.updateCooler(dt, t); this.placeWreck(t);
    const d = Math.hypot(this.state.coolerX - this.P.phys.pos.x, this.state.coolerZ - this.P.phys.pos.y), m = this.marker(); this.P.game.wpTarget = m ? { ...m } : null;
    if (this.choiceT > 1.15 && d < 12 && this.P.phys.speed * MPH < 6 && this.P.canInteract()) {
      this.P.setPrompt('<b>E</b> Nolan과 콜러를 모두 태워라 <i>· F Cal을 위해 콜러만 가져가라</i>');
      if (this.P.interact) this.choose('rescue'); else if (this.P.alternate) this.choose('runner');
    } else this.P.clearPrompt();
  }

  choose(branch) {
    if (this.state.stage !== 'choice') return;
    this.state.stage = 'delivery'; this.state.branch = branch; this.state.routeBand = this.routeBand = 0; this.state.chaseStarted = false; this.state.chaseCleared = false;
    this.P.boat.add(this.rigs.cooler); this.rigs.cooler.position.set(0.68, 0.72, -1.25); this.rigs.cooler.rotation.set(0.02, 0.12, -0.02); this.rigs.cooler.visible = true;
    if (branch === 'rescue') {
      this.P.boat.add(this.rigs.survivor); this.rigs.survivor.position.set(-0.48, 0.58, -0.28); this.rigs.survivor.rotation.set(0, -0.35, 0); this.state.cargoUntil = 0; this.P.phys.loaded = Math.max(this.P.phys.loaded, 0.34);
      this.rigs.aid.visible = true; this.rigs.cache.visible = false;
      this.P.call('CH 68', 'JUNE BELL · SPLIT PINE', 'Nolan을 파란 구조 스키프로 데려오세요. 의료진과 마른 정박지가 대기 중입니다. Cal 때문에 멈추지 마세요.', 4, 'passage-rescue-start');
      this.P.game.toast('Nolan 탑승', 'Split Pine에 의료진이 대기 중입니다.', 3);
    } else {
      this.rigs.wreck.add(this.rigs.survivor); this.rigs.survivor.position.set(-0.12, 0.55, -0.45); this.rigs.survivor.rotation.set(0, Math.PI, 0); this.state.cargoUntil = Date.now() + 220000; this.P.phys.loaded = Math.max(this.P.phys.loaded, 0.22);
      this.rigs.aid.visible = false; this.rigs.cache.visible = true; this.P.law.addContraband();
      this.P.call('CH 72', 'CAL ROOK · LOST KEY', '차단점은 파란 불 하나, 독은 없습니다. 콜러를 닫은 채로 유지하세요. Soto가 이미 배달원에 대해 물어보고 있습니다.', 4, 'passage-runner-start');
      this.P.game.toast('콜러 탑승', 'Nolan은 여전히 잔해 위에 있습니다. FWC가 호출을 들었습니다.', 3);
    }
    const d = this.destination(); this.routeStart = Math.max(1, Math.hypot(d.x - this.P.phys.pos.x, d.z - this.P.phys.pos.y)); this.P.clearPrompt(); this.persist();
  }

  chaserSpawn() {
    const p = this.P.phys, f = p.forward(this._f), r = p.right(this._r);
    for (const behind of [78, 96, 116]) for (const side of [-34, 34, 0]) {
      const x = p.pos.x - f.x * behind + r.x * side, z = p.pos.y - f.y * behind + r.y * side;
      const depth = this.P.water.level - this.P.terrain.heightAt(x, z);
      if (depth > 0.72 && depth < 6.3 && !this.P.world.blockedAt(x, z)) return { x, z, heading: Math.atan2(-(p.pos.x - x), -(p.pos.y - z)) };
    }
    return this.P.encounters.spot(75, 110, 35);
  }

  spawnChaser() {
    if (this.chaseActive || this.state.stage !== 'delivery') return false;
    const at = this.chaserSpawn(); if (!at) { this.chaseDelay = 2; return false; }
    const patrol = this.state.branch === 'runner', mesh = patrol ? this.rigs.patrol : this.rigs.runner;
    this.rigs.runner.visible = !patrol; this.rigs.patrol.visible = patrol; this.agent.mesh = mesh; this.agent.navigationLights = patrol;
    this.P.incidents.setAgent(this.agent, at.x, at.z, at.heading, 3.2); this.chaseActive = true; this.chasePressure = 0; this.lostT = 0;
    this.state.chaseStarted = true; this.state.chaseCleared = false; this.persist();
    if (patrol) {
      this.P.law.setPursuit(true); this.P.call('FWC TAC', 'WARDEN SOTO · FWC 27', '타워 보트, 클리닉 화물 도난 신고가 접수됐습니다. 속도를 줄이고 진로를 유지하세요. 정지 명령입니다.', 4, 'passage-patrol-chase');
    } else this.P.call('CH 72', 'CAL ROOK · LOST KEY', '마지막 기회. 내 스키프가 당신 선미에 있습니다. 파란 콜러를 물에 넣고 시동을 꺼라.', 4, 'passage-runner-chase');
    return true;
  }

  chaserHit(into, nx, nz) {
    if (!this.chaseActive) return;
    this.agent.shx += -nx * into * 0.46; this.agent.shz += -nz * into * 0.46; this.agent.speed *= 0.58;
    if (this.hitCd > 0 || into < 2.8) return; this.hitCd = 4;
    if (this.state.branch === 'runner') { this.P.game.toast('FWC 선체 피격', 'Soto가 정지에 충돌을 추가하고 있습니다.', 2.4); this.P.law.violation(0.7, 'FWC 선박 피격', true); }
    else this.P.game.toast('추격선 접근', '콜러를 갑판에서 가져가려 합니다.', 2.4);
  }

  stopChaser(markCleared = true, save = true) {
    this.chaseActive = false; this.agent.active = false; this.rigs.runner.visible = false; this.rigs.patrol.visible = false;
    this.rigs.runnerLamp.light.intensity = this.rigs.blue.light.intensity = this.rigs.red.light.intensity = 0; this.P.law.setPursuit(false);
    if (markCleared) this.state.chaseCleared = true; if (save) this.persist(); this.obLevel = 0;
  }

  updateChaser(dt, t) {
    if (!this.chaseActive) return;
    const p = this.P.phys, A = this.agent, patrol = this.state.branch === 'runner';
    this.P.incidents.updateAgent(A, dt, t, p.pos.x + p.vel.x * 0.7, p.pos.y + p.vel.y * 0.7, patrol ? 11.4 : 13.4, 0);
    const d = Math.hypot(A.x - p.pos.x, A.z - p.pos.y);
    if (d < 14 && p.speed * MPH < 12) this.chasePressure += dt; else this.chasePressure = Math.max(0, this.chasePressure - dt * 0.28);
    if (d > 340) this.lostT += dt; else this.lostT = Math.max(0, this.lostT - dt * 0.5);
    if (this.chasePressure > 3.8) { this.fail(patrol ? 'Soto가 라인에 올라타 콜러를 압수했습니다.' : 'Cal의 선원이 갑판에서 콜러를 들어올렸습니다.'); return; }
    if (this.lostT > 8) {
      this.stopChaser(true); this.P.call(patrol ? 'FWC TAC' : 'CH 72', patrol ? 'WARDEN SOTO · FWC 27' : 'CAL ROOK · LOST KEY', patrol ? '타워 보트가 뒷골목에서 사라졌습니다. 호출 채널을 유지하세요.' : '물 좀 벌었군요. 그래도 빚은 사라지지 않습니다.', 2, 'passage-chase-lost');
      return;
    }
    emitMapMarker(this.P.game, A.x, A.z, 'hazard', patrol ? '#5b8fff' : '#e0523e', 0, d > 155);
  }

  updateDelivery(dt, t) {
    const dpt = this.destination(), recipient = this.state.branch === 'runner' ? this.rigs.cache : this.rigs.aid;
    this.P.placeBoat(recipient, dpt, t); this.P.game.wpTarget = { x: dpt.x, z: dpt.z, label: this.state.branch === 'runner' ? 'Cal의 차단점' : 'Split Pine 구조 보트', color: this.state.branch === 'runner' ? '#5b8fff' : '#f0d989', story: true };
    if (this.state.branch === 'runner' && this.state.cargoUntil) {
      const remaining = Math.max(0, (this.state.cargoUntil - Date.now()) / 1000); this.P.law.hotCargoT = remaining > 0 ? remaining : Math.min(this.P.law.hotCargoT, dt);
    }
    const d = Math.hypot(dpt.x - this.P.phys.pos.x, dpt.z - this.P.phys.pos.y), ratio = this.routeStart > 0 ? d / this.routeStart : 0;
    if (this.routeBand === 0 && ratio < 0.72) {
      this.state.routeBand = this.routeBand = 1; this.persist(); this.spawnChaser();
    } else if (this.routeBand === 1 && ratio < 0.34) {
      this.state.routeBand = this.routeBand = 2; this.persist();
      this.P.call(this.state.branch === 'runner' ? 'CH 72' : 'CH 68', this.state.branch === 'runner' ? 'CAL ROOK · LOST KEY' : 'JUNE BELL · SPLIT PINE', this.state.branch === 'runner' ? '맹그로브 아래 파란 등불. 빙빙 돌지 말고 곧장 들어오세요.' : 'Nolan의 주황 조끼가 보입니다. 좌현으로 데려오고 팬은 낮추세요.', 3, 'passage-route-two');
    }
    if (!this.chaseActive && this.state.chaseStarted && !this.state.chaseCleared) { this.chaseDelay -= dt; if (this.chaseDelay <= 0) this.spawnChaser(); }
    this.updateChaser(dt, t); if (this.state.stage !== 'delivery') return;
    if (d < 12 && this.P.phys.speed * MPH < 6 && this.P.canInteract()) {
      this.P.setPrompt(`<b>E</b> ${this.state.branch === 'runner' ? 'Cal Rook에게 콜러 전달' : '구조 보트 옆에 Nolan을 붙여라'}`); if (this.P.interact) this.finish();
    } else this.P.clearPrompt();
  }

  finish() {
    if (this.state.stage !== 'delivery') return;
    const branch = this.state.branch, recipient = branch === 'runner' ? this.rigs.cache : this.rigs.aid, berth = this.destination();
    this.stopChaser(true, false); recipient.add(this.rigs.cooler); this.rigs.cooler.position.set(0.48, 0.7, -1.0); this.rigs.cooler.rotation.set(0, -0.18, 0); this.rigs.cooler.visible = true;
    const cargo = [this.rigs.cooler];
    if (branch === 'rescue') { recipient.add(this.rigs.survivor); this.rigs.survivor.position.set(-0.42, 0.56, -0.3); this.rigs.survivor.rotation.set(0, 0.2, 0); this.rigs.survivor.visible = true; cargo.push(this.rigs.survivor); }
    else this.rigs.survivor.visible = false;
    Object.assign(this.state, { stage: 'complete', ending: branch, completedAt: Date.now(), consequenceAt: Date.now() + 75000, consequence: false, cargoUntil: 0, chaseCleared: true });
    this.rigs.wreck.visible = false; this.P.phys.loaded = 0; this.P.clearPrompt(); this.P.game.wpTarget = null; this.P.law.hotCargoT = 0; this.P.law.cool(0.3);
    this.P.startDeparture(recipient, berth, cargo, branch === 'runner' ? 0.82 : 0.9, branch !== 'runner');
    if (branch === 'runner') {
      this.P.game.addCash(1100); this.P.reputation.change('runners', 1.8, 'false-passage-sale', '잔해에서 가져온 클리닉 콜러를 Cal Rook에게 매각했습니다.', true);
      this.P.reputation.change('locals', -1.15, 'false-passage-sale', '캠프 주민들은 Nolan이 잔해 위에 남겨진 채 콜러만 남쪽으로 사라졌다는 소식을 들었습니다.', false);
      this.P.reputation.change('fwc', -0.4, 'false-passage-sale', 'FWC가 사라진 클리닉 콜러를 타워 보트 선체와 연결했습니다.', false);
      this.P.call('CH 72', 'CAL ROOK · LOST KEY', '밀봉 상태 양호. 1,100. Nolan은 당신이 떠날 때 숨을 쉬고 있었으니, 16번이 나머지를 처리하게 두세요.', 4, 'passage-runner-finish');
      this.P.game.bountyToast('클리닉 콜러 매각 완료 <b>+$1,100</b>');
    } else {
      this.P.game.addCash(650); this.P.reputation.change('locals', 1.6, 'false-passage-rescue', 'Nolan과 클리닉 콜러를 Split Pine까지 데려왔습니다.', true);
      this.P.reputation.change('fwc', 0.75, 'false-passage-rescue', '사라졌던 배달원과 의료용 화물이 구조 보트까지 도달했습니다.', false);
      this.P.reputation.change('runners', -0.8, 'false-passage-rescue', 'Cal의 선원들이 수를 드러낸 뒤 클리닉 콜러를 잃었습니다.', false);
      this.P.call('CH 68', 'JUNE BELL · SPLIT PINE', 'Nolan을 확보했습니다. 콜러는 차갑게 밀봉된 상태입니다. 의료진이 어깨를 치료한 다음에야 Leon이 신호등 문제를 따질 수 있습니다.', 4, 'passage-rescue-finish');
      this.P.game.bountyToast('배달원 구조 완료 <b>+$650</b>');
    }
    this.P.audio.complete(); this.persist();
  }

  fail(reason) {
    if (this.state.stage !== 'delivery') return;
    const patrol = this.state.branch === 'runner'; this.stopChaser(false, false); this.P.clearPrompt(); this.P.game.wpTarget = null; this.P.phys.loaded = 0;
    this.P.scene.add(this.rigs.cooler); this.rigs.cooler.visible = false; this.rigs.survivor.visible = false; this.rigs.wreck.visible = false; this.rigs.aid.visible = false; this.rigs.cache.visible = false;
    if (patrol) { const seized = this.P.law.confiscate(); if (!seized) this.P.law.cited(); } else this.P.law.hotCargoT = 0;
    Object.assign(this.state, { stage: 'failed', retryAt: Date.now() + 30000, offerAt: Date.now() + 30000, cargoUntil: 0 });
    this.P.call(patrol ? 'FWC TAC' : 'CH 72', patrol ? 'WARDEN SOTO · FWC 27' : 'CAL ROOK · LOST KEY', reason, 4, 'passage-failed');
    this.P.game.toast('잘못된 항로 실패', reason, 3.6); this.P.audio.fail(); this.persist();
  }

  triggerConsequence() {
    if (this.state.stage !== 'complete' || this.state.consequence || Date.now() < this.state.consequenceAt) return false;
    this.state.consequence = true; this.persist();
    if (this.state.ending === 'runner') this.P.call('CH 16', 'MARA KEENE · TOWER', 'FWC가 잔해 위에서 Nolan이 살아 있는 것을 발견했습니다. 클리닉 콜러는 여전히 사라진 상태입니다. Split Pine에서는 어떤 선체가 가져갔는지 묻지 않고 있습니다.', 3, 'passage-runner-aftermath');
    else this.P.call('CH 16', 'NOLAN PIKE · SPLIT PINE', '타워 보트, Nolan입니다. 어깨가 치료됐습니다. 콜러 한 개, 스키프 한 척, 아무도 우리를 쫓지 않는 라이드 한 번이 빚입니다.', 2, 'passage-rescue-aftermath');
    return true;
  }

  updateLights(t) {
    const night = this.P.environment.hour < 6.3 || this.P.environment.hour > 18.4, pulse = 0.5 + Math.sin(t * 5.7) * 0.5;
    this.rigs.strobe.light.intensity = this.rigs.wreck.visible ? (night ? 115 : 58) * pulse : 0; this.rigs.strobe.bulb.scale.setScalar(0.9 + pulse * 0.75);
    this.rigs.aidLamp.light.intensity = night && this.rigs.aid.visible ? 92 : 0; this.rigs.cacheLamp.light.intensity = night && this.rigs.cache.visible ? 108 : 0;
    this.rigs.runnerLamp.light.intensity = night && this.rigs.runner.visible ? 78 : 0;
    if (this.rigs.patrol.visible) { const blink = Math.floor(t * 5.2) % 2; this.rigs.blue.light.intensity = blink ? 105 : 5; this.rigs.red.light.intensity = blink ? 5 : 105; }
    else this.rigs.blue.light.intensity = this.rigs.red.light.intensity = 0;
  }

  addBoat(mesh, point, obstacle) {
    if (!mesh.visible || Math.hypot(point.x - this.P.phys.pos.x, point.z - this.P.phys.pos.y) > 82) return;
    const fx = -Math.sin(point.heading), fz = -Math.cos(point.heading); obstacle.ax = point.x + fx * 2.1; obstacle.az = point.z + fz * 2.1; obstacle.bx = point.x - fx * 2.1; obstacle.bz = point.z - fz * 2.1; this.obs.push(obstacle);
  }

  refreshObstacles() {
    this.addBoat(this.rigs.wreck, this.state.coords.wreck, this.wreckObs);
    if ((this.state.stage === 'search' || this.state.stage === 'choice') && this.rigs.cooler.visible && Math.hypot(this.state.coolerX - this.P.phys.pos.x, this.state.coolerZ - this.P.phys.pos.y) < 82) { this.coolerObs.x = this.state.coolerX; this.coolerObs.z = this.state.coolerZ; this.obs.push(this.coolerObs); }
    if (this.state.stage === 'delivery') this.addBoat(this.state.branch === 'runner' ? this.rigs.cache : this.rigs.aid, this.destination(), this.recipientObs);
    if (this.chaseActive) { this.chaserObs.tag = this.state.branch === 'runner' ? 'FWC patrol' : 'runner skiff'; this.addBoat(this.agent.mesh, this.agent, this.chaserObs); }
  }

  updateAudio() {
    this.obLevel = 0; this.obPitch = this.state.branch === 'runner' ? 0.84 : 0.94; this.obX = 0; this.obZ = 0;
    if (this.state.stage === 'delivery') {
      const dpt = this.destination(), d = Math.hypot(dpt.x - this.P.phys.pos.x, dpt.z - this.P.phys.pos.y);
      if (d < 140) { this.obLevel = 0.15 * (1 - d / 140); this.obX = dpt.x; this.obZ = dpt.z; }
    }
    if (this.chaseActive) {
      const d = Math.hypot(this.agent.x - this.P.phys.pos.x, this.agent.z - this.P.phys.pos.y);
      if (d < 150) { const level = (0.25 + 0.7 * Math.min(1, this.agent.speed / 13)) * (1 - d / 150); if (level > this.obLevel) { this.obLevel = level; this.obX = this.agent.x; this.obZ = this.agent.z; } }
    }
  }

  wakeHeightAt(x, z, t) {
    const A = this.agent;
    if (!this.chaseActive || !A.active || A.backing || A.speed <= 2.2) return 0;
    return wakeSampleAt(A.x, A.z, A.heading, A.speed, 13.4, 0.11, x, z, t);
  }

  stamps(out) {
    if (!this.chaseActive || this.agent.speed < 2 || Math.hypot(this.agent.x - this.P.phys.pos.x, this.agent.z - this.P.phys.pos.y) > 95) return;
    const A = this.agent, fx = -Math.sin(A.heading), fz = -Math.cos(A.heading), sp = Math.min(1, A.speed / 13);
    emitWakeStamp(out, A.x - fx * 1.8, A.z - fz * 1.8, 1.1, 0.52 * sp, 1.7 * sp, 1);
    emitWakeStamp(out, A.x + fx * 1.8, A.z + fz * 1.8, 1, -0.67 * sp, 0.1 * sp, 0.7);
  }

  update(dt, t, enabled = true) {
    this.enabled = enabled; this.obs.length = 0; this.hitCd = Math.max(0, this.hitCd - dt); this.updateLights(t);
    if (!enabled) { this.P.clearPrompt(); this.updateAudio(); return; }
    const s = this.state.stage;
    if (s === 'dormant') { if (this.eligible() && !this.state.offerAt) this.arm(); if (this.eligible() && Date.now() >= this.state.offerAt) this.offer(); }
    else if (s === 'search') this.updateSearch(dt, t);
    else if (s === 'choice') this.updateChoice(dt, t);
    else if (s === 'delivery') this.updateDelivery(dt, t);
    else if (s === 'failed' && Date.now() >= this.state.retryAt) { this.state.stage = 'dormant'; this.persist(); }
    else if (s === 'complete') { this.P.clearPrompt(); this.triggerConsequence(); }
    this.refreshObstacles(); this.updateAudio();
  }

  resetDebug() {
    const carrying = this.state.stage === 'delivery' && this.state.branch === 'runner'; this.stopChaser(false, false); this.P.clearPrompt(); this.obs.length = 0; this.hideRigs();
    const C = this.state.coords.wreck;
    Object.assign(this.state, { stage: 'dormant', branch: '', ending: '', approached: false, offerAt: 0, retryAt: 0, completedAt: 0, consequenceAt: 0, consequence: false, cargoUntil: 0, routeBand: 0, chaseStarted: false, chaseCleared: false, coolerX: C.x + Math.cos(C.heading + 0.85) * 7, coolerZ: C.z + Math.sin(C.heading + 0.85) * 7 });
    if (carrying) { this.P.law.hotCargoT = 0; this.P.law.cool(Math.min(1.65, this.P.law.attention)); }
    this.routeBand = 0; this.P.phys.loaded = 0; this.updateAudio(); this.persist();
  }
}
