const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = list => list[Math.floor(Math.random() * list.length)];
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const RECENT_LIMIT = 256;

const WEATHER_CALLS = {
  fair: ['MARINE WX-3', '소형 선박 주의보 해제. 폭풍 물이 아직 안쪽 수로에 높게 차 있을 수 있다.'],
  fog: ['MARINE WX-3', '백컨트리 짙은 안개 주의보. 시정 약 400미터. 안전 속도로 줄이고 진행 시 길게 한 번 신호음을 울려라.'],
  overcast: ['MARINE WX-3', '백컨트리 기압이 떨어지는 중. 곳에 따라 비, 시정 3km 미만.'],
  squall: ['MARINE WX-3', '서쪽에서 동쪽으로 빠르게 스콜 통과 중. 개활 수면에서 돌풍 약 30노트.'],
  thunderstorm: ['MARINE WX-3', '강한 뇌우 경보. 잦은 번개와 하구 주변에서 용오름 가능.'],
  hail: ['MARINE WX-3', '우박 코어가 베이유 통과 중. 모든 소형 선박은 지금 즉시 차폐 수역으로.'],
  tropical: ['MARINE WX-3', '열대 폭풍 우대가 백컨트리 안쪽으로 진입. 수로 수위 상승과 표지 이탈 가능.'],
  hurricane: ['MARINE WX-3', '허리케인 경보. 생명을 위협하는 해일이 만 안쪽으로 유입 중. 더 이상 안전한 외해 횡단은 없다.'],
};

const HURRICANE_PHASE_CALLS = {
  'front-eyewall': '선두 아이월 진입. 가장 강한 바람, 시정 거의 영, 비산물 비산 예상.',
  eye: '눈이 머리 위로 통과. 바람이 잠시 잠잠하지만 해일과 거친 파도는 여전. 후면 아이월이 반대쪽에서 다시 온다.',
  'back-eyewall': '후면 아이월 진입. 바람 방향 반전, 비산물은 반대쪽 사분면에서 이동.',
  'trailing-bands': '아이월이 지구 통과. 위험한 해일, 거친 파도, 후미 스콜 계속.',
};

const REGION_ENTRY = {
  blackwater: '블랙워터는 무전 신호를 삼킨다. 모든 굽이를 표시해두고 사이프러스가 뒤를 막으면 호출해라.',
  sawgrass: '톱블레이드는 얕은 물이고 도움 받으려면 멀리 걸어 가야 한다. 타워를 수신 범위에 두어라.',
  mangrove: '맹그로브 리치는 조류에 힘차게 밀려온다. 양쪽 수로에 떠 있는 통나무.',
  cypress: '오래된 목재가 사이프러스 리치를 좁힌다. 보이지 않는 굽이에서는 신호음을 울려라.',
  emerald: '타워 수역으로 돌아왔다. 날씨가 가져가기 전까지는 부두 등불이 켜져 있다.',
  broad: '브로드 리치에는 작업 어선이 다닌다. 표시된 수로 오른쪽으로.',
  rookery: '루커리 호수 저소음 구역 작동 중. 흰 말뚝 사이를 천천히 지나가라.',
  prairie: '텐 마일 초원에는 그늘이 없다. 서쪽 하늘과 연료를 잘 살펴라.',
  'dead-river': '오늘 밤 데드 리치에는 부두 등불이 없다. 오래된 빨간 표지를 믿지 마라.',
};

const REGION_TRAFFIC = {
  blackwater: [
    ['CH 68', 'JUNE BELL · SPLIT PINE', '스플릿 파인 아래 사이프러스 가지가 깔렸다. 뿌리에 바짝 붙으면 동쪽 수로는 아직 통과된다.'],
    ['CH 16', 'LOCAL SKIFF', '블랙워터에서 등불 없이 북상 중. 다음 두 굽이에서 신호음 울림.'],
    ['CH 68', 'LEON DOSS · OLD MILL', '낡은 울타리 기둥 위로 물이 까맣다. 깊어 보여도 그 코너를 자르지 마라.'],
  ],
  sawgrass: [
    ['FWC TAC', 'FWC AIR 2', '펌프 포 아래쪽 약 0.8km 지점, 톱블레이드 위 에어보트 두 척이 서행 중.'],
    ['CH 68', 'PUMP FOUR', '남쪽 게이트 개방. 해질 때까지 톱블레이드 수면이 15cm 정도 더 올라간다.'],
    ['CH 16', 'LOCAL SKIFF', '낡은 펌프 서쪽은 살갗도 잠길 만큼 얕다. 프로펠러가 이미 진흙을 갉아먹고 있다.'],
  ],
  mangrove: [
    ['CH 72', 'CAL ROOK · LOST KEY', '밀물에 맹그로브 수로가 흐른다. 헐거워진 것은 전부 따라 나온다.'],
    ['CH 16', 'SHRIMP SKIFF 4', '맹그로브 리치 외항, 북쪽 갈래 천천히 진행.'],
    ['CH 68', 'LOST KEY CAMP', '녹색 표지가 또 사라졌다. 기둥 말고 기운 맹그로브를 기준으로 삼아라.'],
  ],
  cypress: [
    ['CH 68', 'LEON DOSS · OLD MILL', '올드 밀은 한 배씩만 통과. 남쪽에서 작업선이 올라온다.'],
    ['CH 16', 'CAMP RADIO', '사이프러스 리치 서안 바로 수면 아래에 새 침몰목.'],
    ['CH 68', 'JUNE BELL · SPLIT PINE', '사이프러스 수관 아래에 안개가 끼었다. 하늘이 안 보이면 속도를 줄여라.'],
  ],
  emerald: [
    ['CH 68', 'MARA KEENE · TOWER', '번개가 8km 안으로 들어올 때까지 주유 부두는 영업 중.'],
    ['CH 16', 'BENT PINE CAMP', '타워 라군을 떠나는 작은 스키프. 북쪽으로 천천히.'],
    ['CH 09', 'FUEL DOCK', '연료 떨어져 들어오는 배는 닻 내리기 전에 몇 갤런 필요한지 알려라.'],
  ],
  broad: [
    ['CH 16', 'TUG MARCEL', '브로드 리치를 따라 상업용 스키프 남하 중. 12번 표지 바깥으로 통행.'],
    ['FWC TAC', 'WARDEN SOTO · FWC 27', '순찰선 27호 브로드 강 북상 중. 마을 부근에서 저속 단속.'],
    ['CH 68', 'NET BOAT 9', '전력선 부근 어선이 강을 가로질러 돈다. 에어보트 보인다.'],
  ],
  rookery: [
    ['FWC TAC', 'WARDEN SOTO · FWC 27', '루커리 호수 저속 구역 가동. 새끼가 아직 낮은 둥지에 있다.'],
    ['CH 68', 'BIRD CREW', '밤새 흰 말뚝이 움직였다. 서쪽 루커리에서 50야드 더 띄워라.'],
    ['CH 16', 'LOCAL SKIFF', '루커리 남쪽 따뜻한 가장자리 마네키. 성체 세 마리에 새끼 한 마리.'],
  ],
  prairie: [
    ['CH 68', 'PUMP FOUR', '펌프 포에서 남쪽 방류 중. 강이 돌기 전 톱블레이드부터 흐름이 바뀐다.'],
    ['FWC TAC', 'FWC AIR 2', '텐 마일 초원 서쪽 외해 번개. 그곳에 높이 솟은 건 당신뿐.'],
    ['CH 16', 'LOCAL SKIFF', '텐 마일 위로 동쪽 항행. 물이 모이는 어두운 톱블레이드 라인을 따라.'],
  ],
  'dead-river': [
    ['CH 16', 'UNKNOWN SKIFF', '데드 리치 남하 중. 식별 부호 없음, 부두 호출 없음.'],
    ['CH 68', 'JUNE BELL · SPLIT PINE', '누가 또 데드 리치 부두에서 배터리를 털어 갔다. 자기 손전등 챙겨라.'],
    ['CH 72', 'CAL ROOK · LOST KEY', '낡은 빨간 표지가 깜빡이면 누군가 잘못된 수로로 끌어들이려는 거다.'],
  ],
};

export class RadioDirector {
  constructor(o) {
    Object.assign(this, o); // game, audio, environment, regions, encounters, law, reputation, condition, phys
    this.el = document.getElementById('radioState');
    this.queue = []; this.current = null; this.history = []; this.recent = new Map();
    this.clock = 0; this.airT = 0; this.gapT = 0; this.bootT = 2.3; this.ambientT = 15 + Math.random() * 8; this.followupT = 22 + Math.random() * 16;
    this.enabled = false; this.started = false; this.lastAmbient = '';
    this.lastWeather = this.environment.key; this.lastRegion = null;
    this.lastEncounter = null; this.lastEncounterKnown = false; this.lastEncounterState = '';
    this.lastLawBand = 0; this.lastPursuit = false; this.lastPursuitUnits = 0; this.lastPursuitAviation = false; this.lastPursuitAviationVisual = false; this.lastCargo = false; this.lastDisabled = false;
  }

  intro() {
    const locals = this.reputation ? this.reputation.score('locals') : 0;
    if (locals >= 3) return ['CH 16', 'MARA KEENE · TOWER', 'Tower Boat, Mara here. Sixteen is open. The camps know your hull if you need them.'];
    if (locals <= -3) return ['CH 16', 'MARA KEENE · TOWER', 'Tower Boat, radio check. Keep sixteen clear, and do not make anybody come looking.'];
    return ['CH 16', 'MARA KEENE · TOWER', 'Tower Boat, this is Mara at the tower. Radio check. Channel sixteen stays open out here.'];
  }

  ambientPool() {
    const region = this.regions.current;
    const pool = region ? [...(REGION_TRAFFIC[region.id] || [])] : [];
    const working = this.game.life?.traffic?.radioPool?.() || [];
    for (const call of working) pool.push(call);
    const navigation = this.navigationAids?.radioPool?.() || [];
    for (const call of navigation) pool.push(call);
    const hour = this.environment.hour, night = hour < 5.5 || hour > 20.5;
    const locals = this.reputation ? this.reputation.score('locals') : 0;
    const fwc = this.reputation ? this.reputation.score('fwc') : 0;
    const runners = this.reputation ? this.reputation.score('runners') : 0;
    const flow = this.environment.tideRate >= 0 ? 'Flood is building' : 'Ebb is running';
    pool.push(['CH 68', 'MARA KEENE · TOWER', `${flow}. Set a second line if you stop in a narrow cut.`]);
    if (this.environment.tideRange > 0.94) pool.push(['CH 16', 'MARA KEENE · TOWER', 'Spring range is on. High water will cover the low banks, and the ebb will pull hard through the cuts.']);
    else if (this.environment.tideRange < 0.76) pool.push(['CH 68', 'JUNE BELL · SPLIT PINE', 'Neap range is on. The turn will be soft, and the back cuts will hold longer than usual.']);
    if (night) pool.push(['CH 16', 'MARA KEENE · TOWER', 'Dock lights are sparse tonight. Call the camp before you enter its basin.']);
    if (locals >= 3) pool.push(['CH 68', 'JUNE BELL · SPLIT PINE', 'Tower Boat, Split Pine heard what you did. Coffee is on if you pass this way.']);
    else if (locals <= -3) pool.push(['CH 68', 'CAMP RADIO', 'That tower airboat is in the district. Nobody give out a private cut.']);
    if (fwc >= 3) pool.push(['FWC TAC', 'WARDEN SOTO · FWC 27', 'Tower airboat is a known clean operator. No need to hold them unless something changes.']);
    else if (fwc <= -3) pool.push(['FWC TAC', 'WARDEN SOTO · FWC 27', 'All units, tower airboat is a flagged hull. Log location and direction of travel.']);
    if (runners >= 3) pool.push(['CH 72', 'CAL ROOK · LOST KEY', 'Tower Boat, the back line is clear. You can answer on seventy-two.']);
    else if (runners <= -3) pool.push(['CH 72', 'CAL ROOK · LOST KEY', 'Tower Boat, this is not your channel anymore.']);
    return pool;
  }

  encounterFollowupMessage(memory) {
    const place = memory.place || 'the berth';
    if (memory.outcome === 'distress-repaired') return { channel: 'CH 68', speaker: 'ELI · SKIFF 6', text: 'Tower Boat, Eli. Fuel line stayed clear all the way home. I owe you a dry one.' };
    if (memory.outcome === 'distress-berth') return { channel: 'CH 68', speaker: 'ELI · SKIFF 6', text: `${place} has me dry. Camp boat is going for my skiff at first light. I owe you.` };
    if (memory.outcome === 'surge-evacuation') return { channel: 'CH 68', speaker: 'MARA KEENE · TOWER', text: `Transfer from ${place} is logged clear. The resident is dry. Nobody goes back until the surge falls.` };
    if (memory.outcome === 'grounding-towed') return { channel: 'CH 68', speaker: 'LEON DOSS · OLD MILL', text: 'That skiff came home clean underneath. No cut in the bank where she sat. Good pull.' };
    if (memory.outcome === 'grounding-wait') return { channel: 'FWC TAC', speaker: 'FWC SHALLOW WATER', text: 'Grounded skiff floated on the flood. Lower unit is clean and the bank was not scarred.' };
    if (memory.outcome === 'grounding-scarred') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Fresh trench confirmed on the grounding bank. Coordinates and tower hull are in the habitat report.' };
    if (memory.outcome === 'grounding-flood') return { channel: 'CH 68', speaker: 'LOCAL SKIFF', text: 'Flood picked me up. I kept the motor high and backed into the old track by hand.' };
    if (memory.outcome === 'airrescue-clean') return { channel: 'CG 22A', speaker: 'SECTOR KEY WEST', text: 'Rescue 6507 is back with one survivor. Tower Boat gave them the strobe and kept the hover clean.' };
    if (memory.outcome === 'airrescue-delayed') return { channel: 'CG 22A', speaker: 'SECTOR KEY WEST', text: 'Survivor is stable after the air hoist. Small-boat traffic caused a reset before the final pickup.' };
    if (memory.outcome === 'fire-contained') return { channel: 'CH 16', speaker: 'WARDEN SOTO · FWC 27', text: `Disabled skiff is under tow from ${place}. Extinguisher stopped the fire before the portable tank opened. No sheen observed.` };
    if (memory.outcome === 'fire-evacuation') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: `Operator is safe at ${place}. Burned skiff is boomed off and the sheen is staying inside the cut.` };
    if (memory.outcome === 'manatee-rescued') return { channel: 'FWC TAC', speaker: 'FWC MANATEE RESCUE', text: 'Entanglement response is clear. The wrap came off the flipper in the field and the animal left under its own power.' };
    if (memory.outcome === 'manatee-line-cut') return { channel: 'FWC TAC', speaker: 'FWC MANATEE RESCUE', text: 'Team reacquired the manatee after the locator float was cut away. Body wrap remained in place; capture boat is taking over.' };
    if (memory.outcome === 'manatee-struck') return { channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: 'Wildlife response has the injured manatee. Tower airboat remains attached to the strike report.' };
    if (memory.outcome === 'spotlight-seized') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Blackout skiff is at the ramp. Long gun and untagged harvest gear are in evidence; the refuge animal stayed in the cut.' };
    if (memory.outcome === 'spotlight-warned') return { channel: 'CH 72', speaker: 'CAL ROOK · LOST KEY', text: 'Closed cut went quiet before twenty-seven arrived. The crew remembers the tower hull gave them water.' };
    if (memory.outcome === 'spotlight-spooked') return { channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'FWC checked the refuge cut after the warning shot. No dead animal located; blackout skiff remains unidentified.' };
    if (memory.outcome === 'spotlight-taken') return { channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: 'Evidence team found the take site in the closed cut. No tag, no restraint gear, no clean hull number.' };
    if (memory.outcome === 'spotlight-escaped') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Blackout skiff did not make the public ramp. Hull description stays active on the refuge file.' };
    if (memory.outcome === 'race-won') return { channel: 'CH 72', speaker: 'MUD HEN', text: 'Tower Boat ran all six clean. Money is paid. We will mark another cut when the tide turns.' };
    if (memory.outcome === 'race-dirty') return { channel: 'CH 72', speaker: 'MUD HEN', text: 'Tower Boat crossed first. My rub rail says half that purse came off their bow.' };
    if (memory.outcome === 'race-lost') return { channel: 'CH 72', speaker: 'MUD HEN', text: 'Six marks, one winner. Tower Boat knows which hull crossed first.' };
    if (memory.outcome === 'patrol-seizure') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Evidence bag from the tower airboat is aboard twenty-seven. Citation remains open.' };
    if (memory.outcome === 'patrol-cited') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Tower airboat stopped in the backcountry. Citation is written and the patrol is clear.' };
    if (memory.outcome === 'patrol-cleared') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Dispatch, twenty-seven. Tower airboat checked clean. Clear the stop.' };
    if (memory.outcome === 'patrol-escaped') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Tower airboat got into the narrow water. Keep the hull on the call sheet.' };
    if (memory.outcome === 'package-returned') return { channel: 'CH 72', speaker: 'CAL ROOK · LOST KEY', text: 'Parcel made it back unopened. Tower Boat kept their word.' };
    if (memory.outcome === 'package-taken') return { channel: 'CH 72', speaker: 'UNKNOWN SKIFF', text: 'Parcel is gone. Tower hull has it. That does not close the account.' };
    if (memory.outcome === 'salvage-cleared') return { channel: 'CH 68', speaker: 'JUNE BELL · SPLIT PINE', text: 'All three drums are on the rack at Split Pine. None split. Tower Boat got there in time.' };
    if (memory.outcome === 'salvage-spill') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Sheen position is logged. Response boat is carrying pads and boom. Keep traffic out of that cut.' };
    if (memory.outcome === 'net-evidence') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Monofilament, floats and two fish logged into evidence. That cut is open again.' };
    if (memory.outcome === 'net-removed') return { channel: 'CH 72', speaker: 'CAL ROOK · LOST KEY', text: 'Net boat is clear. No floats left in the cut. Leave it that way.' };
    if (memory.outcome === 'fuel-theft-stopped') return { channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Black johnboat is tied at the ramp. The work crew kept its fuel because Tower Boat held the moving position.' };
    if (memory.outcome === 'fuel-theft-driven-off') return { channel: 'CH 68', speaker: 'WORK SKIFF', text: 'Tower Boat, those cans got us home. The rub rail can be fixed. We will remember the hull that stayed.' };
    if (memory.outcome === 'fuel-theft-aided') return { channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: 'Work crew confirmed the tower airboat helped take two fuel cans. Keep that hull on the call sheet.' };
    if (memory.outcome === 'fuel-theft-missed') return { channel: 'CH 68', speaker: 'LEON DOSS · OLD MILL', text: 'Disabled work skiff made the dock under tow. Both fuel cans are still missing.' };
    return null;
  }

  encounterFollowup(memory) {
    const msg = this.encounterFollowupMessage(memory); if (!msg) return false;
    return this.transmit({ ...msg, priority: 1, key: `encounter-followup:${memory.id}`, cooldown: 99999 });
  }

  transmit({ channel = 'CH 16', speaker = 'RADIO', text, priority = 1, duration, key, cooldown = 45 } = {}) {
    if (!text) return false;
    const id = key || `${speaker}:${text}`;
    const heard = this.recent.get(id);
    if (heard != null && this.clock - heard < cooldown) return false;
    if (heard != null) this.recent.delete(id); // refresh insertion order before applying the bound
    this.recent.set(id, this.clock);
    while (this.recent.size > RECENT_LIMIT) this.recent.delete(this.recent.keys().next().value);
    const msg = { channel, speaker, text, priority, key: id, queuedAt: this.clock, duration: duration || clamp(3.4 + text.length * 0.028, 4.4, 7.6) };
    if (this.current && priority >= 3 && priority > this.current.priority) {
      this.audio.radio(false, this.current.priority); this.current = null; this.airT = 0; this.gapT = 0; this.el && this.el.classList.remove('on');
      this.begin(msg); return true;
    }
    if (priority <= 0 && (this.current || this.queue.some(q => q.priority <= 0))) return false;
    this.queue.push(msg); this.queue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    if (this.queue.length > 6) this.queue.length = 6;
    if (!this.current && this.gapT <= 0) this.next();
    return true;
  }

  begin(msg) {
    this.current = msg; this.airT = msg.duration;
    this.history.push({ ...msg, at: this.clock }); if (this.history.length > 24) this.history.shift();
    if (this.audio && this.audio.radio) this.audio.radio(true, msg.priority);
    if (!this.el) return;
    this.el.innerHTML = `<div class="radio-meta"><span>${esc(msg.channel)}</span><i>receiving</i></div><b>${esc(msg.speaker)}</b><p>${esc(msg.text)}</p>`;
    this.el.classList.toggle('urgent', msg.priority >= 3); this.el.classList.toggle('weather', msg.channel.startsWith('WX'));
    this.el.classList.add('on');
  }

  end() {
    if (!this.current) return;
    if (this.audio && this.audio.radio) this.audio.radio(false, this.current.priority);
    this.current = null; this.airT = 0; this.gapT = 0.85;
    if (this.el) this.el.classList.remove('on', 'urgent', 'weather');
  }

  next() {
    while (this.queue.length) {
      const msg = this.queue.shift();
      if (msg.priority < 3 && this.clock - msg.queuedAt > 28) continue;
      this.begin(msg); return;
    }
  }

  weatherCall(key) {
    const call = WEATHER_CALLS[key]; if (!call) return;
    const priority = key === 'hurricane' ? 4 : ['thunderstorm', 'hail', 'tropical'].includes(key) ? 3 : key === 'squall' ? 2 : 1;
    this.transmit({ channel: 'WX-3', speaker: call[0], text: call[1], priority, duration: priority >= 3 ? 7 : undefined, key: `weather:${key}`, cooldown: 90 });
  }

  hurricanePhaseCall(phase) {
    const text = HURRICANE_PHASE_CALLS[phase]; if (!text) return false;
    return this.transmit({ channel: 'WX-3', speaker: 'MARINE WX-3', text, priority: 4, duration: 7.6, key: `weather:hurricane:${phase}`, cooldown: 90 });
  }

  waterspoutCall() {
    return this.transmit({
      channel: 'WX-3', speaker: 'MARINE WX-3',
      text: 'Special marine warning. Waterspout reported in the backcountry. Small craft do not approach. If it bears down, turn ninety degrees off its apparent track.',
      priority: 4, duration: 7.4, key: `weather:waterspout:${Math.floor(this.clock / 30)}`, cooldown: 24,
    });
  }

  downburstCall() {
    return this.transmit({
      channel: 'WX-3', speaker: 'MARINE WX-3',
      text: 'Special marine warning. Wet downburst over the backcountry. Damaging wind is spreading out from the rain core. Small craft clear the open crossings now.',
      priority: 4, duration: 7.2, key: `weather:downburst:${Math.floor(this.clock / 30)}`, cooldown: 30,
    });
  }

  regionCall(region) {
    const text = REGION_ENTRY[region.id]; if (!text) return;
    this.transmit({ channel: 'CH 68', speaker: 'MARA KEENE · TOWER', text, priority: 1, key: `region:${region.id}`, cooldown: 150 });
  }

  encounterCall(e) {
    if (e.type === 'distress') {
      const evacuation = e.variant === 'surge-evacuation';
      this.transmit({
        channel: 'CH 16', speaker: evacuation ? `${e.campName} · CAMP RADIO` : e.recognized ? 'ELI · SKIFF 6' : 'DISTRESS SKIFF',
        text: evacuation ? `Tower Boat, water is across the low bank at ${e.campName}. I have one person on the dock. Get them to the ${e.drop?.name || 'high ground'} before the wind comes around.` : e.recognized ? 'Tower Boat, if that is you by the flare, I have a dead motor and I am drifting.' : 'Any vessel near the flare, dead motor and no steerage. One person aboard.',
        priority: evacuation ? 4 : 3, key: `encounter:${e.type}:${evacuation ? 'surge' : Math.floor(e.t)}`, cooldown: 20,
      });
    }
    else if (e.type === 'airrescue') this.transmit({ channel: 'CH 16', speaker: 'SECTOR KEY WEST', text: 'Rescue 6507 is working parallel tracks for one person in the water. Tower Boat, check the marked sector and report an exact position.', priority: 4, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'grounding') this.transmit({ channel: 'CH 16', speaker: e.recognized ? 'LEON DOSS · OLD MILL' : 'GROUNDED SKIFF', text: e.falling ? 'Hard aground on a falling tide. Motor is up. I need a slow stern pull or I wait for the flood.' : 'Hard aground on the bank. Motor is up and I am staying off the throttle.', priority: 3, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'fire') this.transmit({ channel: 'CH 16', speaker: 'BURNING SKIFF', text: 'Mayday, mayday. Outboard and portable tank are burning. One person pinned forward. Any vessel close, come in from the bow.', priority: 4, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'manatee') this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Tower Boat, that numbered float is moving with a manatee. Hold outside its turn, get the exact position, and call Wildlife Alert. Do not touch the gear.', priority: 3, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'spotlight') this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Black skiff is sweeping a closed refuge cut with no navigation lights. Long gun visible, no restraint line. Copy the hull and position; do not crowd them.', priority: 4, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'race') this.transmit({ channel: 'CH 72', speaker: 'MUD HEN', text: `Tower Boat, six marks through the cut. ${e.stake ? 'Hundred dollars down' : 'Open purse'}, first hull through all six. Keep it in the water.`, priority: 2, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'patrol') this.transmit({ channel: 'CH 16', speaker: 'WARDEN SOTO · FWC 27', text: e.state === 'pursuit' ? 'Tower airboat, you struck a patrol vessel. Stop your engine now.' : e.wanted ? 'Emerald airboat, reduce speed and hold your line. This is a directed stop.' : e.recognized ? 'Tower Boat, Soto on twenty-seven. Bring the prop to idle for a quick check.' : 'Airboat ahead, this is FWC twenty-seven. Idle and maintain your heading.', priority: e.wanted ? 4 : 3, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'smuggler') this.transmit({ channel: 'CH 72', speaker: 'CAL ROOK · LOST KEY', text: e.hostile ? 'Tower Boat. You know why that bundle is sitting where you can see it.' : e.trusted ? 'Tower Boat, Lost Key. The crew nearby knows your hull. Give them a clean signal.' : 'Somebody lost a parcel in your cut. Somebody else is still watching it.', priority: e.hostile ? 3 : 2, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'salvage') this.transmit({ channel: 'CH 16', speaker: 'JUNE BELL · SPLIT PINE', text: 'Skiff went down in that weather. Three fuel drums broke loose—pick them up before a root opens one.', priority: 2, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
    else if (e.type === 'netline') this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Tower Boat, those floats are holding a monofilament wall. Do not lift it. Mark the ends and call twenty-seven.', priority: 3, key: `encounter:${e.type}:${Math.floor(e.t)}`, cooldown: 20 });
  }

  encounterStateCall(e, state) {
    if (e.type === 'patrol' && state === 'pursuit') this.transmit({ channel: 'CH 16', speaker: 'WARDEN SOTO · FWC 27', text: 'Tower airboat, you are failing to stop. Patrol units switch to the back channels.', priority: 4, key: 'patrol:pursuit', cooldown: 50 });
    else if (e.type === 'race' && state === 'countdown') this.transmit({ channel: 'CH 72', speaker: 'MUD HEN', text: e.stake ? 'Money is down. Hold where you are. We go on the horn.' : 'Open purse. Hold where you are. We go on the horn.', priority: 2, key: 'race:countdown', cooldown: 40 });
    else if (e.type === 'race' && state === 'running') this.transmit({ channel: 'CH 72', speaker: 'MUD HEN', text: 'Horn. Run it.', priority: 3, key: 'race:running', cooldown: 40 });
    else if (e.type === 'smuggler' && state === 'chase') this.transmit({ channel: 'CH 72', speaker: 'UNKNOWN SKIFF', text: 'You picked up the wrong parcel. Put it in the water and turn away.', priority: 4, key: 'runners:chase', cooldown: 50 });
    else if (e.type === 'distress' && state === 'repair') this.transmit({ channel: 'CH 16', speaker: 'ELI · SKIFF 6', text: 'Hold her steady there. Fuel line is fouled; I need half a minute.', priority: 2, key: 'distress:repair', cooldown: 40 });
    else if (e.type === 'distress' && state === 'aboard') this.transmit({ channel: 'CH 16', speaker: e.variant === 'surge-evacuation' ? `${e.campName} · CAMP RADIO` : 'ELI · SKIFF 6', text: e.variant === 'surge-evacuation' ? `Tower Boat has them. Dock is clear. They are bound for the ${e.drop?.name || 'high ground'}.` : `I am aboard Tower Boat. We are running for ${e.drop?.name || 'a safe berth'}; the skiff is staying on the flare.`, priority: e.variant === 'surge-evacuation' ? 4 : 3, key: e.variant === 'surge-evacuation' ? 'distress:surge-aboard' : 'distress:aboard', cooldown: 40 });
    else if (e.type === 'grounding' && state === 'tow') this.transmit({ channel: 'CH 16', speaker: 'GROUNDED SKIFF', text: 'Stern line is fast. Keep the pull straight and slow. My outboard stays trimmed until the hull floats.', priority: 3, key: 'grounding:tow', cooldown: 40 });
    else if (e.type === 'grounding' && state === 'secured') this.transmit({ channel: 'FWC TAC', speaker: 'FWC SHALLOW WATER', text: 'Position copied. Leave the motor up and stay aboard. We will work the skiff on the flood.', priority: 3, key: 'grounding:secured', cooldown: 40 });
    else if (e.type === 'grounding' && state === 'depart') this.transmit({ channel: 'CH 16', speaker: 'GROUNDED SKIFF', text: 'Hull is floating. Line is clear and the outboard is down. I am opening the gap.', priority: 2, key: 'grounding:depart', cooldown: 40 });
    else if (e.type === 'airrescue' && state === 'approach') this.transmit({ channel: 'CG 22A', speaker: 'RESCUE 6507', text: 'Tower Boat, exact fix copied. We have the strobe. Hold fifty yards clear of our hover.', priority: 4, key: 'airrescue:approach', cooldown: 40 });
    else if (e.type === 'airrescue' && state === 'hoist') this.transmit({ channel: 'CG 22A', speaker: 'RESCUE 6507', text: 'Rescue swimmer going down. Keep the orange trail line free and stay outside the wash.', priority: 4, key: 'airrescue:hoist', cooldown: 40 });
    else if (e.type === 'airrescue' && state === 'goaround') this.transmit({ channel: 'CG 22A', speaker: 'RESCUE 6507', text: 'Wave off. Small boat under the cabin. Tower Boat, clear the hover while we reset.', priority: 4, key: `airrescue:goaround:${e.aborts}`, cooldown: 8 });
    else if (e.type === 'airrescue' && state === 'depart') this.transmit({ channel: 'CG 22A', speaker: 'RESCUE 6507', text: 'One survivor in the basket. Hoist is in and we are climbing out.', priority: 3, key: 'airrescue:depart', cooldown: 40 });
    else if (e.type === 'fire' && (state === 'suppressing' || state === 'suppressing-aboard')) this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Sweep the marine extinguisher across the base of the flame. Keep your prop out of the fuel and leave yourself room off the bow.', priority: 4, key: `fire:suppressing:${state}`, cooldown: 40 });
    else if (e.type === 'fire' && state === 'aboard') this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Operator is aboard Tower Boat. Tank is still heating—knock it down only if you can hold the bow safely; otherwise get clear.', priority: 4, key: 'fire:aboard', cooldown: 40 });
    else if (e.type === 'fire' && state === 'overboard') this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Fuel flash. I have one PFD in the water off the skiff. Tower Boat, idle approach; do not put the prop between you and him.', priority: 4, key: 'fire:overboard', cooldown: 40 });
    else if (e.type === 'fire' && (state === 'contained' || state === 'contained-aboard')) this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'No visible flame. Treat that tank as hot, get the operator off, and leave the disabled skiff for the tow crew.', priority: 3, key: `fire:contained:${state}`, cooldown: 40 });
    else if (e.type === 'fire' && state === 'rescued') this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: `Operator is clear. Run him to ${e.drop?.name || 'the nearest safe berth'}; FWC is taking the burned hull and sheen.`, priority: 3, key: 'fire:rescued', cooldown: 40 });
    else if (e.type === 'manatee' && state === 'reported') this.transmit({ channel: 'FWC TAC', speaker: 'FWC WILDLIFE ALERT', text: 'Exact position copied. Keep the animal in sight from outside its turn and update the moving fix. Rescue skiff is inbound. Do not cut or pull the trap line.', priority: 4, key: 'manatee:reported', cooldown: 40 });
    else if (e.type === 'manatee' && state === 'cutting') this.transmit({ channel: 'FWC TAC', speaker: 'FWC WILDLIFE ALERT', text: 'Tower Boat, stop handling that float. The visible line may be only part of the wrap. Back out and let trained rescuers take it.', priority: 4, key: 'manatee:cutting', cooldown: 40 });
    else if (e.type === 'manatee' && state === 'rescue') this.transmit({ channel: 'FWC TAC', speaker: 'FWC MANATEE RESCUE', text: 'Rescue skiff has the animal and float in sight. Tower Boat, hold outside our stern while the biologists work the flipper.', priority: 4, key: 'manatee:rescue', cooldown: 40 });
    else if (e.type === 'manatee' && state === 'released') this.transmit({ channel: 'FWC TAC', speaker: 'FWC MANATEE RESCUE', text: 'Wrap is clear and aboard. Animal is released on site and swimming on its own. Good moving fixes, Tower Boat.', priority: 3, key: 'manatee:released', cooldown: 40 });
    else if (e.type === 'manatee' && state === 'cut') this.transmit({ channel: 'FWC TAC', speaker: 'FWC WILDLIFE ALERT', text: 'Locator float just disappeared. The embedded wrap did not. All rescue units search from the tower boat’s last position.', priority: 4, key: 'manatee:cut', cooldown: 40 });
    else if (e.type === 'manatee' && state === 'struck') this.transmit({ channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: 'Protected animal strike at the entanglement scene. Rescue skiff continue in; law enforcement log the tower hull.', priority: 4, key: 'manatee:struck', cooldown: 40 });
    else if (e.type === 'spotlight' && state === 'reported') this.transmit({ channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: 'Hull and moving position copied. Tower Boat maintain visual without closing. Twenty-seven is coming dark from the river.', priority: 4, key: 'spotlight:reported', cooldown: 40 });
    else if (e.type === 'spotlight' && state === 'warned') this.transmit({ channel: 'CH 72', speaker: 'CAL ROOK · LOST KEY', text: 'Crew has your warning. Credit is on the ledger if the cut is empty when twenty-seven arrives.', priority: 3, key: 'spotlight:warned', cooldown: 40 });
    else if (e.type === 'spotlight' && state === 'spooked') this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Shot in the water, black skiff outbound. Animal submerged. Tower Boat hold your distance and copy the heading.', priority: 4, key: 'spotlight:spooked', cooldown: 40 });
    else if (e.type === 'spotlight' && state === 'taken') this.transmit({ channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: 'Single shot in the closed cut. Blacked-out skiff is outbound with an untagged animal. Units move to the public ramps.', priority: 4, key: 'spotlight:taken', cooldown: 40 });
    else if (e.type === 'spotlight' && state === 'seized') this.transmit({ channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Twenty-seven alongside. Long gun is secured; no harvest tags or restraint line aboard. Refuge cut is clear.', priority: 4, key: 'spotlight:seized', cooldown: 40 });
    else if (e.type === 'spotlight' && state === 'escaped') this.transmit({ channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Lost the blackout skiff at the split. Keep the hull description active and send a unit to the ramp.', priority: 3, key: 'spotlight:escaped', cooldown: 40 });
    else if (e.type === 'salvage' && state === 'spill') this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Sheen visible. Back clear, mark the position, and do not run the prop through it. I am calling twenty-seven.', priority: 4, key: 'salvage:spill', cooldown: 60 });
    else if (e.type === 'netline' && state === 'reported') this.transmit({ channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: 'Position copied. Leave the net set and keep clear of the float line. We need it intact for evidence.', priority: 3, key: 'netline:reported', cooldown: 40 });
    else if (e.type === 'netline' && state === 'tipped') this.transmit({ channel: 'CH 72', speaker: 'CAL ROOK · LOST KEY', text: 'Crew has the cut. Do not touch the floats and do not be there when the net comes aboard.', priority: 3, key: 'netline:tipped', cooldown: 40 });
    else if (e.type === 'netline' && state === 'recovering') this.transmit({ channel: e.choice === 'fwc' ? 'FWC TAC' : 'CH 72', speaker: e.choice === 'fwc' ? 'WARDEN SOTO · FWC 27' : 'NET CREW', text: e.choice === 'fwc' ? 'We have both ends. Hold outside our stern while we bag the line.' : 'Float line is coming in. Clear our wake and forget the set.', priority: 3, key: `netline:recovering:${e.choice}`, cooldown: 40 });
    else if (e.type === 'netline' && state === 'secured') this.transmit({ channel: e.choice === 'fwc' ? 'FWC TAC' : 'CH 72', speaker: e.choice === 'fwc' ? 'WARDEN SOTO · FWC 27' : 'CAL ROOK · LOST KEY', text: e.choice === 'fwc' ? 'Net, floats and catch are secured as evidence. Tower Boat can clear the scene.' : 'The cut is clean. No net, no floats, no reason to answer sixteen.', priority: 2, key: `netline:secured:${e.choice}`, cooldown: 40 });
  }

  observe() {
    const weather = this.environment.key;
    if (weather !== this.lastWeather) { this.weatherCall(weather); this.lastWeather = weather; }

    const region = this.regions.current;
    if (region && this.lastRegion && region.id !== this.lastRegion) this.regionCall(region);
    if (region) this.lastRegion = region.id;

    const e = this.encounters.active;
    if (e !== this.lastEncounter) {
      this.lastEncounter = e; this.lastEncounterKnown = Boolean(e && e.known); this.lastEncounterState = e ? e.state : '';
      if (e && e.known) this.encounterCall(e);
    } else if (e) {
      if (e.known && !this.lastEncounterKnown) this.encounterCall(e);
      if (e.state !== this.lastEncounterState) this.encounterStateCall(e, e.state);
      this.lastEncounterKnown = Boolean(e.known); this.lastEncounterState = e.state;
    }

    const cargo = this.law.hasContraband(), cargoFresh = cargo && !this.lastCargo;
    const band = this.law.attention > 0.04 ? Math.ceil(this.law.attention) : 0;
    if (band > this.lastLawBand && band >= 2 && !this.law.pursuit && !cargoFresh) {
      this.transmit({ channel: 'FWC TAC', speaker: 'WARDEN SOTO · FWC 27', text: `All units, log the tower airboat. Last report: ${this.law.lastReason || 'unconfirmed activity in the backcountry'}.`, priority: band >= 4 ? 4 : 3, key: `law:${band}:${this.law.lastReason}`, cooldown: 35 });
    }
    this.lastLawBand = band;
    if (this.law.pursuit && !this.lastPursuit) this.transmit({ channel: 'FWC TAC', speaker: 'FWC DISPATCH', text: 'Twenty-seven is in pursuit of the tower airboat. Backcountry units hold the river exits.', priority: 4, key: 'law:pursuit', cooldown: 60 });
    this.lastPursuit = this.law.pursuit;
    const pursuitUnits = e?.type === 'patrol' && e.state === 'pursuit' ? Math.max(1, Number(e.units) || 1) : 0;
    if (pursuitUnits > this.lastPursuitUnits) {
      if (pursuitUnits >= 3) this.transmit({ channel: 'FWC TAC', speaker: 'SHALLOW WATER 4', text: 'Twenty-seven, I am on the opposite bank. Closing the gap now.', priority: 4, key: 'law:backup:3', cooldown: 35 });
      else if (pursuitUnits >= 2) this.transmit({ channel: 'FWC TAC', speaker: 'MARINE 12', text: 'Twenty-seven, Marine Twelve entering the next cut. I have the bow.', priority: 4, key: 'law:backup:2', cooldown: 35 });
    }
    this.lastPursuitUnits = pursuitUnits;
    const pursuitAviation = Boolean(e?.type === 'patrol' && e.state === 'pursuit' && e.aviationActive), aviationVisual = pursuitAviation && Boolean(e.aviationVisual);
    if (pursuitAviation && !this.lastPursuitAviation) this.transmit({ channel: 'FWC TAC', speaker: 'FWC AIR 2', text: 'Twenty-seven, Air Two has the tower hull. I will hold the next cut and call the turns.', priority: 4, key: 'law:aviation:arrived', cooldown: 60 });
    else if (pursuitAviation && this.lastPursuitAviation && this.lastPursuitAviationVisual && !aviationVisual) this.transmit({ channel: 'FWC TAC', speaker: 'FWC AIR 2', text: 'Twenty-seven, Air Two lost the hull under the canopy. Orbiting the last fix.', priority: 4, key: 'law:aviation:lost', cooldown: 45 });
    this.lastPursuitAviation = pursuitAviation; this.lastPursuitAviationVisual = aviationVisual;

    if (cargoFresh) this.transmit({ channel: 'CH 72', speaker: 'CAL ROOK · LOST KEY', text: 'Keep that package off sixteen. Too many uniforms have their radios open.', priority: 3, key: 'cargo:hot', cooldown: 90 });
    this.lastCargo = cargo;

    const disabled = this.condition.needsTow();
    if (disabled && !this.lastDisabled) this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Tower Boat, copy disabled hull. Kill the battery, stay with the boat, and give me water around you.', priority: 4, key: 'boat:disabled', cooldown: 90 });
    this.lastDisabled = disabled;
  }

  sample(kind = 'ambient') {
    if (kind === 'weather') { this.weatherCall(this.environment.key); return; }
    if (kind === 'emergency') { this.transmit({ channel: 'CH 16', speaker: 'MARA KEENE · TOWER', text: 'Tower Boat, break traffic. Waterspout reported in your cut. Turn away from the dark water.', priority: 4, key: `debug:emergency:${this.clock}`, cooldown: 0 }); return; }
    const list = this.ambientPool(); if (list.length) { const [channel, speaker, text] = pick(list); this.transmit({ channel, speaker, text, priority: 0, key: `debug:${this.clock}`, cooldown: 0 }); }
  }

  update(dt, enabled = true) {
    if (!enabled) { this.enabled = false; return; }
    if (!this.enabled) {
      this.enabled = true; this.lastWeather = this.environment.key; this.lastRegion = this.regions.current ? this.regions.current.id : null;
      this.lastLawBand = this.law.attention > 0.04 ? Math.ceil(this.law.attention) : 0; this.lastPursuit = this.law.pursuit;
      const e = this.encounters.active; this.lastPursuitUnits = e?.type === 'patrol' && e.state === 'pursuit' ? Math.max(1, Number(e.units) || 1) : 0;
      this.lastPursuitAviation = Boolean(e?.type === 'patrol' && e.state === 'pursuit' && e.aviationActive); this.lastPursuitAviationVisual = this.lastPursuitAviation && Boolean(e.aviationVisual);
      this.lastCargo = this.law.hasContraband(); this.lastDisabled = this.condition.needsTow();
    }
    this.clock += dt; this.observe();

    if (this.bootT > 0) {
      this.bootT -= dt;
      if (this.bootT <= 0 && !this.started) {
        this.started = true; const [channel, speaker, text] = this.intro();
        this.transmit({ channel, speaker, text, priority: 2, key: 'radio:intro', cooldown: 99999 });
      }
    }

    this.followupT -= dt;
    if (this.followupT <= 0 && this.started && !this.current && !this.queue.length && !this.game.state && !this.encounters.active && !this.incidents?.active && !this.story?.busy()) {
      const log = this.game.save.encounterMemory || [];
      const memory = log.find(entry => !entry.followed && this.encounterFollowupMessage(entry));
      if (memory && this.encounterFollowup(memory)) { memory.followed = true; memory.followedDay = this.environment.day; memory.followedHour = Math.round(this.environment.hour * 10) / 10; this.game.persist(); }
      this.followupT = memory ? 38 + Math.random() * 24 : 20;
    }

    this.ambientT -= dt;
    if (this.ambientT <= 0 && !this.game.state && !this.encounters.active && !this.incidents?.active && !this.story?.busy()) {
      const pool = this.ambientPool(); let call = pool.length ? pick(pool) : null;
      if (pool.length > 1 && call && `${call[1]}:${call[2]}` === this.lastAmbient) call = pool[(pool.indexOf(call) + 1) % pool.length];
      if (call) {
        const [channel, speaker, text] = call; this.lastAmbient = `${speaker}:${text}`;
        this.transmit({ channel, speaker, text, priority: 0, key: `ambient:${speaker}:${text}`, cooldown: 180 });
      }
      const storm = this.environment.values.storm || 0;
      this.ambientT = (storm > 0.7 ? 25 : 38) + Math.random() * (storm > 0.7 ? 20 : 34);
    }

    if (this.current) { this.airT -= dt; if (this.airT <= 0) this.end(); }
    else if (this.gapT > 0) { this.gapT -= dt; if (this.gapT <= 0) this.next(); }
    else this.next();
  }
}
