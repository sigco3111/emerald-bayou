import { emitMapMarker } from './mapmarkers.js';

const MPH = 2.23694;

// The story boats do not disappear into a mission flag. Once they are off duty,
// their owners return to familiar water and remember which hull came alongside.
export class StoryResidents {
  constructor(parent) {
    this.P = parent;
    const saved = parent.game.save.residents || {};
    this.state = parent.game.save.residents = {
      contacts: saved.contacts && typeof saved.contacts === 'object' ? saved.contacts : {},
    };
    this.obs = [];
    parent.phys.addObs('story-residents', this.obs);
    this.away = new Set();
    this.entries = [
      {
        id: 'leon', name: 'LEON DOSS', place: 'OLD MILL', channel: 'CH 68', color: '#e4c26f',
        mesh: parent.rigs.oldMill, point: parent.state.coords.local, hours: [5.4, 19.2], present: false, inside: false,
      },
      {
        id: 'cal', name: 'CAL ROOK', place: 'LOST KEY', channel: 'CH 72', color: '#cf7e43',
        mesh: parent.rigs.lostKey, point: parent.state.coords.runner, hours: [15, 5.5], present: false, inside: false,
      },
      {
        id: 'june', name: 'JUNE BELL', place: 'SPLIT PINE', channel: 'CH 68', color: '#79a9b8',
        mesh: parent.passage.rigs.aid, point: parent.passage.state.coords.aid, hours: [6, 22], present: false, inside: false,
      },
    ];
    for (const e of this.entries) {
      e.present = this.scheduled(e);
      e.obstacle = { ax: 0, az: 0, bx: 0, bz: 0, r: 1.08, tag: `${e.name.toLowerCase()} work skiff` };
    }
  }

  scheduled(entry) {
    const h = this.P.environment.hour, [from, to] = entry.hours;
    const onClock = from < to ? h >= from && h < to : h >= from || h < to;
    return onClock && this.P.environment.values.storm < 0.92;
  }

  departed(mesh) { if (mesh) this.away.add(mesh); }

  missionOwns(entry) {
    const P = this.P;
    if (P.departMesh === entry.mesh) return true;
    if (P.stormLine?.owns(entry.mesh)) return true;
    if (entry.id === 'leon' || entry.id === 'cal') {
      const selected = P.state.branch === 'runner' ? P.rigs.lostKey : P.rigs.oldMill;
      return P.state.stage === 'delivery' && selected === entry.mesh;
    }
    const s = P.passage.state;
    return entry.id === 'june' && s.stage === 'delivery' && s.branch === 'rescue';
  }

  syncCargo() {
    const P = this.P, S = P.state, Q = P.passage;
    if (S.stage === 'complete') {
      const owner = S.ending === 'runner' ? P.rigs.lostKey : P.rigs.oldMill;
      if (P.rigs.case.parent === owner) P.rigs.case.visible = true;
    }
    if (Q.state.stage !== 'complete') return;
    if (Q.state.ending === 'rescue') {
      if (Q.rigs.cooler.parent === Q.rigs.aid) Q.rigs.cooler.visible = true;
      if (Q.rigs.survivor.parent === Q.rigs.aid) Q.rigs.survivor.visible = true;
      return;
    }
    if (Q.state.ending === 'runner' && !P.departMesh && Q.rigs.cooler.parent !== P.rigs.lostKey) {
      P.rigs.lostKey.add(Q.rigs.cooler);
      Q.rigs.cooler.position.set(-0.48, 0.7, -1.02);
      Q.rigs.cooler.rotation.set(0, -0.15, 0);
    }
    if (Q.state.ending === 'runner' && Q.rigs.cooler.parent === P.rigs.lostKey) Q.rigs.cooler.visible = true;
    if (Q.state.ending === 'runner') Q.rigs.survivor.visible = false;
  }

  line(entry) {
    const P = this.P, base = P.state, passage = P.passage.state, high = P.stormLine?.state;
    if (entry.id === 'leon') {
      if (high?.ending === 'rescue') return 'Old Mill의 폭풍 발전기가 정상입니다. 황금 정박지 표시등은 물이 차오를 때마다 켜져 있습니다.';
      if (high?.ending === 'runner') return 'Split Pine은 랜턴으로 버텼고 Cal의 맹그로브에서는 발전기가 윙윙거렸습니다. 사람들은 그걸 기억합니다.';
      if (base.stage !== 'complete') return '타워 보트, Old Mill입니다. 작업 스키프가 동쪽 포켓에 있습니다. 줄 공간을 남겨두세요.';
      if (base.ending === 'runner') return '제 컨트롤러가 어디로 갔는지 압니다. 그 선체를 Old Mill 보트에서 멀리하세요.';
      if (passage.ending === 'rescue') return 'Nolan이 당신이 Split Pine까지 계속 팬을 잡고 있었다고 합니다. 잘 했어요.';
      return 'West Cut 등불이 정상입니다. 매 조류마다 확인하고 있습니다.';
    }
    if (entry.id === 'cal') {
      if (high?.ending === 'runner') return '폭풍 비축장이 건조하고 콜드 박스 안정. 72번 채널에 인솔을 잡아줄 선체 작업이 있습니다.';
      if (high?.ending === 'rescue') return 'Old Mill이 발전기를 보유. 폭풍을 깨끗한 상태로 착각하지 마세요.';
      if (passage.ending === 'runner') return '콜러 밀봉完好. 조용한 운항이 또 있을 때 72번 채널 열겠습니다.';
      if (passage.ending === 'rescue') return '당신이 깨끗한 콜러를 망치고 Soto에게 경로를 보여줬습니다. 이 보트에 몰리지 마세요.';
      if (base.ending === 'local') return 'Leon이 등불을 찾았습니다. 어떤 선체가 가져다줬는지 기억합니다.';
      return 'Lost Key에서 타워 보트를 봤습니다. 호출할 때까지 바깥에서 대기.';
    }
    if (high?.ending === 'rescue') return 'Nolan과 콜드 박스가 핵심 밴드 전에 Old Mill에 도착했습니다. 피난처 등불은 당신 것도 저희만큼입니다.';
    if (high?.ending === 'runner') return 'Split Pine은 발전기가 맹그로브에 머문 매 시간을 세고 있었습니다.';
    if (passage.ending === 'rescue') return 'Nolan이 깨어 커피에 불평하고 있습니다. 나아지고 있다는 뜻입니다.';
    if (passage.ending === 'runner') return 'Nolan이 살아났습니다. 당신 파도에서 감사할 만한 유일한 부분입니다.';
    if (base.ending === 'local') return 'Leon이 West Cut에 초록을 다시 켰습니다. Split Pine은 컨트롤러를 가져온 사람이 누구인지 들었습니다.';
    return 'Split Pine 구조 보트가 대기 중입니다. 16번 채널이 트래픽을 끊으면 정박지를 비워두세요.';
  }

  greet(entry) {
    const day = this.P.environment.day, c = this.state.contacts[entry.id] || { count: 0, lastDay: 0 };
    if (c.lastDay === day) return;
    c.count += 1; c.lastDay = day; this.state.contacts[entry.id] = c;
    this.P.radio.transmit({
      channel: entry.channel, speaker: `${entry.name} · ${entry.place}`, text: this.line(entry), priority: 1,
      key: `resident:${entry.id}:${day}`, cooldown: 0,
    });
    this.P.game.persist();
  }

  addObstacle(entry) {
    const selected = this.P.state.branch === 'runner' ? this.P.rigs.lostKey : this.P.rigs.oldMill;
    if (this.P.state.stage === 'complete' && selected === entry.mesh) return;
    const p = entry.point, o = entry.obstacle, fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
    o.ax = p.x + fx * 2.1; o.az = p.z + fz * 2.1; o.bx = p.x - fx * 2.1; o.bz = p.z - fz * 2.1;
    this.obs.push(o);
  }

  update(dt, t, enabled = true) {
    this.obs.length = 0;
    if (!enabled) return;
    this.syncCargo();
    const P = this.P, px = P.phys.pos.x, pz = P.phys.pos.y;
    for (const entry of this.entries) {
      if (this.missionOwns(entry)) { entry.inside = false; continue; }
      const d = Math.hypot(entry.point.x - px, entry.point.z - pz), wanted = this.scheduled(entry);
      if (wanted !== entry.present && d > 240) entry.present = wanted;
      if (this.away.has(entry.mesh)) {
        if (d > 320) this.away.delete(entry.mesh);
        else { entry.mesh.visible = false; entry.inside = false; continue; }
      }
      const visible = entry.present && d < 950;
      entry.mesh.visible = visible;
      if (!visible) { entry.inside = false; continue; }
      P.placeBoat(entry.mesh, entry.point, t);
      if (d < 82) this.addObstacle(entry);
      if (d < 230) emitMapMarker(P.game, entry.point.x, entry.point.z, 'boat', entry.color, entry.point.heading);
      if (d < 68 && !entry.inside && P.phys.speed * MPH < 28 && !P.busy() && !P.game.state && !P.game.paused) this.greet(entry);
      entry.inside = d < 105;
    }
  }
}
