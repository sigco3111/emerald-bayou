const clamp = (v, lo = -10, hi = 10) => Math.max(lo, Math.min(hi, v));

const RANKS = {
  locals: [
    [6, '우리 사이'], [3, '신뢰받는'], [1, '알려진'], [-1, '검증 안 된'], [-3, '거리를 두는'], [-6, '냉담한 환대'], [-11, '쫓겨난'],
  ],
  fwc: [
    [6, '신뢰 운영자'], [3, '협조적'], [1, '깔끔한 것으로 알려짐'], [-1, '정체불명 선체'], [-3, '주시 대상'], [-6, '지정 대상'], [-11, '우선 단속 선체'],
  ],
  runners: [
    [6, '안쪽 라인'], [3, '신뢰받는'], [1, '알려진'], [-1, '검증 안 된'], [-3, '환영받지 못함'], [-6, '표적'], [-11, '수색 대상'],
  ],
};

const NOTICE = {
  locals: { up: '소문이 퍼짐', down: '차가운 반응' },
  fwc: { up: 'FWC 기록', down: 'FWC 파일' },
  runners: { up: '백채널', down: '백채널' },
};

export class Reputation {
  constructor(o) {
    Object.assign(this, o); // game, environment, audio
    const saved = this.game.save.reputation || {}, legacy = Number(this.game.save.goodwill) || 0;
    this.values = {
      locals: clamp(Number(saved.locals ?? legacy)),
      fwc: clamp(Number(saved.fwc ?? 0)),
      runners: clamp(Number(saved.runners ?? 0)),
    };
    this.deeds = Array.isArray(saved.deeds) ? saved.deeds.slice(-12) : [];
    this.game.save.reputation = { ...this.values, deeds: this.deeds };
    this.game.save.goodwill = Math.round(this.values.locals);
    this.el = document.getElementById('memoryState'); this.noticeT = 0; this.title = ''; this.line = ''; this.enabled = false;
    this.campSeen = new Set(); this.lastCamp = ''; this.debugIndex = 0;
    this.keyHandler = e => {
      if (!import.meta.env.DEV || e.code !== 'F2' || e.repeat || !this.enabled) return;
      e.preventDefault();
      const presets = [
        { locals: 5, fwc: 4, runners: 2, title: '알려진 선체', line: '마을, 순찰대, 백채널 모두 이 배를 알고 있다.' },
        { locals: 0, fwc: 0, runners: 0, title: '정체불명 선체', line: '아직 아무도 당신에 대해 판단을 내리지 않았다.' },
        { locals: -5, fwc: -5, runners: -5, title: '나쁜 평판', line: '이 선체가 나타나면 문이 닫히고 무전은 바빠진다.' },
      ];
      const p = presets[this.debugIndex++ % presets.length];
      Object.assign(this.values, { locals: p.locals, fwc: p.fwc, runners: p.runners }); this.sync(); this.notice(p.title, p.line, 4.5);
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  score(faction) { return Number(this.values[faction]) || 0; }

  rank(faction) {
    const v = this.score(faction), list = RANKS[faction] || RANKS.locals;
    for (const [floor, label] of list) if (v >= floor) return label;
    return list[list.length - 1][1];
  }

  sync() {
    this.game.save.reputation = { ...this.values, deeds: this.deeds };
    this.game.save.goodwill = Math.round(this.values.locals);
    this.game.persist();
  }

  notice(title, line, seconds = 4) {
    this.title = title; this.line = line; this.noticeT = seconds; this.render();
  }

  change(faction, amount, code, text, announce = true) {
    if (!this.values.hasOwnProperty(faction) || !Number.isFinite(amount) || Math.abs(amount) < 0.001) return 0;
    const before = this.values[faction], after = clamp(before + amount); if (after === before) return 0;
    this.values[faction] = Math.round(after * 100) / 100;
    const deed = {
      faction, delta: Math.round((after - before) * 100) / 100, code: code || 'word', text: text || '사람들이 이 선체를 기억한다.',
      day: this.environment ? this.environment.day : 1, hour: this.environment ? Math.round(this.environment.hour * 10) / 10 : 0,
    };
    const prev = this.deeds[this.deeds.length - 1];
    if (prev && prev.faction === deed.faction && prev.code === deed.code && prev.day === deed.day && Math.abs(prev.hour - deed.hour) < 0.2) {
      prev.delta = Math.round((prev.delta + deed.delta) * 100) / 100; prev.hour = deed.hour; prev.text = deed.text;
    } else { this.deeds.push(deed); if (this.deeds.length > 12) this.deeds.shift(); }
    this.sync();
    if (announce) { const n = NOTICE[faction]; this.audio.pickup(); this.notice(amount > 0 ? n.up : n.down, deed.text, 4.2); }
    return after - before;
  }

  recent(faction) {
    for (let i = this.deeds.length - 1; i >= 0; i--) if (!faction || this.deeds[i].faction === faction) return this.deeds[i];
    return null;
  }

  serviceFactor() { return clamp(1 - this.score('locals') * 0.032, 0.78, 1.22); }
  serviceNote() { const v = this.score('locals'); return v >= 3 ? '친구 가격' : v <= -3 ? '현금만' : ''; }
  extendsCredit() { return this.score('locals') >= 4; }
  patrolCheckTime(base) { return base * clamp(1 - this.score('fwc') * 0.045, 0.68, 1.42); }
  fineFactor() { return clamp(1 - this.score('fwc') * 0.04, 0.76, 1.42); }
  runnerHostility() { return clamp(-this.score('runners') / 6, -1, 1); }

  mission(m, first = true) {
    if (m.isRun) {
      this.change('locals', 0.45, 'camp-run', `${m.to.name}에 물자를 전달했다.`, true); return;
    }
    if (!first) return;
    if (m.id === 'manatee') {
      this.change('fwc', 1.4, 'manatee-count', 'FWC에 깔끔한 마네키 개체수 조사 기록이 남았다.', true);
      this.change('locals', 0.35, 'manatee-count', '마네키가 있는 물 위를 천천히 지나갔다.', false);
    } else if (m.id === 'chase') {
      this.change('locals', 1, 'poacher-chase', '밀렵 어선을 피난처에서 내쫓았다.', true);
      this.change('fwc', 1.25, 'poacher-chase', 'FWC에 밀렵 어선 회수 기록이 남았다.', false);
      this.change('runners', -2, 'poacher-chase', '백채널에 밀렵 어선을 잡아낸 선체가 누구인지 들렸다.', false);
    } else if (m.id === 'cargo') {
      this.change('locals', 1.25, 'supply-run', '크릭 캠프로 연료가 무사히 도착했다.', true);
    } else if (m.id === 'rescue') {
      this.change('locals', 2, 'kayaker-rescue', '길 잃은 카약 여행자를 무사히 데려왔다.', true);
      this.change('fwc', 0.4, 'kayaker-rescue', '구조 사건이 사고 일지에 기록되었다.', false);
    } else if (m.id === 'gator') {
      this.change('locals', 0.8, 'gator-move', '큰 수컷 악어를 타워 독에서 옮겼다.', true);
      this.change('fwc', 0.45, 'gator-move', '성가신 악어 처리 작업이 깔끔하게 끝났다.', false);
    } else if (m.id === 'sonar') {
      this.change('locals', 0.55, 'wreck-recovery', '폭풍으로 가라앉은 잔해 두 척을 해도에 다시 올렸다.', true);
    } else if (m.id === 'traps') {
      this.change('locals', 0.45, 'trap-line', '사라진 게통 라인을 깔끔하게 처리했다.', true);
    }
  }

  campLine() {
    const v = this.score('locals');
    if (v >= 6) return '"어디다 대. 깨끗한 기름통 하나 남겨뒀다."';
    if (v >= 3) return '"우리 배를 안다. 가까이 와라."';
    if (v <= -6) return '"그 배에서 내리지 마."';
    if (v <= -3) return '"내가 보는 데서 현금으로."';
    return '';
  }

  update(dt, enabled = true) {
    this.enabled = enabled;
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) this.render(); }
    const camp = enabled && !this.game.paused ? this.game.dockCamp : null, key = camp ? camp.key : '';
    if (key && key !== this.lastCamp && !this.campSeen.has(key)) {
      this.campSeen.add(key); const line = this.campLine(); if (line) this.game.toast(line, camp.name, 2.8);
    }
    this.lastCamp = key;
  }

  render() {
    if (!this.el) return;
    const on = this.noticeT > 0;
    this.el.classList.toggle('on', on); this.el.innerHTML = on ? `<span>${this.title}</span><small>${this.line}</small>` : '';
  }
}
