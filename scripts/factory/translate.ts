import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'pathe'
import { parseToml, parseYaml, stringifyYaml } from '../parser'
import { hashing } from '../utils/hashing'
import { log } from '../utils/logger'
import { translate } from '../utils/translate'
import { updateAllUpstreams } from '../utils/upstream'
import { type GameType } from '../utils/prompts'

function getLocalizationFolderName(gameType: GameType): string {
  switch (gameType) {
    case 'ck3':
    case 'vic3':
      return 'localization'
    case 'stellaris':
      return 'localisation'
    default:
      throw new Error(`Unsupported game type: ${gameType}`)
  }
}

interface ModTranslationsOptions {
  rootDir: string
  mods: string[]
  gameType: GameType
  onlyHash?: boolean
}

interface ModMeta {
  upstream: {
    localization: string[];
    language: string;
  };
}

export async function processModTranslations ({ rootDir, mods, gameType, onlyHash = false }: ModTranslationsOptions): Promise<void> {
  // 번역 작업 전에 해당 게임의 upstream 리포지토리만 업데이트
  log.start(`${gameType.toUpperCase()} Upstream 리포지토리 업데이트 중...`)
  const projectRoot = join(rootDir, '..') // rootDir은 ck3/ 같은 게임 디렉토리이므로 한 단계 위로
  await updateAllUpstreams(projectRoot, gameType)
  log.success(`${gameType.toUpperCase()} Upstream 리포지토리 업데이트 완료`)

  const processes: Promise<void>[] = []

  for (const mod of mods) {
    log.start(`[${mod}] 작업 시작 (원본 파일 경로: ${rootDir}/${mod})`)
    const modDir = join(rootDir, mod)
    const metaPath = join(modDir, 'meta.toml')

    // `meta.toml`이 존재하지 않거나 디렉토리 등 파일이 아니면 무시
    if (!(await stat(metaPath)).isFile()) {
      continue
    }

    const metaContent = await readFile(metaPath, 'utf-8')
    const meta = parseToml(metaContent) as ModMeta
    log.debug(`[${mod}] 메타데이터:  upstream.language: ${meta.upstream.language}, upstream.localization: [${meta.upstream.localization}]`)

    for (const locPath of meta.upstream.localization) {
      const sourceDir = join(modDir, 'upstream', locPath)
      const localizationFolder = getLocalizationFolderName(gameType)
      const targetDir = join(modDir, 'mod', localizationFolder, sourceDir.includes('replace') ? 'korean/replace' : 'korean')

      // 모드 디렉토리 생성
      await mkdir(targetDir, { recursive: true })

      const sourceFiles = await readdir(sourceDir, { recursive: true })
      for (const file of sourceFiles) {
        // 언어파일 이름이 `_l_언어코드.yml` 형식이면 처리
        if (file.endsWith(`.yml`) && file.includes(`_l_${meta.upstream.language}`)) {
          processes.push(processLanguageFile(mod, sourceDir, targetDir, file, meta.upstream.language, gameType, onlyHash))
        }
      }
    }

    await Promise.all(processes)

    log.success(`[${mod}] 번역 완료`)
  }
}

async function processLanguageFile (mode: string, sourceDir: string, targetBaseDir: string, file: string, sourceLanguage: string, gameType: GameType, onlyHash: boolean): Promise<void> {
  const sourcePath = join(sourceDir, file)

  // 파일 순서를 최상위로 유지해 덮어쓸 수 있도록 앞에 '___'를 붙임 (ex: `___00_culture_l_english.yml`)
  const targetParentDir = join(targetBaseDir, dirname(file))
  await mkdir(targetParentDir, { recursive: true })
  const targetPath = join(targetParentDir, '___' + basename(file).replace(`_l_${sourceLanguage}.yml`, '_l_korean.yml'))

  let targetContent = ''
  try {
    targetContent = await readFile(targetPath, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    // File doesn't exist, copy from source
    targetContent = await readFile(sourcePath, 'utf-8')
  }

  log.start(`[${mode}/${file}] 원본 파일 경로: ${sourcePath}`)

  const sourceContent = await readFile(sourcePath, 'utf-8')
  const sourceYaml: Record<string, Record<string, [string, string | null]>> = parseYaml(sourceContent)
  const targetYaml = parseYaml(targetContent)
  const newYaml: Record<`l_${string}`, Record<string, [string, string]>> = {
    l_korean: {}
  }

  log.info(`[${mode}/${file}] 원본 키 갯수: ${Object.keys(sourceContent).length}`)
  log.info(`[${mode}/${file}] 번역 키 갯수: ${Object.keys(targetContent).length}`)

  // 최상위 언어 코드 정의 변경
  const langKey = Object.keys(targetYaml)[0] || 'l_korean'
  if (langKey.startsWith('l_')) {
    log.debug(`[${mode}/${file}] 언어 키 발견! "${langKey}" -> "l_korean"`)
  }

  for (const [key, [sourceValue]] of Object.entries(sourceYaml[`l_${sourceLanguage}`])) {
    const sourceHash = hashing(sourceValue)
    log.verbose(`[${mode}/${file}:${key}] 원본파일 문자열: ${sourceHash} | "${sourceValue}" `)

    const [targetValue, targetHash] = targetYaml[langKey][key] || []

    // 해싱 처리용 유틸리티
    if (onlyHash) {
      newYaml.l_korean[key] = [targetValue, sourceHash]
      log.debug(`[${mode}/${file}:${key}] 해시 업데이트: ${targetHash} -> ${sourceHash}`)
      continue
    }

    if (targetValue && (sourceHash === targetHash)) {
      log.verbose(`[${mode}/${file}:${key}] 번역파일 문자열: ${targetHash} | "${targetValue}" (번역됨)`)
      newYaml.l_korean[key] = [targetValue, targetHash]
      continue
    }

    log.verbose(`[${mode}/${file}:${key}] 번역파일 문자열: ${targetHash} | "${targetValue}"`)

    // 번역 요청
    log.start(`[${mode}/${file}:${key}] 번역 요청: ${sourceHash} | "${sourceValue}"`)
    const translatedValue = await translate(sourceValue, gameType)

    newYaml.l_korean[key] = [translatedValue, sourceHash]
  }

  const updatedContent = stringifyYaml(newYaml)
  await writeFile(targetPath, updatedContent, 'utf-8')
  log.success(`[${mode}/${file}] 번역 완료 (번역 파일 위치: ${targetPath})`)
}
