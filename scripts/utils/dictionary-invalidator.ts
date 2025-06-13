import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { parseToml, parseYaml, stringifyYaml } from '../parser'
import { getDictionary, getDictionaries, hasDictionary } from './dictionary'
import { hashing } from './hashing'
import { log } from './logger'
import { type GameType } from './prompts'

interface ModMeta {
  upstream: {
    localization: string[]
    language: string
  }
}

/**
 * 단어사전에 있는 키에 해당하는 번역 파일의 해시를 초기화합니다.
 * 이렇게 하면 다음 번역 시 단어사전의 새로운 번역이 적용됩니다.
 */
export async function invalidateDictionaryTranslations(gameType: GameType, rootDir: string): Promise<void> {
  log.start(`[${gameType.toUpperCase()}] 단어사전 기반 번역 무효화 시작`)
  log.info(`대상 디렉토리: ${rootDir}`)
  
  const mods = await readdir(rootDir)
  log.info(`발견된 모드: [${mods.join(', ')}]`)
  
  let totalInvalidated = 0
  
  for (const mod of mods) {
    const modDir = join(rootDir, mod)
    const metaPath = join(modDir, 'meta.toml')
    
    log.info(`[${mod}] 처리 시작`)
    log.debug(`[${mod}] meta.toml 경로: ${metaPath}`)
    
    try {
      const metaContent = await readFile(metaPath, 'utf-8')
      const meta = parseToml(metaContent) as ModMeta
      
      log.debug(`[${mod}] 메타데이터 읽기 성공`)
      log.debug(`[${mod}] upstream.language: ${meta.upstream.language}`)
      log.debug(`[${mod}] upstream.localization: [${meta.upstream.localization.join(', ')}]`)
      
      for (const locPath of meta.upstream.localization) {
        log.info(`[${mod}] localization 경로 처리: ${locPath}`)
        const invalidatedCount = await invalidateModLocalization(mod, modDir, locPath, meta.upstream.language, gameType)
        totalInvalidated += invalidatedCount
        log.info(`[${mod}/${locPath}] 무효화된 항목: ${invalidatedCount}개`)
      }
      
      log.success(`[${mod}] 완료`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        log.debug(`[${mod}] meta.toml 없음, 건너뛰기`)
        continue
      }
      log.error(`[${mod}] 오류 발생:`, error)
      throw error
    }
  }
  
  log.success(`단어사전 기반 번역 무효화 완료 - 총 ${totalInvalidated}개 항목 무효화`)
}

async function invalidateModLocalization(
  modName: string,
  modDir: string,
  locPath: string,
  sourceLanguage: string,
  gameType: GameType
): Promise<number> {
  const sourceDir = join(modDir, 'upstream', locPath)
  const targetDir = join(modDir, 'mod', getLocalizationFolderName(gameType), locPath.includes('replace') ? 'korean/replace' : 'korean')
  
  log.debug(`[${modName}] 소스 디렉토리: ${sourceDir}`)
  log.debug(`[${modName}] 타겟 디렉토리: ${targetDir}`)
  
  try {
    const sourceFiles = await readdir(sourceDir, { recursive: true })
    log.debug(`[${modName}] 소스 파일들: [${sourceFiles.join(', ')}]`)
    
    let invalidatedCount = 0
    
    for (const file of sourceFiles) {
      if (typeof file === 'string' && file.endsWith(`_l_${sourceLanguage}.yml`)) {
        const sourceFilePath = join(sourceDir, file)
        const targetFileName = '___' + file.replace(`_l_${sourceLanguage}.yml`, '_l_korean.yml')
        const targetFilePath = join(targetDir, targetFileName)
        
        log.debug(`[${modName}] 처리할 파일: ${file}`)
        log.debug(`[${modName}] 소스: ${sourceFilePath}`)
        log.debug(`[${modName}] 타겟: ${targetFilePath}`)
        
        const count = await invalidateTranslationFile(modName, sourceFilePath, targetFilePath, gameType)
        invalidatedCount += count
        log.debug(`[${modName}/${file}] 무효화된 항목: ${count}개`)
      }
    }
    
    return invalidatedCount
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      log.warn(`[${modName}] 소스 디렉토리 없음: ${sourceDir}`)
      return 0
    }
    log.error(`[${modName}] 디렉토리 읽기 오류:`, error)
    throw error
  }
}

async function invalidateTranslationFile(
  modName: string, 
  sourceFilePath: string, 
  targetFilePath: string, 
  gameType: GameType
): Promise<number> {
  try {
    log.debug(`[${modName}] 파일 처리 시작: ${sourceFilePath}`)
    
    // 원본 파일 읽기
    const sourceContent = await readFile(sourceFilePath, 'utf-8')
    const sourceYaml = parseYaml(sourceContent) as Record<string, Record<string, [string, string]>>
    
    // 번역 파일 읽기 (없으면 건너뜀)
    let targetContent: string
    try {
      targetContent = await readFile(targetFilePath, 'utf-8')
      log.debug(`[${modName}] 번역 파일 읽기 성공: ${targetFilePath}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        log.debug(`[${modName}] 번역 파일 없음: ${targetFilePath}`)
        return 0 // 번역 파일이 없으면 무효화할 게 없음
      }
      throw error
    }
    
    const targetYaml = parseYaml(targetContent) as Record<string, Record<string, [string, string]>>
    
    let invalidatedCount = 0
    let hasChanges = false
    
    // 원본 파일의 언어 키 찾기
    const sourceLangKey = Object.keys(sourceYaml)[0]
    if (!sourceLangKey || !sourceLangKey.startsWith('l_')) {
      log.debug(`[${modName}] 원본 파일에 언어 키 없음: ${sourceLangKey}`)
      return 0
    }
    
    // 번역 파일의 언어 키 찾기
    const targetLangKey = Object.keys(targetYaml)[0]
    if (!targetLangKey || !targetLangKey.startsWith('l_')) {
      log.debug(`[${modName}] 번역 파일에 언어 키 없음: ${targetLangKey}`)
      return 0
    }
    
    log.debug(`[${modName}] 원본 키 개수: ${Object.keys(sourceYaml[sourceLangKey]).length}`)
    log.debug(`[${modName}] 번역 키 개수: ${Object.keys(targetYaml[targetLangKey]).length}`)
    
    // 원본 파일의 각 항목을 검사
    for (const [key, [sourceValue]] of Object.entries(sourceYaml[sourceLangKey])) {
      const normalizedSourceValue = sourceValue.toLowerCase().trim()
      
      log.verbose(`[${modName}] 검사 중: "${sourceValue}" -> "${normalizedSourceValue}"`)
      
      // 단어사전의 모든 키를 확인해서 원본 텍스트에 포함되어 있는지 검사
      const dictionaries = getDictionaries(gameType)
      let foundDictionaryWords: string[] = []
      
      for (const [dictKey, dictValue] of Object.entries(dictionaries)) {
        if (normalizedSourceValue.includes(dictKey.toLowerCase())) {
          foundDictionaryWords.push(dictKey)
        }
      }
      
      if (foundDictionaryWords.length > 0) {
        log.debug(`[${modName}] 단어사전 단어 발견: [${foundDictionaryWords.join(', ')}]`)
        
        // 번역 파일에 해당 키가 있다면 해시를 초기화
        if (targetYaml[targetLangKey][key]) {
          const [currentTranslation] = targetYaml[targetLangKey][key]
          targetYaml[targetLangKey][key] = [currentTranslation, ''] // 해시 초기화
          invalidatedCount++
          hasChanges = true
          
          const dictionaryMappings = foundDictionaryWords.map(word => 
            `"${word}" -> "${getDictionary(word, gameType)}"`
          ).join(', ')
          log.info(`[${modName}] 무효화: "${sourceValue}" (포함단어: ${dictionaryMappings})`)
        } else {
          log.debug(`[${modName}] 번역 파일에 키 없음: ${key}`)
        }
      }
    }
    
    if (hasChanges) {
      const updatedContent = stringifyYaml(targetYaml)
      await writeFile(targetFilePath, updatedContent, 'utf-8')
      log.debug(`[${modName}] 파일 업데이트 완료: ${targetFilePath}`)
    } else {
      log.debug(`[${modName}] 변경사항 없음`)
    }
    
    return invalidatedCount
  } catch (error) {
    log.error(`[${modName}] 파일 처리 실패: ${sourceFilePath} -> ${targetFilePath}`, error)
    return 0
  }
}

function getLocalizationFolderName(gameType: GameType): string {
  switch (gameType) {
    case 'ck3':
      return 'localization'
    case 'stellaris':
      return 'localisation'
    default:
      throw new Error(`Unsupported game type: ${gameType}`)
  }
}

/**
 * 특정 단어사전 키들에 대해서만 무효화를 수행합니다.
 */
export async function invalidateSpecificDictionaryKeys(
  gameType: GameType,
  rootDir: string,
  keys: string[]
): Promise<void> {
  log.start(`[${gameType.toUpperCase()}] 특정 키 무효화 시작: [${keys.join(', ')}]`)
  
  const mods = await readdir(rootDir)
  let totalInvalidated = 0
  
  for (const mod of mods) {
    const modDir = join(rootDir, mod)
    const metaPath = join(modDir, 'meta.toml')
    
    try {
      const metaContent = await readFile(metaPath, 'utf-8')
      const meta = parseToml(metaContent) as ModMeta
      
      for (const locPath of meta.upstream.localization) {
        const invalidatedCount = await invalidateSpecificKeysInMod(mod, modDir, locPath, gameType, keys)
        totalInvalidated += invalidatedCount
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw error
    }
  }
  
  log.success(`특정 키 무효화 완료 - 총 ${totalInvalidated}개 항목 무효화`)
}

async function invalidateSpecificKeysInMod(
  modName: string,
  modDir: string,
  locPath: string,
  gameType: GameType,
  targetKeys: string[]
): Promise<number> {
  const sourceDir = join(modDir, 'upstream', locPath)
  const targetDir = join(modDir, 'mod', getLocalizationFolderName(gameType), locPath.includes('replace') ? 'korean/replace' : 'korean')
  
  try {
    const sourceFiles = await readdir(sourceDir, { recursive: true })
    let invalidatedCount = 0
    
    for (const file of sourceFiles) {
      if (typeof file === 'string' && file.endsWith(`_l_english.yml`)) { // 소스 언어는 일단 english로 하드코딩
        const sourceFilePath = join(sourceDir, file)
        const targetFileName = '___' + file.replace('_l_english.yml', '_l_korean.yml')
        const targetFilePath = join(targetDir, targetFileName)
        
        const count = await invalidateSpecificKeysInFile(modName, sourceFilePath, targetFilePath, gameType, targetKeys)
        invalidatedCount += count
      }
    }
    
    return invalidatedCount
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0
    }
    throw error
  }
}

async function invalidateSpecificKeysInFile(
  modName: string,
  sourceFilePath: string,
  targetFilePath: string,
  gameType: GameType,
  targetKeys: string[]
): Promise<number> {
  try {
    // 원본 파일 읽기
    const sourceContent = await readFile(sourceFilePath, 'utf-8')
    const sourceYaml = parseYaml(sourceContent) as Record<string, Record<string, [string, string]>>
    
    // 번역 파일 읽기 (없으면 건너뜀)
    let targetContent: string
    try {
      targetContent = await readFile(targetFilePath, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0
      }
      throw error
    }
    
    const targetYaml = parseYaml(targetContent) as Record<string, Record<string, [string, string]>>
    
    let invalidatedCount = 0
    let hasChanges = false
    
    // 원본 파일의 언어 키 찾기
    const sourceLangKey = Object.keys(sourceYaml)[0]
    if (!sourceLangKey || !sourceLangKey.startsWith('l_')) {
      return 0
    }
    
    // 번역 파일의 언어 키 찾기
    const targetLangKey = Object.keys(targetYaml)[0]
    if (!targetLangKey || !targetLangKey.startsWith('l_')) {
      return 0
    }
    
    // 원본 파일의 각 항목을 검사
    for (const [key, [sourceValue]] of Object.entries(sourceYaml[sourceLangKey])) {
      const normalizedSourceValue = sourceValue.toLowerCase().trim()
      
      // 원본 텍스트에 타겟 키가 포함되어 있는지 확인
      const matchedTargetKeys = targetKeys.filter(targetKey => 
        normalizedSourceValue.includes(targetKey.toLowerCase())
      )
      
      if (matchedTargetKeys.length > 0) {
        // 번역 파일에 해당 키가 있다면 해시를 초기화
        if (targetYaml[targetLangKey][key]) {
          const [currentTranslation] = targetYaml[targetLangKey][key]
          targetYaml[targetLangKey][key] = [currentTranslation, '']
          invalidatedCount++
          hasChanges = true
          
          const matchedMappings = matchedTargetKeys.map(word => 
            `"${word}" -> "${getDictionary(word, gameType)}"`
          ).join(', ')
          log.info(`[${modName}] 무효화: "${sourceValue}" (포함단어: ${matchedMappings})`)
        }
      }
    }
    
    if (hasChanges) {
      const updatedContent = stringifyYaml(targetYaml)
      await writeFile(targetFilePath, updatedContent, 'utf-8')
    }
    
    return invalidatedCount
  } catch (error) {
    log.warn(`[${modName}] 파일 처리 실패: ${sourceFilePath} -> ${targetFilePath}`, error)
    return 0
  }
}