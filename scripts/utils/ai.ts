import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
import { Ck3_SYSTEM_PROMPT } from './prompts'
import { addQueue } from './queue'

dotenv.config()

const WRONG_TRANSLATED_FUNCTION_REGEX = /\[([가-힣]+(\|[A-Z])?)\]/
const ai = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_TOKEN!)

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
}

const gemini20 = ai.getGenerativeModel({
  generationConfig,
  model: 'gemini-2.0-flash-exp',
  systemInstruction: Ck3_SYSTEM_PROMPT,
})

const gemini15flash = ai.getGenerativeModel({
  generationConfig,
  model: 'gemini-1.5-flash-8b',
  systemInstruction: Ck3_SYSTEM_PROMPT,
})

export async function translateAI (text: string) {
  return new Promise<string>((resolve, reject) => {
    try {
      return translateAIByModel(resolve, gemini15flash, text)
    } catch (e) {
      try {
        return translateAIByModel(resolve, gemini20, text)
      } catch (ee) {
        reject(ee)
      }
    }
  })
}

async function translateAIByModel (resolve: (value: string | PromiseLike<string>) => void, model: GenerativeModel, text: string): Promise<void> {
  return addQueue(
    async () => {
      const { response } = await model.generateContent(text)

      let translated = response.text().trim()

      // 개행을 문자열로 변경
      translated.replaceAll(/\n/g, '\\n')

      // 잘못 번역된 문자열 수정
      translated.replaceAll(/#약[화한(하된)]/, '#weak')

      // 잘못된 함수 번역 수정
      WRONG_TRANSLATED_FUNCTION_REGEX.exec(translated)

      resolve(translated)
    },
  )
}
