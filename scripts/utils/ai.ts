import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
import { delay } from './delay'
import { log } from './logger'
import { Ck3_SYSTEM_PROMPT } from './prompts'
import { addQueue } from './queue'

dotenv.config()

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
      addQueue(
        async () => {

          let translatedText: string

          try {
            translatedText = await translateAIByModel(gemini20, text)
          } catch (e) {
            log.debug(`'${gemini20.model}' 모델 요청에 실패했습니다. 2초 후 '${gemini15flash.model}' 모델로 재시도합니다.`)
            await delay(2000) // wait 2 seconds
            translatedText = await translateAIByModel(gemini15flash, text)
          }

          resolve(translatedText)
        },
      )
    } catch (error) {
      reject(error)
    }
  })
}

async function translateAIByModel (model: GenerativeModel, text: string): Promise<string> {
  const { response } = await model.generateContent(text)
  return response.text().trim().replaceAll(/\n/g, '\\n')
}
