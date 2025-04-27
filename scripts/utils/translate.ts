import { translateAI } from './ai'
import { getCache, hasCache, setCache } from './cache'
import { getDictionary, hasDictionary } from './dictionary'
import { log } from './logger.js'

const INNER_FUNCTION_REGEX = /^\[([\w.]+(?:\|[\w.]+)?|[\w.]+\.[\w.]+\(['\w.]+'\))]$/
const VARIABLE_REGEX = /^\$[a-zA-Z0-9_\-.]+\$$/

export async function translate (text: string, retry: number = 0): Promise<string> {

  if (retry > 5) {
    log.error('재시도 횟수 초과로 종료, 대상 텍스트: "', text, '"')
    process.exit(-1)
  }

  // 잘못된 형식인 경우 빈 텍스트 반환
  if (!text) {
    return ''
  }

  // 공백인 경우 빈 텍스트 반환
  if (text.trim() === '') {
    return ''
  }

  const normalizedText = text.trim()

  // 변수만 있는 경우 그대로 반환
  if (INNER_FUNCTION_REGEX.test(normalizedText) || VARIABLE_REGEX.test(normalizedText)) {
    return normalizedText
  }

  // 단어 사전에 있는 경우 캐시에 저장하고 반환
  if (hasDictionary(normalizedText)) {
    return getDictionary(normalizedText)!
  }

  // 캐시에 이미 번역된 텍스트가 있는 경우 캐시에서 반환
  if (await hasCache(normalizedText)) {
    return await getCache(normalizedText)!
  }

  // 실제 AI 번역 요청
  const translatedText = await translateAI(text)

  // 잘못된 결과 재 번역 시도
  if (
    translatedText.toLowerCase().includes('language model') ||
    translatedText.match(/\[[가-힣]/g)
  ) {
    return await translateAI(text, retry++)
  }

  await setCache(text, translatedText)
  return translatedText
}
