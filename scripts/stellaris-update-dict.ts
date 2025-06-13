import process from 'node:process'
import { join } from 'pathe'
import { invalidateDictionaryTranslations, invalidateSpecificDictionaryKeys } from './utils/dictionary-invalidator'
import { log } from './utils/logger'

async function main() {
  try {
    const stellarisDir = join(import.meta.dirname, '..', 'stellaris')
    const args = process.argv.slice(2)
    
    if (args.length === 0) {
      // 전체 단어사전 무효화
      log.box(`
      Stellaris 단어사전 번역 무효화
      - 대상 경로: ${stellarisDir}
      - 모든 단어사전 항목의 번역을 무효화합니다
      `)
      
      await invalidateDictionaryTranslations('stellaris', stellarisDir)
    } else {
      // 특정 키만 무효화
      const keys = args
      log.box(`
      Stellaris 특정 키 번역 무효화  
      - 대상 경로: ${stellarisDir}
      - 무효화할 키: [${keys.join(', ')}]
      `)
      
      await invalidateSpecificDictionaryKeys('stellaris', stellarisDir, keys)
    }
    
    log.success('Stellaris 단어사전 무효화 완료!')
  } catch (error) {
    log.error('Stellaris 단어사전 무효화 중 오류 발생:', error)
    process.exit(1)
  }
}

main()