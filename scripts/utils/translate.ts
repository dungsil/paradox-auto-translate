import { translateAI } from './ai'
import { getCache, hasCache, removeCache, setCache } from './cache'
import { getDictionary, hasDictionary } from './dictionary'
import { log } from './logger.js'
import { type GameType } from './prompts'
import { validateTranslation } from './translation-validator'

/**
 * Regex patterns for detecting variable-only text that should be returned immediately without AI translation.
 * 
 * These patterns match game variables and formatting markers that must be preserved exactly as-is.
 * When text matches any of these patterns, it's returned immediately without calling the AI API.
 * 
 * Supported patterns:
 * - $variable$: Dollar-wrapped variables (e.g., $k_france$, $country_name$)
 * - £variable£: Pound-wrapped variables for currency/resources (e.g., £gold£, £money£)
 * - @variable@: At-wrapped variables for icons (e.g., @crown_icon@, @goods_icon@)
 * - <variable>: Angle bracket variables for Stellaris (e.g., <democratic_gen>)
 * - [function]: Square bracket functions/variables (e.g., [GetTitle], [culture|E], [owner.GetName])
 * - #format#: Hash-wrapped formatting markers (e.g., #bold#, #italic#!)
 */
const DOLLAR_VARIABLE_REGEX = /^\$[a-zA-Z0-9_\-.]+\$$/           // $variable$
const POUND_VARIABLE_REGEX = /^£[a-zA-Z0-9_\-.]+£$/              // £variable£ (currency/resources)
const AT_VARIABLE_REGEX = /^@[a-zA-Z0-9_\-.]+@$/                 // @variable@ (icons)
const ANGLE_VARIABLE_REGEX = /^<[a-zA-Z0-9_\-.]+>$/              // <variable> (Stellaris)
const SQUARE_BRACKET_REGEX = /^\[(?:[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*|\w+\|\w+)\]$/ // [Function], [object.Method], [variable|E]
const HASH_FORMAT_REGEX = /^#[a-zA-Z_]+#!?$/                     // #formatting# or #formatting#!

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

  // 변수만 있는 경우 그대로 반환 (AI 호출 없이 즉시 리턴)
  // Supports: $var$, £var£, @var@, <var>, [function], #format#
  if (
    DOLLAR_VARIABLE_REGEX.test(normalizedText) ||
    POUND_VARIABLE_REGEX.test(normalizedText) ||
    AT_VARIABLE_REGEX.test(normalizedText) ||
    ANGLE_VARIABLE_REGEX.test(normalizedText) ||
    SQUARE_BRACKET_REGEX.test(normalizedText) ||
    HASH_FORMAT_REGEX.test(normalizedText)
  ) {
    return normalizedText
  }

  // 단어 사전에 있는 경우 캐시에 저장하고 반환
  if (hasDictionary(normalizedText, gameType)) {
    return getDictionary(normalizedText, gameType)!
  }

  // 캐시에 이미 번역된 텍스트가 있는 경우 캐시에서 반환
  if (await hasCache(normalizedText, gameType)) {
    const cached = await getCache(normalizedText, gameType)

    if (cached) {
      const { isValid } =  validateTranslation(normalizedText, cached, gameType)
      if (isValid) {
        return cached
      }

      // 잘못 저장된 캐시는 제거
      await removeCache(normalizedText, gameType)
    }
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
