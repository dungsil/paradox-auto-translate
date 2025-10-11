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
 * 게임 변수에서 문자열 리터럴을 제거하여 구조만 비교할 수 있도록 합니다.
 * 문자열 리터럴은 번역이 허용되므로 (예: ' or ' -> ' 혹은 '),
 * 구조적 일치만 검증하기 위해 모든 문자열 리터럴을 플레이스홀더로 치환합니다.
 * 
 * 예: [Concatenate(' or ', GetName)] -> [Concatenate('__STRING__', GetName)]
 *     [Concatenate(' 혹은 ', GetName)] -> [Concatenate('__STRING__', GetName)]
 */
function normalizeGameVariableStructure(variable: string): string {
  // 작은따옴표 또는 큰따옴표로 감싸진 문자열 리터럴을 플레이스홀더로 치환 (이스케이프된 따옴표도 처리)
  return variable.replace(/(['"])((?:\\.|(?!\1)[^\\])*?)\1/g, "'__STRING__'")
}

/**
 * 잘못된 형식의 변수 패턴을 감지합니다.
 * AI가 서로 다른 변수 구문을 혼합하여 생성할 수 있는 치명적인 버그를 방지합니다.
 * 
 * 감지되는 잘못된 패턴:
 * - $[culture|E] - Dollar sign과 square bracket 혼합
 * - £[variable]£ - Pound sign과 square bracket 혼합
 * - @<variable>@ - At sign과 angle bracket 혼합
 * - [$variable$] - Square bracket 내부에 다른 변수 구문
 * - 등등
 * 
 * @param text 검증할 텍스트
 * @returns 잘못된 패턴 배열 (빈 배열이면 문제 없음)
 */
function detectMalformedVariables(text: string): string[] {
  const malformedPatterns: string[] = []
  
  // 1. Dollar sign과 다른 구문 혼합 감지
  // $[...], $<...>, $ ... $ (공백 포함)
  const dollarMixedPatterns = [
    /\$\[/g,  // $[
    /\$</g,   // $<
    /\$\s+\w+\s+\$/g,  // $ variable $ (공백 포함)
  ]
  
  for (const pattern of dollarMixedPatterns) {
    const matches = text.match(pattern)
    if (matches) {
      malformedPatterns.push(...matches)
    }
  }
  
  // 2. Pound sign과 다른 구문 혼합 감지
  // £[...], £<...>
  const poundMixedPatterns = [
    /£\[/g,  // £[
    /£</g,   // £<
  ]
  
  for (const pattern of poundMixedPatterns) {
    const matches = text.match(pattern)
    if (matches) {
      malformedPatterns.push(...matches)
    }
  }
  
  // 3. At sign과 다른 구문 혼합 감지
  // @[...], @<...>
  const atMixedPatterns = [
    /@\[/g,  // @[
    /@</g,   // @<
  ]
  
  for (const pattern of atMixedPatterns) {
    const matches = text.match(pattern)
    if (matches) {
      malformedPatterns.push(...matches)
    }
  }
  
  // 4. Square bracket 내부에 다른 변수 구문 감지
  // [$...], [£...], [@...], [<...>]
  const bracketWithInnerPatterns = [
    /\[\$/g,  // [$
    /\[£/g,   // [£
    /\[@/g,   // [@
    /\[</g,   // [< (단, 일반 부등호가 아닌 경우만)
  ]
  
  for (const pattern of bracketWithInnerPatterns) {
    const matches = text.match(pattern)
    if (matches) {
      malformedPatterns.push(...matches)
    }
  }
  
  // 5. Angle bracket 내부에 다른 변수 구문 감지
  // <$...>, <[...], <£...>
  const angleBracketWithInnerPatterns = [
    /<\$/g,   // <$
    /<\[/g,   // <[
    /<£/g,    // <£
  ]
  
  for (const pattern of angleBracketWithInnerPatterns) {
    const matches = text.match(pattern)
    if (matches) {
      malformedPatterns.push(...matches)
    }
  }
  
  // 6. 닫히지 않은 변수 구문 감지
  // 완전한 변수 패턴이 있는지 먼저 확인하고, 없으면 불완전한 패턴을 찾음
  const completeVariables = {
    dollar: text.match(/\$[a-zA-Z0-9_\-.]+\$/g) || [],
    pound: text.match(/£[a-zA-Z0-9_\-.]+£/g) || [],
    at: text.match(/@[a-zA-Z0-9_\-.]+@/g) || [],
  }
  
  // 완전하지 않은 변수 시작/끝 찾기
  // 단, 이미 완전한 변수의 일부가 아닌 경우만
  const potentialUnbalanced = {
    dollarStart: text.match(/\$[a-zA-Z0-9_\-.]+(?!\$)/g) || [],
    dollarEnd: text.match(/(?<!\$)[a-zA-Z0-9_\-.]+\$/g) || [],
    poundStart: text.match(/£[a-zA-Z0-9_\-.]+(?!£)/g) || [],
    poundEnd: text.match(/(?<!£)[a-zA-Z0-9_\-.]+£/g) || [],
    atStart: text.match(/@[a-zA-Z0-9_\-.]+(?!@)/g) || [],
    atEnd: text.match(/(?<!@)[a-zA-Z0-9_\-.]+@/g) || [],
  }
  
  // 각 불완전한 패턴이 완전한 변수의 일부인지 확인
  for (const [type, patterns] of Object.entries(potentialUnbalanced)) {
    for (const pattern of patterns) {
      let isPartOfComplete = false
      
      // 해당 패턴이 완전한 변수에 포함되어 있는지 확인
      if (type.startsWith('dollar')) {
        isPartOfComplete = completeVariables.dollar.some(complete => complete.includes(pattern))
      } else if (type.startsWith('pound')) {
        isPartOfComplete = completeVariables.pound.some(complete => complete.includes(pattern))
      } else if (type.startsWith('at')) {
        isPartOfComplete = completeVariables.at.some(complete => complete.includes(pattern))
      }
      
      // 완전한 변수의 일부가 아니면 malformed로 간주
      if (!isPartOfComplete) {
        malformedPatterns.push(pattern)
      }
    }
  }
  
  // 7. 변수 구문이 혼합된 복잡한 패턴 감지
  // 예: [$variable$], [£gold£], [@icon@]
  const complexMixedPatterns = [
    /\[\$[^\]]*\$\]/g,  // [$...$]
    /\[£[^\]]*£\]/g,    // [£...£]
    /\[@[^\]]*@\]/g,    // [@...@]
  ]
  
  for (const pattern of complexMixedPatterns) {
    const matches = text.match(pattern)
    if (matches) {
      malformedPatterns.push(...matches)
    }
  }
  
  return [...new Set(malformedPatterns)]  // 중복 제거
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

  // 잘못된 형식의 변수 패턴 감지 (게임 크래시를 일으킬 수 있는 치명적 버그)
  const malformedVariables = detectMalformedVariables(normalizedTranslation)
  if (malformedVariables.length > 0) {
    return {
      isValid: false,
      reason: `잘못된 형식의 변수 패턴 감지 (게임 크래시 위험): ${malformedVariables.join(', ')}`
    }
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
    const genderFunctionPattern = /\[(?:[a-zA-Z_]+\.)*Get(?:HerHis|HerHim|SheHe|WomanMan|HerselfHimself)(?:\|[A-Z])?\]/i
    const filteredSourceVars = uniqueSourceVars.filter(v => !genderFunctionPattern.test(v))

    // 원본에 있는 변수가 번역에 없으면 오류 (단, 성별 함수는 제외)
    // 문자열 리터럴은 번역될 수 있으므로, 구조만 비교 (issue #68)
    const missingVars = filteredSourceVars.filter(sourceVar => {
      const normalizedSourceVar = normalizeGameVariableStructure(sourceVar)
      // 번역된 변수 중에서 구조가 동일한 것이 있는지 확인
      return !uniqueTransVars.some(transVar => 
        normalizeGameVariableStructure(transVar) === normalizedSourceVar
      )
    })
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
