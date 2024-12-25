import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { parseToml, parseYaml, stringifyYaml } from './parser'
import { hashing } from './utils/hashing'
import { log } from './utils/logger'
import { translate } from './utils/translate'

interface ModTranslationsOptions {
  rootDir: string
  mods: string[]
}

interface ModMeta {
  upstream: {
    localization: string[];
    language: string;
  };
}

export async function processModTranslations ({ rootDir, mods }: ModTranslationsOptions): Promise<void> {
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
      const targetDir = join(modDir, 'mod', 'localization', sourceDir.includes('replace') ? 'korean/replace' : 'korean')

      // 모드 디렉토리 생성
      await mkdir(targetDir, { recursive: true })

      const sourceFiles = await readdir(sourceDir, { recursive: true })
      for (const file of sourceFiles) {
        // 언어파일 이름이 `_l_언어코드.yml` 형식이면 처리
        if (file.endsWith(`_l_${meta.upstream.language}.yml`)) {
          await processLanguageFile(mod, sourceDir, targetDir, file, meta.upstream.language)
        }
      }
    }

    log.success(`[${mod}] 번역 완료`)
  }
}

async function processLanguageFile (mode: string, sourceDir: string, targetBaseDir: string, file: string, sourceLanguage: string): Promise<void> {
  const sourcePath = join(sourceDir, file)
  const targetPath = join(targetBaseDir, file.replace(`_l_${sourceLanguage}.yml`, '_l_korean.yml'))

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
  const sourceYaml = parseYaml(sourceContent)
  let targetYaml = parseYaml(targetContent)

  log.info(`[${mode}/${file}] 원본 키 갯수: ${Object.keys(sourceContent).length}`)
  log.info(`[${mode}/${file}] 번역 키 갯수: ${Object.keys(targetContent).length}`)

  // 최상위 언어 코드 정의 변경
  const langKey = Object.keys(targetYaml)[0]
  if (langKey.startsWith('l_')) {
    log.debug(`[${mode}/${file}] 언어 키 발견! "${langKey}" -> "l_korean"`)
    targetYaml = { l_korean: targetYaml[langKey] }
  }

  for (const [key, [sourceValue]] of Object.entries(sourceYaml[`l_${sourceLanguage}`])) {
    const sourceHash = hashing(sourceValue)
    log.debug(`[${mode}/${file}:${key}] 원본파일 문자열: ${sourceHash} | "${sourceValue}" `)

    const [targetValue, targetHash] = targetYaml.l_korean[key] || []
    if (targetValue && (sourceHash === targetHash)) {
      log.debug(`[${mode}/${file}:${key}] 번역파일 문자열: ${targetHash} | "${targetValue}" (번역됨)`)
      continue
    }

    log.debug(`[${mode}/${file}:${key}] 번역파일 문자열: ${targetHash} | "${targetValue}"`)

    // 번역 요청
    const translatedValue = await translate(sourceValue)
    log.debug(`[${mode}/${file}:${key}] 번역된 문자열: ${sourceHash} | "${translatedValue}"`)
    targetYaml.l_korean[key] = [translatedValue, sourceHash]
  }

  const updatedContent = stringifyYaml(targetYaml)
  await writeFile(targetPath, updatedContent, 'utf-8')
  log.info(`[${mode}/${file}] 번역 완료 (번역 파일 위치: ${targetPath})`)
}
