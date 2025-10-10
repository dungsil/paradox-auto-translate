import { translateAI } from './ai'
import { getCache, hasCache, setCache } from './cache'
import { getDictionary, hasDictionary } from './dictionary'
import { log } from './logger.js'
import { type GameType } from './prompts'

const INNER_FUNCTION_REGEX = /^\[([\w.]+(?:\|[\w.]+)?|[\w.]+\.[\w.]+\(['\w.]+'\))]$/
const VARIABLE_REGEX = /^\$[a-zA-Z0-9_\-.]+\$$/

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
    const hasKoreanInGameVariables = translationGameVariables.some(variable => 
      /[가-힣]/.test(variable)
    )
    
    if (hasKoreanInGameVariables) {
      log.warn('게임 변수 내 한글 감지 (잘못된 번역): "', normalizedText, '" -> "', translatedText, '"')
      return await translate(text, gameType, retry + 1)
    }
  }

  await setCache(text, translatedText, gameType)
  return translatedText
}
