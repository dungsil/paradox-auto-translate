import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { dictornary, exists, loadMeta, log, type Meta, ROOT_DIR, translate, UTF8_BOM } from './utils'

// 기본 디렉토리 지정
const baseDir = join(ROOT_DIR, 'ck3')
log.debug('[CK3] Base dir: ', baseDir)

// 모드 디렉토리 목록 가져오기
const mods = await readdir(baseDir)
log.debug('[CK3] Mods: ', mods)

// 비동기 함수 작성 후 실행
await Promise.all(mods.map(processByMod))

// 모드 별 처리 함수
// 실제 메인 로직은 이 하위에 작성된다.
async function processByMod (mod: string) {
  const modDir = join(baseDir, mod)
  log.debug(`[CK3] Start process by ${mod} (location: ${modDir})`)

  // 메타정보 로드
  const meta: Meta = await loadMeta(modDir)

  // 언어 파일 위치 확인
  const localizationDir = resolve(modDir, 'upstream', meta.upstream.localization)
  log.debug(`[CK3/${mod}] Upstream localization dir: ${localizationDir}`)

  // 언어 파일 로드
  const localizationFiles = await glob(
    [`**/*_l_${meta.upstream.language}.yml`],
    {
      cwd: localizationDir,
      onlyFiles: true,
      absolute: true,
    },
  )
  log.debug(`[CK3/${mod}] Upstream localization files: ${localizationFiles.length} counts`)
  log.verbose(localizationFiles.join('\n'))

  // 언어 파일 비동기 처리
  await Promise.all(
    localizationFiles.map(async (localizationFile) => {
      const distFile = localizationFile
        .replace(localizationDir, join(modDir, 'mod/localization'))
        .replaceAll(meta.upstream.language as string, 'korean')

      // 번역 파일 로드
      let translatedLines: Record<string, string | null>
      if (await exists(distFile)) {
        translatedLines = await parseLines(distFile)
      } else {
        translatedLines = {}
      }

      // 업스트림 파일 로드
      const upstreamLines = await parseLines(localizationFile)
      for (const key of Object.keys(upstreamLines)) {
        // 언어 정의 키는 건너뜀
        if (key.includes(`l_${meta.upstream.language}`)) {
          continue
        }

        // 이미 번역된 키가 있음
        if (Object.hasOwn(translatedLines, key)) {
          continue // TODO: 이후 업데이트 체크 필요
        }

        const upstreamLine = upstreamLines[key]

        // 유효하지 않은 라인이면 그대로 저장
        if (!upstreamLine) {
          translatedLines[key] = upstreamLine
          continue
        }

        // 주석은 그대로 저장
        if (upstreamLine.trim().startsWith('#')) {
          translatedLines[key] = upstreamLine
          continue
        }

        // '$variable$' 형식의 문자열은 번역하지 않음
        if (/^\$[^$]+\$$/.test(upstreamLine)) {
          translatedLines[key] = upstreamLine
          continue
        }

        // 사전에 있는 키는 사전에서 가져온다
        if (Object.hasOwn(dictornary, upstreamLine)) {
          translatedLines[key] = dictornary[upstreamLine]
          continue
        }

        log.verbose(`[CK3/${mod}] New key: ${key}`)
        translatedLines[key] = await translate(upstreamLines[key]!!)
      }

      // 형식에 맞춰 구조화
      const translations = Object.entries(translatedLines)
        .map(([key, value]) => `\t${key.startsWith('#') ? key : `${key}:`} ${value === null ? '' : `"${value}"`}`)
        .join('\n')
      log.verbose(`[CK3/${mod}] Translations: \n${translations}`)

      // 번역 파일  저장부분
      log.success(`[CK3/${mod}] Write to ${distFile}`)
      await mkdir(dirname(distFile), { recursive: true })
      await writeFile(distFile, `${UTF8_BOM}l_korean:\n${translations}`, { encoding: 'utf-8' })
    }),
  )
}

async function parseLines (filePath: string) {
  const fileContent = await readFile(filePath, { encoding: 'utf-8' })
  const lines = fileContent.split('\n')

  const parsedLine: Record<string, string | null> = {}
  for (const line of lines) {
    const [key, value] = parseLine(line)
    if (!key || (key.startsWith('l_') && key.endsWith(':') && value === null)) {
      continue
    }

    parsedLine[key] = value
  }

  return parsedLine
}

function parseLine (line: string) {
  if (line.trim() === '') {
    return []
  }

  const separatedLine = line.match(/(.*:)(\d*)( *)(".*")/)

  if (separatedLine) {
    return [
      separatedLine[1].trim().replace(/:$/, ''),
      separatedLine[4].replace(/^"(.+)?"$/, '$1'),
    ]
  } else {
    return [line.trim(), null]
  }
}
