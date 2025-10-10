import { translateAI } from './ai'
import { getCache, hasCache, setCache } from './cache'
import { getDictionary, hasDictionary } from './dictionary'
import { log } from './logger.js'
import { type GameType } from './prompts'
import { validateTranslation } from './translation-validator'

const INNER_FUNCTION_REGEX = /^\[([\w.]+(?:\|[\w.]+)?|[\w.]+\.[\w.]+\(['\w.]+'\))]$/
const VARIABLE_REGEX = /^\$[a-zA-Z0-9_\-.]+\$$/

export async function translate (text: string, gameType: GameType = 'ck3', retry: number = 0): Promise<string> {

  if (retry > 5) {
    throw new Error(`번역 재시도 횟수 초과 (대상 텍스트: "${text}")`)
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
  if (hasDictionary(normalizedText, gameType)) {
    return getDictionary(normalizedText, gameType)!
  }

  // 캐시에 이미 번역된 텍스트가 있는 경우 캐시에서 반환
  if (await hasCache(normalizedText, gameType)) {
    const cached = await getCache(normalizedText, gameType)
    if (cached) return cached
  }

  // 실제 AI 번역 요청
  const translatedText = await translateAI(text, gameType)

  // 잘못된 결과 재 번역 시도
  if (translatedText.toLowerCase().includes('language model')) {
    log.info('잘못 번역된 문자열: "', normalizedText, '" -> "', translatedText, '"')
    return await translate(text, gameType, retry + 1)
  }

  // 번역 유효성 검증 (translation-validator.ts의 통합 로직 사용)
  const validation = validateTranslation(normalizedText, translatedText, gameType)
  
  if (!validation.isValid) {
    log.warn(`번역 검증 실패 (재번역): "${normalizedText}" -> "${translatedText}" (사유: ${validation.reason})`)
    return await translate(text, gameType, retry + 1)
  }

  await setCache(text, translatedText, gameType)
  return translatedText
}
