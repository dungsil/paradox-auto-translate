import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
import { type GameType, getSystemPrompt } from './prompts'
import { addQueue } from './queue'

dotenv.config()

const ai = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_TOKEN!)

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
}

// 모델 캐시 (gameType + model 조합으로 캐시)
const modelCache = new Map<string, GenerativeModel>()

const gemini = (model: string, gameType: GameType) => {
  const cacheKey = `${gameType}-${model}`
  
  if (!modelCache.has(cacheKey)) {
    modelCache.set(cacheKey, ai.getGenerativeModel({
      model,
      generationConfig,
      systemInstruction: getSystemPrompt(gameType),
    }))
  }
  
  return modelCache.get(cacheKey)!
}

export async function translateAI (text: string, gameType: GameType = 'ck3'): Promise<string> {
  // 첫 번째 모델 시도
  try {
    return await new Promise<string>((resolve, reject) => {
      translateAIByModel(resolve, gemini('gemini-2.5-flash-preview-04-17', gameType), text)
        .catch(reject)
    })
  } catch (error) {
    // 두 번째 모델로 폴백
    return await new Promise<string>((resolve, reject) => {
      translateAIByModel(resolve, gemini('gemini-1.5-flash-8b', gameType), text)
        .catch(reject)
    })
  }
}

async function translateAIByModel (resolve: (value: string | PromiseLike<string>) => void, model: GenerativeModel, text: string): Promise<void> {
  return addQueue(
    async () => {
      const { response } = await model.generateContent(text)

      const translated = response.text().trim()
        .replaceAll(/\n/g, '\\n')
        .replaceAll(/"/g, '\\"')
        .replaceAll(/#약(하게|화된|[화한])/g, '#weak')
        .replaceAll(/#강조/g, '#bold')

      resolve(translated)
    },
  )
}
