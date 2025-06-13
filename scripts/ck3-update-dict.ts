import process from 'node:process'
import { join } from 'pathe'
import { invalidateDictionaryTranslations, invalidateSpecificDictionaryKeys } from './utils/dictionary-invalidator'
import { log } from './utils/logger'

async function main() {
  try {
    const ck3Dir = join(import.meta.dirname, '..', 'ck3')
    const args = process.argv.slice(2)
    
    if (args.length === 0) {
      // 전체 단어사전 무효화
      log.box(`
      CK3 단어사전 번역 무효화
      - 대상 경로: ${ck3Dir}
      - 모든 단어사전 항목의 번역을 무효화합니다
      `)
      
      await invalidateDictionaryTranslations('ck3', ck3Dir)
    } else {
      // 특정 키만 무효화
      const keys = args
      log.box(`
      CK3 특정 키 번역 무효화  
      - 대상 경로: ${ck3Dir}
      - 무효화할 키: [${keys.join(', ')}]
      `)
      
      await invalidateSpecificDictionaryKeys('ck3', ck3Dir, keys)
    }
    
    log.success('CK3 단어사전 무효화 완료!')
  } catch (error) {
    log.error('CK3 단어사전 무효화 중 오류 발생:', error)
    process.exit(1)
  }
}

main()