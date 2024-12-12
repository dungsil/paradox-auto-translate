export type Mode = 'ck3' | 'vic3' | 'stellaris'

const dictionaries: Record<string, string> = {
  xxxxx: 'xxxxx', // RICE, VIET 에서 사용하는 플레이스 홀더로 API 요청 되지 않도록 사전에 추가
}

export async function translate (text: string | null, mode: Mode): Promise<string | null> {
  if (text === null) {
    return null
  }

  if (text.trim() === '') {
    return ''
  }

  if (Object.keys(dictionaries).includes(text)) {
    return dictionaries[text]!!
  }
}
