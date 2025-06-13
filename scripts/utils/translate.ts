import { translateAI } from './ai'
import { getCache, hasCache, setCache } from './cache'
import { getDictionary, hasDictionary } from './dictionary'
import { log } from './logger.js'
import { type GameType } from './prompts'

const INNER_FUNCTION_REGEX = /^\[([\w.]+(?:\|[\w.]+)?|[\w.]+\.[\w.]+\(['\w.]+'\))]$/
const VARIABLE_REGEX = /^\$[a-zA-Z0-9_\-.]+\$$/
const INVALID_TRANSLATION_REGEX = /\[[가-힣]/g

export async function translate (text: string, gameType: GameType = 'ck3', retry: number = 0): Promise<string> {

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

  // 단어 사전에 있는 경우 즉시 반환 (동기적 조회)
  if (hasDictionary(normalizedText, gameType)) {
    return getDictionary(normalizedText, gameType)!
  }

  // 캐시 조회 (비동기)
  const cachedResult = await getCache(normalizedText, gameType)
  if (cachedResult !== null) {
    return cachedResult
  }

  // 실제 AI 번역 요청
  const translatedText = await translateAI(text, gameType)

  // 잘못된 결과 검증 (조기 반환으로 최적화)
  const lowerTranslated = translatedText.toLowerCase()
  if (lowerTranslated.includes('language model') || INVALID_TRANSLATION_REGEX.test(translatedText)) {
    return await translate(text, gameType, retry + 1)
  }

  await setCache(text, translatedText, gameType)
  return translatedText
}
