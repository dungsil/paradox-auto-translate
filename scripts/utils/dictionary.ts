// noinspection SpellCheckingInspection
import { type GameType } from './prompts'

// CK3 전용 딕셔너리
const ck3Dictionaries: Record<string, string> = {
  'af Möre': '아프 뫼레',
  'af Fasge': '아프 파스게',
  anuket: '아누케트',
  'basic skill': '기본 능력',
  blemmye: '블렘미',
  blemmyes: '블렘미',
  blemmyae: '블렘미',
  blunder: '실수',
  character: '인물',
  casual: '무관심',
  chios: '히오스',
  duke: '공작',
  elephantine: '엘레판티네',
  excellent: '훌륭하군',
  'excellent!': '훌륭하군!',
  ganger: '갱어',
  hexi: '하서',
  'high king': '고왕',
  'historical context:': '역사적 배경:',
  hoftag: '궁중의회',
  horus: '호루스',
  imhotep: '임호테프',
  isis: '이시스',
  italienzug: '이탈리엔추크',
  'i look forward to seeing the final result!': '최종 결과물이 기대되는 군!',
  kalabsha: '칼라브샤',
  karakoram: '카라코람',
  khnum: '크눔',
  king: '왕',
  landless: '비지주',
  'let\'s get started!': '시작해보지!',
  mandulis: '만둘리스',
  mastic: '유향',
  ok: '네',
  osiris: '오시리스',
  philae: '필레',
  RICE: 'RICE',
  satet: '사티스',
  satis: '사티스',
  satjit: '사티스',
  senate: '원로원',
  sinhala: '싱할라어',
  stewardship: '관리력',
  tutu: '투투',
  'very good': '아주 좋군',
  'very good!': '아주 좋군!',
  VIET: 'VIET',
  wakhan: '와한',
  watchposts: '감시 초소',
  wenmo: '올말',
  zhebu: '절포',

  xxxxx: 'xxxxx', // RICE, VIET 에서 사용하는 플레이스 홀더로 API 요청 되지 않도록 사전에 추가
}

// Stellaris 전용 딕셔너리
const stellarisDictionaries: Record<string, string> = {
  empire: '제국',
  federation: '연방',
  unity: '통합',
  influence: '영향력',
  'science ship': '과학선',
  'research station': '연구소',
  ok: '네',
  pop: '팝',
  'living metal': '생체 금속',
  zro: '즈로',
}

// VIC3 전용 딕셔너리
const vic3Dictionaries: Record<string, string> = {
  ok: '네',
}

export function getDictionaries(gameType: GameType): Record<string, string> {
  switch (gameType) {
    case 'ck3':
      return ck3Dictionaries
    case 'stellaris':
      return stellarisDictionaries
    case 'vic3':
      return vic3Dictionaries
    default:
      throw new Error(`Unsupported game type: ${gameType}`)
  }
}

export function hasDictionary (key: string, gameType: GameType = 'ck3') {
  const dictionaries = getDictionaries(gameType)
  return Object.hasOwn(dictionaries, normalizeKey(key))
}

export function getDictionary (key: string, gameType: GameType = 'ck3'): string | null {
  const dictionaries = getDictionaries(gameType)
  return dictionaries[normalizeKey(key)] || null
}

export function getTranslationMemories (gameType: GameType = 'ck3'): string {
  const dictionaries = getDictionaries(gameType)
  return Object.keys(dictionaries).map((key) => ` - "${key}" → "${dictionaries[key]}"`).join('\n')
}

function normalizeKey (key: string): string {
  return key.toLowerCase()
}
