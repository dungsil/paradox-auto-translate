import { GoogleGenerativeAI } from '@google/generative-ai'

const ai = new GoogleGenerativeAI(process.env.AI_STUDIO_TOKEN!!)
ai.getGenerativeModel({
  model: 'gemini-2.0-flash-exp',
  generationConfig: {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: 'text/plain',
  },
})

export { ai }
