import { pRateLimit } from 'p-ratelimit'
import { log, model, PROMPT, sleep } from '.'

const limiter = pRateLimit({
  interval: 60000,
  rate: 15,
  concurrency: 2,
})

const dictionaries: Record<string, string> = {
  xxxxx: 'xxxxx', // RICE, VIET 에서 사용하는 플레이스 홀더로 API 요청 되지 않도록 사전에 추가
}

export async function translate (text: string | null): Promise<string | null> {
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
    const { response } = await limiter(async () => await model.generateContent([PROMPT, text]))
    const translated = response.text()
    log.debug(`Translation: "${text}" -> "${translated}"`)

    return translated
  } catch (e) {
    log.error(`Translation failed: "${text}"`, e)

    await sleep(60000) // 1분 대기 후 재시도
    return translate(text)
  }
}
