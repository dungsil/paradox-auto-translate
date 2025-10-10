import process from 'node:process'
import { readdir } from 'node:fs/promises'
import { join } from 'pathe'
import { processModTranslations } from './factory/translate'
import { invalidateDictionaryTranslations } from './utils/dictionary-invalidator'
import { invalidateIncorrectTranslations } from './utils/retranslation-invalidator'
import { log } from './utils/logger'

async function main () {
  try {
    const vic3Dir = join(import.meta.dirname, '..', 'vic3')
    const mods = await readdir(vic3Dir)
    const onlyHash = process.argv?.[2] === 'onlyHash'
    const updateDict = process.argv?.[2] === 'updateDict'
    const retranslate = process.argv?.[2] === 'retranslate'

    if (updateDict) {
      log.box(
        `
        VIC3 단어사전 기반 번역 무효화
        - 대상 경로: ${vic3Dir}
        - 대상 모드 (${mods.length}개): ${mods}
        `,
      )
      
      await invalidateDictionaryTranslations('vic3', vic3Dir)
      
      log.success(`단어사전 기반 번역 무효화 완료!`)
    } else if (retranslate) {
      log.box(
        `
        VIC3 잘못 번역된 항목 재번역
        - 대상 경로: ${vic3Dir}
        - 대상 모드 (${mods.length}개): ${mods}
        `,
      )
      
      await invalidateIncorrectTranslations('vic3', vic3Dir)
      
      log.success(`잘못 번역된 항목 무효화 완료!`)
    } else {
      log.box(
        `
        VIC3 번역 스크립트 구동
        - 번역 대상 경로: ${vic3Dir}
        - 번역 대상 모드 (${mods.length}개): ${mods}
        `,
      )

      await processModTranslations({
        rootDir: vic3Dir,
        mods,
        gameType: 'vic3',
        onlyHash
      })

      log.success(`번역 완료! 스크립트를 종료합니다. (처리된 모드: ${mods})`)
    }
  } catch (error) {
    throw new Error(`VIC3 번역 처리 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }
}

main().catch((error) => {
  log.error('번역 도중 오류가 발생하였습니다.', error)
  process.exit(1)
})