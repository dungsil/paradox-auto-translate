import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
import { type GameType, getSystemPrompt } from './prompts'
import { addQueue } from './queue'
import { log } from './logger'

dotenv.config()

const ai = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_TOKEN!)

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
}

const gemini = (model: string, gameType: GameType) => ai.getGenerativeModel({
  model,
  generationConfig,
  systemInstruction: getSystemPrompt(gameType),
})

export async function translateAI (text: string, gameType: GameType = 'ck3') {
  return new Promise<string>((resolve, reject) => {
    try {
      return translateAIByModel(resolve, gemini('gemini-flash-lite-latest', gameType), text)
    } catch (e) {
      try {
        return translateAIByModel(resolve, gemini('gemini-1.5-flash-8b', gameType), text)
      } catch (ee) {
        reject(ee)
      }
    }
  })
}

async function translateAIByModel (resolve: (value: string | PromiseLike<string>) => void, model: GenerativeModel, text: string): Promise<void> {
  return addQueue(
    text,
    async () => {
      const { response } = await model.generateContent(text)

      const translated = response.text().trim()
        .replaceAll(/\n/g, '\\n')
        .replaceAll(/[^\\]"/g, '\\"')
        .replaceAll(/#약(하게|화된|[화한])/g, '#weak')
        .replaceAll(/#강조/g, '#bold')

      resolve(translated)
    },
  )
}
