import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
import { resolve } from 'pathe'

dotenv.config({
  path: resolve(import.meta.dirname, '../../.env'),
})

const ai = new GoogleGenerativeAI(process.env.AI_STUDIO_TOKEN!!)
const model = ai.getGenerativeModel({
  model: 'gemini-1.5-flash-8b',
  generationConfig: {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: 'text/plain',
  },
})

export { model }
