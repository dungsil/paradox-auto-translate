import { log } from './logger'
import { type GameType } from './prompts'

/**
 * 번역 검증 규칙:
 * 1. 불필요한 응답 (예: "네, 알겠습니다", "Yes, I understand" 등)
 * 2. 기술 식별자 (snake_case) 보존
 * 3. 게임 변수 (대괄호 내부) 보존 및 한글 포함 여부
 */

interface ValidationResult {
  isValid: boolean
  reason?: string
}

/**
 * 번역이 유효한지 검증합니다.
 * issue #64에서 추가된 검증 로직을 기반으로 합니다.
 */
export function validateTranslation(
  sourceText: string,
  translatedText: string,
  gameType: GameType = 'ck3'
): ValidationResult {
  const normalizedSource = sourceText.trim()
  const normalizedTranslation = translatedText.trim()

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
    normalizedTranslation.toLowerCase().includes(phrase.toLowerCase())
  )
  
  if (hasUnwantedPhrase) {
    return {
      isValid: false,
      reason: '불필요한 응답 포함'
    }
  }

  // 기술 식별자(snake_case)가 번역되었는지 검사
  // 소문자로 시작하는 snake_case 식별자만 검사 (예: mod_icon_*, com_icon_*)
  // 대문자로 시작하는 이름 (예: A_Chi, A_Mo_Nuo_Ju)은 번역 가능한 문자열로 취급
  // @icon_name! 같은 게임 아이콘 참조는 제외 (이미 게임 syntax의 일부)
  const technicalIdentifiers = normalizedSource.match(/(?<![@$£])\b[a-z][a-z]*(?:_[a-z]+)+\b(?![!])/g) || []
  if (technicalIdentifiers.length > 0) {
    const allIdentifiersPreserved = technicalIdentifiers.every(identifier => 
      normalizedTranslation.includes(identifier)
    )
    
    if (!allIdentifiersPreserved) {
      const missingIdentifiers = technicalIdentifiers.filter(id => !normalizedTranslation.includes(id))
      return {
        isValid: false,
        reason: `기술 식별자 누락 또는 번역됨: ${missingIdentifiers.join(', ')}`
      }
    }
  }

  // 대괄호 내부의 게임 변수가 번역되었는지 검사 (|E 또는 함수 호출 패턴이 있는 경우만)
  const gameVariablePattern = /\[([^\]]*(?:\|[A-Z]|Get[A-Z][^\]]*|[a-z_]+_i))\]/g
  const sourceGameVariables = normalizedSource.match(gameVariablePattern) || []
  const translationGameVariables = normalizedTranslation.match(gameVariablePattern) || []
  
  // 원본에 게임 변수가 있는 경우에만 검증
  if (sourceGameVariables.length > 0) {
    // 게임 변수 개수가 다르면 잘못된 번역
    if (sourceGameVariables.length !== translationGameVariables.length) {
      return {
        isValid: false,
        reason: `게임 변수 개수 불일치 (원본: ${sourceGameVariables.length}, 번역: ${translationGameVariables.length})`
      }
    }

    // 게임 변수 내부에 한글이 있으면 잘못 번역된 것
    const hasKoreanInGameVariables = translationGameVariables.some(variable => 
      /[가-힣]/.test(variable)
    )
    
    if (hasKoreanInGameVariables) {
      const koreanVariables = translationGameVariables.filter(v => /[가-힣]/.test(v))
      return {
        isValid: false,
        reason: `게임 변수 내부에 한글 포함: ${koreanVariables.join(', ')}`
      }
    }
  }

  return { isValid: true }
}

/**
 * 번역 파일을 검증하고 잘못 번역된 항목들을 찾습니다.
 */
export function validateTranslationEntries(
  sourceEntries: Record<string, [string, string]>,
  translationEntries: Record<string, [string, string]>,
  gameType: GameType = 'ck3'
): { key: string; sourceValue: string; translatedValue: string; reason: string }[] {
  const invalidEntries: { key: string; sourceValue: string; translatedValue: string; reason: string }[] = []

  for (const [key, [sourceValue]] of Object.entries(sourceEntries)) {
    // 번역이 없으면 건너뜀
    if (!translationEntries[key]) {
      continue
    }

    const [translatedValue] = translationEntries[key]
    
    // 번역이 비어있거나 원본과 동일하면 건너뜀
    if (!translatedValue || translatedValue === sourceValue) {
      continue
    }

    const validation = validateTranslation(sourceValue, translatedValue, gameType)
    
    if (!validation.isValid) {
      invalidEntries.push({
        key,
        sourceValue,
        translatedValue,
        reason: validation.reason || '알 수 없는 오류'
      })
    }
  }

  return invalidEntries
}
