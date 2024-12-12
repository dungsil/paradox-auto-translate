import { pRateLimit } from 'p-ratelimit'
import { log, model, PROMPT } from '.'

export type Mode = 'ck3' | 'vic3' | 'stellaris'

const limiter = pRateLimit({
  interval: 60000,
  rate: 10,
  concurrency: 1,
  maxDelay: 60000,
})

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

  // '$variable$' 형식의 문자열은 번역하지 않음
  if (/^\$[^$]+\$$/.test(text)) {
    return text
  }

  // 단어사전 검색
  if (Object.keys(dictionaries).includes(text)) {
    return dictionaries[text]!!
  }

  try {
    log.debug(`Translating: ${text}`)

    const { response } = await limiter(async () => await model.generateContent([PROMPT, text]))
    return response.text()
  } catch (e) {
    log.error(`Translation failed: ${text}`, e)
    return text
  }
}
