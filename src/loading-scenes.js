export const LOADING_SCENES = Object.freeze([
  Object.freeze({
    id: 'gator-overtime',
    src: 'loading/gator-overtime.webp',
    title: '악어의 야근',
    note: '모두 퇴근했는데 악어만 남아 있어요.',
    district: '톱블레이드 랜딩',
    accent: '#e7a34d',
    position: 'center center',
    mobilePosition: '72% center',
  }),
  Object.freeze({
    id: 'dockside-trouble',
    src: 'loading/dockside-trouble.webp',
    title: '독가의 사건',
    note: '뭘 삼킨 건지 묻는다고 추가 요금을 받는다.',
    district: '사이프러스 훅',
    accent: '#e06a56',
    position: 'center center',
    mobilePosition: '73% center',
  }),
  Object.freeze({
    id: 'blue-water',
    src: 'loading/blue-water.webp',
    title: '블루 워터',
    note: '사이렌이 울리면 수로가 좁아진다.',
    district: '블랙워터 컷',
    accent: '#71b6e4',
    position: 'center center',
    mobilePosition: '75% center',
  }),
  Object.freeze({
    id: 'pressure-drop',
    src: 'loading/pressure-drop.webp',
    title: '기압 하강',
    note: '현지의자보다 먼저 정원 의자가 떠났다.',
    district: '맹그로브 리치',
    accent: '#cad17a',
    position: 'center center',
    mobilePosition: '74% center',
  }),
  Object.freeze({
    id: 'redline-run',
    src: 'loading/redline-run.webp',
    title: '레드라인 질주',
    note: '현명한 돈은 독에 머물렀다.',
    district: '레드그래스 컷',
    accent: '#f0a55c',
    position: 'center center',
    mobilePosition: '72% center',
  }),
  Object.freeze({
    id: 'midnight-pickup',
    src: 'loading/midnight-pickup.webp',
    title: '자정 픽업',
    note: "The cooler's cold. The cash isn't.",
    district: 'Oyster Key',
    accent: '#b888ef',
    position: 'center center',
    mobilePosition: '73% center',
  }),
]);

const randomIndex = (length, random) => Math.min(length - 1, Math.floor(Math.max(0, Math.min(0.999999, Number(random()) || 0)) * length));

export function initialLoadingSceneIndex({ requested = '', saveData = false, random = Math.random } = {}) {
  const requestedIndex = LOADING_SCENES.findIndex(scene => scene.id === requested);
  if (requestedIndex >= 0) return requestedIndex;
  return saveData ? 0 : randomIndex(LOADING_SCENES.length, random);
}

export function shuffledLoadingSceneIndices(currentIndex = -1, random = Math.random) {
  const indices = LOADING_SCENES.map((_, index) => index).filter(index => index !== currentIndex);
  for (let index = indices.length - 1; index > 0; index--) {
    const swapIndex = randomIndex(index + 1, random);
    [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
  }
  return indices;
}

export function loadingAssetUrl(src, baseUrl) {
  return new URL(src, baseUrl).href;
}
