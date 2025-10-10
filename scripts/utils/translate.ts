import { translateAI } from './ai'
import { getCache, hasCache, setCache } from './cache'
import { getDictionary, hasDictionary } from './dictionary'
import { log } from './logger.js'
import { type GameType } from './prompts'

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
    return await getCache(normalizedText, gameType)!
  }

  // 실제 AI 번역 요청
  const translatedText = await translateAI(text, gameType)

  // 잘못된 결과 재 번역 시도
  if (translatedText.toLowerCase().includes('language model')) {
    log.info('잘못 번역된 문자열: "', normalizedText, '" -> "', translatedText, '"')
    return await translate(text, gameType, retry + 1)
  }

  // LLM이 불필요한 응답을 포함했는지 검사
  const unwantedPhrases = [
    '네, 알겠습니다',
    '네 알겠습니다',
    '요청하신',
    '번역입니다',
    'yes, i understand',
    'here is the translation',
    'here\'s the translation'
  ]
  const hasUnwantedPhrase = unwantedPhrases.some(phrase => 
    translatedText.toLowerCase().includes(phrase.toLowerCase())
  )
  
  if (hasUnwantedPhrase) {
    log.warn('불필요한 응답 감지 (재번역): "', normalizedText, '" -> "', translatedText, '"')
    return await translate(text, gameType, retry + 1)
  }

  // 기술 식별자(snake_case)가 번역되었는지 검사
  // 원본에 언더스코어가 포함된 단어가 있으면 번역본에도 동일하게 있어야 함
  const technicalIdentifiers = normalizedText.match(/\b[a-z]+(?:_[a-z]+)+\b/gi) || []
  if (technicalIdentifiers.length > 0) {
    const allIdentifiersPreserved = technicalIdentifiers.every(identifier => 
      translatedText.includes(identifier)
    )
    
    if (!allIdentifiersPreserved) {
      log.warn('기술 식별자 번역 감지 (재번역): "', normalizedText, '" -> "', translatedText, '"')
      return await translate(text, gameType, retry + 1)
    }
  }

  // 대괄호 내부의 게임 변수가 번역되었는지 검사 (|E 또는 함수 호출 패턴이 있는 경우만)
  const gameVariablePattern = /\[([^\]]*(?:\|[A-Z]|Get[A-Z][^\]]*|[a-z_]+_i))\]/g
  const sourceGameVariables = text.match(gameVariablePattern) || []
  const translationGameVariables = translatedText.match(gameVariablePattern) || []
  
  // 원본에 게임 변수가 있는 경우에만 검증
  if (sourceGameVariables.length > 0) {
    // 게임 변수 개수가 다르면 재번역
    if (sourceGameVariables.length !== translationGameVariables.length) {
      log.warn('게임 변수 불일치 감지: "', normalizedText, '" -> "', translatedText, '"')
      return await translate(text, gameType, retry + 1)
    }

    // 게임 변수 내부에 한글이 있으면 잘못 번역된 것
    // 단, 문자열 리터럴 내부('...' 또는 "...")의 한글은 허용
    const hasKoreanInGameVariables = translationGameVariables.some(variable => {
      // 문자열 리터럴을 제거한 후 한글 체크
      const withoutStringLiterals = variable.replace(/(['"])(?:(?!\1).)*?\1/g, '')
      return /[가-힣]/.test(withoutStringLiterals)
    })
    
    if (hasKoreanInGameVariables) {
      log.warn('게임 변수 내 한글 감지 (잘못된 번역): "', normalizedText, '" -> "', translatedText, '"')
      return await translate(text, gameType, retry + 1)
    }
  }

  await setCache(text, translatedText, gameType)
  return translatedText
}
