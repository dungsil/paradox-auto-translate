import dotenv from 'dotenv'
import { Portkey } from 'portkey-ai'
import { CK3_PROMPT } from '.'

dotenv.config()

const {
  PORTKEY_TOKEN: apiKey,
  PORTKEY_VIRTUAL_KEY: virtualKey,
  PROTKEY_FALLBACK_OPENAI_VIRTUAL_KEY: fallbackVirtualKey,
} = process.env

const portkey = new Portkey({
  apiKey,
  virtualKey,
  provider: 'google',
  config: JSON.stringify({
    retry: {
      attempts: 5,
    },
    cache: {
      mode: 'simple',
    },
    strategy: {
      mode: 'fallback',
    },
    targets: [
      {
        provider: 'google',
        virtual_key: virtualKey,
        override_params: {
          model: 'gemini-2.0-flash-exp',
        },
      },
      {
        provider: 'google',
        virtual_key: virtualKey,
        override_params: {
          model: 'gemini-1.5-flash-8b',
        },
      },
      {
        provider: 'openai',
        virtual_key: fallbackVirtualKey,
        override_params: {
          model: 'gpt-4o-mini',
        },
      },
    ],
  }),
})

export async function translate (content: string) {
  const response = await portkey.chat.completions.create({
    user: 'paradox-auto-translator',
    messages: [
      { role: 'system', content: CK3_PROMPT },
      { role: 'user', content },
    ],
  })

  return response.choices[0].message?.content?.trim() ?? null
}