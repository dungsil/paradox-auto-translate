import process from 'node:process'
import { readdir } from 'node:fs/promises'
import { join } from 'pathe'
import { processModTranslations } from './factory/translate'
import { invalidateDictionaryTranslations } from './utils/dictionary-invalidator'
import { log } from './utils/logger'

async function main () {
  try {
    const ck3Dir = join(import.meta.dirname, '..', 'ck3')
    const mods = await readdir(ck3Dir)
    const onlyHash = process.argv?.[2] === 'onlyHash'
    const updateDict = process.argv?.[2] === 'updateDict'

    if (updateDict) {
      log.box(
        `
        CK3 단어사전 기반 번역 무효화
        - 대상 경로: ${ck3Dir}
        - 대상 모드 (${mods.length}개): ${mods}
        `,
      )
      
      await invalidateDictionaryTranslations('ck3', ck3Dir)
      
      log.success(`단어사전 기반 번역 무효화 완료!`)
    } else {
      log.box(
        `
        CK3 번역 스크립트 구동
        - 번역 대상 경로: ${ck3Dir}
        - 번역 대상 모드 (${mods.length}개): ${mods}
        `,
      )

      await processModTranslations({
        rootDir: ck3Dir,
        mods,
        gameType: 'ck3',
        onlyHash
      })

      log.success(`번역 완료! 스크립트를 종료합니다. (처리된 모드: ${mods})`)
    }
  } catch (error) {
    throw new Error(`CK3 번역 처리 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }
}

main().catch((error) => {
  log.error('번역 도중 오류가 발생하였습니다.', error)
  process.exit(1)
})
