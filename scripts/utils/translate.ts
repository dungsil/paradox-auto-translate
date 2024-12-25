import { getCache, hasCache, setCache } from './cache'
import { getDictionary, hasDictionary } from './dictionary'
import { addQueue } from './queue'

const INNER_FUNCTION_REGEX = /^\[([\w.]+(?:\|[\w.]+)?|[\w.]+\.[\w.]+\(['\w.]+'\))]$/
const VARIABLE_REGEX = /^\$[a-zA-Z0-9_\-.]+\$$/

export async function translate (text: string): Promise<string> {

  // 잘못된 형식인 경우 빈 텍스트 반환
  if (!text) {
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
  if (hasCache(normalizedText)) {
    return getCache(normalizedText)!
  }

  return new Promise((resolve, reject) => {
    addQueue(
      async () => {
        try {
          // 실제 AI 번역 요청
          const translatedText = await performTranslation(text)
          setCache(text, translatedText)

          resolve(translatedText)
        } catch (error) {
          reject(error)
        }
      },
    )
  })
}

async function performTranslation (text: string): Promise<string> {
  // TODO: Implement actual AI translation call here
  // For now, we'll just return the original text
  return text
}
