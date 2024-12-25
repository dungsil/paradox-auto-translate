// noinspection SpellCheckingInspection
const dictionaries: Record<string, string> = {
  anuket: '아누케트',
  'basic skill': '기본 능력',
  blemmye: '블렘미',
  blemmyes: '블렘미',
  blemmyae: '블렘미',
  chios: '히오스',
  duke: '공작',
  elephantine: '엘레판티네',
  hexi: '하서',
  'high king': '고왕',
  'historical context:': '역사적 배경:',
  hoftag: '궁중의회',
  horus: '호루스',
  imhotep: '임호테프',
  isis: '이시스',
  italienzug: '이탈리엔추크',
  kalabsha: '칼라브샤',
  karakoram: '카라코람',
  khnum: '크눔',
  king: '왕',
  mandulis: '만둘리스',
  mastic: '유향',
  osiris: '오시리스',
  philae: '필레',
  satet: '사티스',
  satis: '사티스',
  satjit: '사티스',
  senate: '원로원',
  stewardship: '관리력',
  tutu: '투투',
  wakhan: '와한',
  watchposts: '감시 초소',
  wenmo: '올말',
  zhebu: '절포',
  xxxxx: 'xxxxx', // RICE, VIET 에서 사용하는 플레이스 홀더로 API 요청 되지 않도록 사전에 추가
}

export function hasDictionary (key: string) {
  return Object.hasOwn(dictionaries, normalizeKey(key))
}

export function getDictionary (key: string): string | null {
  return dictionaries[normalizeKey(key)] || null
}

export function getTranslationMemories (): string {
  return Object.keys(dictionaries).map((key) => ` - "${key}" → "${dictionaries[key]}"`).join('\n')
}

function normalizeKey (key: string): string {
  return key.toLowerCase()
}
