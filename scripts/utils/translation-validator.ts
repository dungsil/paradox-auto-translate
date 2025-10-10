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

  // 텍스트 스타일 구문이 올바르게 보존되었는지 검사
  // 유효한 형식: #weak ...#, #bold ...#, #italic ...# 등
  // 스타일 키워드는 영문으로 유지되어야 함
  const stylePatterns = normalizedSource.match(/#[a-z]+\s/gi) || []
  if (stylePatterns.length > 0) {
    for (const stylePattern of stylePatterns) {
      // 번역에서 동일한 스타일 패턴이 있는지 확인
      if (!normalizedTranslation.includes(stylePattern)) {
        // 스타일 키워드가 번역되었는지 확인 (한글이 포함되어 있는지)
        // 패턴: #<한글2글자이상><공백> (단일 조사는 제외, 실제 단어만 매칭)
        // 예: #약하게 (잘못됨 - 스타일 키워드가 번역된 경우. 번역 자체가 틀린 것이 아니라, 스타일 키워드는 영문으로 유지되어야 하므로 오류로 간주됨), 하지만 #를 같은 단일 조사는 허용
        const translatedStylePattern = /#[가-힣]{2,}\s/g
        if (translatedStylePattern.test(normalizedTranslation)) {
          return {
            isValid: false,
            reason: `텍스트 스타일 키워드가 번역됨 (예: #weak → #약하게)`
          }
        }
      }
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
  // 공백, 점(namespace), 괄호 등을 포함할 수 있음
  // 예: [GetActivityType( 'activity_RICE_aachen_pilgrimage' ).GetName], [owner.GetName], [dynasty|E]
  // 공백은 여러 개 있을 수 있으므로 normalize (연속 공백을 단일 공백으로)
  const normalizeGameVar = (text: string) => text.replace(/\s+/g, ' ')
  const gameVariablePattern = /\[([^\]]*(?:\|[A-Z]|Get[A-Z]|[a-z_]+\.[A-Z]|[a-z_]+_i))[^\]]*\]/g
  const sourceGameVariables = (normalizedSource.match(gameVariablePattern) || []).map(normalizeGameVar)
  const translationGameVariables = (normalizedTranslation.match(gameVariablePattern) || []).map(normalizeGameVar)
  
  // 원본에 게임 변수가 있는 경우에만 검증
  if (sourceGameVariables.length > 0) {
    // 원본의 모든 고유 게임 변수가 번역에도 있는지 확인
    // (번역에서 변수를 반복하는 것은 허용 - 문법적 필요에 따라)
    const uniqueSourceVars = [...new Set(sourceGameVariables)]
    const uniqueTransVars = [...new Set(translationGameVariables)]
    
    // GetHerHis, GetHerHim, GetSheHe 함수는 한국어에서 성별 구분 없이 "그"로 통일하므로 누락 허용
    // namespace가 포함된 경우도 처리 (예: [character.GetHerHis], [monk.GetHerHim], [ROOT.Char.GetSheHe])
    // 다중 네임스페이스 지원을 위해 점(.)으로 구분된 여러 레벨 허용 (대소문자 모두 허용)
    const genderFunctionPattern = /\[(?:[a-zA-Z_]+\.)*Get(?:HerHis|HerHim|SheHe|Her|She|He|His|Him)(?:\|[A-Z])?\]/i
    const filteredSourceVars = uniqueSourceVars.filter(v => !genderFunctionPattern.test(v))
    
    // 원본에 있는 변수가 번역에 없으면 오류 (단, 성별 함수는 제외)
    const missingVars = filteredSourceVars.filter(v => !uniqueTransVars.includes(v))
    if (missingVars.length > 0) {
      return {
        isValid: false,
        reason: `누락된 게임 변수: ${missingVars.join(', ')}`
      }
    }

    // 게임 변수 내부에 한글이 있으면 잘못 번역된 것
    // 단, 문자열 리터럴 내부('...' 또는 "...")의 한글은 허용
    const hasKoreanInGameVariables = translationGameVariables.some(variable => {
      // 문자열 리터럴을 제거한 후 한글 체크
      const withoutStringLiterals = variable.replace(/(['"])(?:(?!\1).)*?\1/g, '')
      return /[가-힣]/.test(withoutStringLiterals)
    })
    
    if (hasKoreanInGameVariables) {
      const koreanVariables = translationGameVariables.filter(v => {
        const withoutStringLiterals = v.replace(/(['"])(?:(?!\1).)*?\1/g, '')
        return /[가-힣]/.test(withoutStringLiterals)
      })
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
