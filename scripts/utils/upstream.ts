/**
 * 성능 최적화된 upstream 리포지토리 관리 유틸리티
 * 
 * git submodule 대신 sparse checkout과 partial clone을 사용하여
 * 필요한 localization 파일만 효율적으로 다운로드합니다.
 * 
 * meta.toml 파일을 존중하여 하위 호환성을 보장합니다.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'pathe'
import { log } from './logger'
import { parseToml } from '../parser/toml'

const execAsync = promisify(exec)

interface UpstreamConfig {
  url: string
  path: string
  localizationPaths: string[]
}

interface MetaTomlConfig {
  upstream: {
    localization: string[]
    language: string
  }
}

/**
 * meta.toml 파일을 기반으로 upstream 설정을 추출합니다 (하위 호환성 우선)
 */
export async function parseUpstreamConfigs(rootPath: string): Promise<UpstreamConfig[]> {
  const configs: UpstreamConfig[] = []
  
  // 1. meta.toml 파일들을 찾아서 우선 처리 (하위 호환성)
  const metaConfigs = await findMetaTomlConfigs(rootPath)
  configs.push(...metaConfigs)
  
  // 2. .gitmodules에서 meta.toml이 없는 항목들 추가
  const gitmoduleConfigs = await parseGitmodulesConfig(rootPath)
  for (const gitConfig of gitmoduleConfigs) {
    // 이미 meta.toml로 처리된 경로는 건너뛰기
    if (!configs.some(c => c.path === gitConfig.path)) {
      configs.push(gitConfig)
    }
  }
  
  return configs
}

/**
 * 모든 meta.toml 파일을 찾아서 upstream 설정을 추출합니다
 */
async function findMetaTomlConfigs(rootPath: string): Promise<UpstreamConfig[]> {
  const configs: UpstreamConfig[] = []
  const gameDirectories = ['ck3', 'vic3', 'stellaris']
  
  for (const gameDir of gameDirectories) {
    const gamePath = join(rootPath, gameDir)
    
    try {
      await access(gamePath)
      const modDirs = await readdir(gamePath, { withFileTypes: true })
      
      for (const modDir of modDirs) {
        if (modDir.isDirectory()) {
          const metaPath = join(gamePath, modDir.name, 'meta.toml')
          
          try {
            await access(metaPath)
            const config = await parseMetaTomlConfig(metaPath, gameDir, modDir.name)
            if (config) {
              configs.push(config)
            }
          } catch {
            // meta.toml이 없는 경우는 무시
          }
        }
      }
    } catch {
      // 게임 디렉토리가 없는 경우는 무시
    }
  }
  
  return configs
}

/**
 * 개별 meta.toml 파일을 파싱하여 upstream 설정을 생성합니다
 */
async function parseMetaTomlConfig(metaPath: string, gameDir: string, modName: string): Promise<UpstreamConfig | null> {
  try {
    const content = await readFile(metaPath, 'utf-8')
    const config = parseToml(content) as MetaTomlConfig
    
    if (!config.upstream?.localization || !Array.isArray(config.upstream.localization)) {
      return null
    }
    
    // .gitmodules에서 해당 경로의 URL 찾기
    const upstreamPath = `${gameDir}/${modName}/upstream`
    const gitmodulesConfig = await parseGitmodulesConfig(dirname(dirname(dirname(metaPath))))
    const gitmoduleEntry = gitmodulesConfig.find(c => c.path === upstreamPath)
    
    if (!gitmoduleEntry) {
      // meta.toml만 있고 .gitmodules에 해당 항목이 없는 경우는 조용히 무시
      // (예: vic3/etc처럼 특별한 용도의 디렉토리)
      return null
    }
    
    return {
      url: gitmoduleEntry.url,
      path: upstreamPath,
      localizationPaths: config.upstream.localization
    }
  } catch (error) {
    log.warn(`Failed to parse meta.toml: ${metaPath}`, error)
    return null
  }
}

/**
 * 기존 git submodule 설정에서 upstream 설정을 추출합니다 (fallback용)
 */
async function parseGitmodulesConfig(rootPath: string): Promise<UpstreamConfig[]> {
  try {
    const gitmodulesPath = join(rootPath, '.gitmodules')
    const content = await readFile(gitmodulesPath, 'utf-8')
    
    const configs: UpstreamConfig[] = []
    const sections = content.split('[submodule').filter(s => s.trim())
    
    for (const section of sections) {
      const lines = section.split('\n').map(l => l.trim()).filter(l => l)
      const pathLine = lines.find(l => l.startsWith('path ='))
      const urlLine = lines.find(l => l.startsWith('url ='))
      
      if (pathLine && urlLine) {
        const path = pathLine.replace('path =', '').trim()
        const url = urlLine.replace('url =', '').trim()
        
        // upstream 디렉토리에서 localization 경로 추측 (fallback)
        const localizationPaths = guessLocalizationPaths(path)
        
        configs.push({ url, path, localizationPaths })
      }
    }
    
    return configs
  } catch (error) {
    log.warn('Failed to parse .gitmodules, falling back to empty config', error)
    return []
  }
}

/**
 * 경로에서 localization 디렉토리를 추측합니다 (fallback용)
 */
function guessLocalizationPaths(upstreamPath: string): string[] {
  if (upstreamPath.includes('ck3')) {
    // CK3 리포지토리들은 다양한 구조를 가질 수 있음
    return [
      'localization/english',
      '*/localization/english'
    ]
  } else if (upstreamPath.includes('vic3')) {
    return [
      'localization/english',
      '*/localization/english'
    ]
  } else if (upstreamPath.includes('stellaris')) {
    return [
      'localisation/english',
      '*/localisation/english'
    ]
  }
  
  // 기본값: 모든 localization 변형을 포함  
  return ['localization/english', 'localisation/english', '*/localization/english', '*/localisation/english']
}

/**
 * 효율적인 방식으로 upstream 리포지토리를 클론하고 localization 파일만 체크아웃합니다
 */
export async function updateUpstreamOptimized(config: UpstreamConfig, rootPath: string): Promise<void> {
  const fullPath = join(rootPath, config.path)
  
  try {
    // 이미 존재하는지 확인
    await access(fullPath)
    log.info(`[${config.path}] 이미 존재함, 업데이트 확인 중...`)
    await updateExistingRepository(fullPath, config)
  } catch {
    log.info(`[${config.path}] 새로 클론 중...`)
    await cloneOptimizedRepository(fullPath, config)
  }
}

/**
 * 새 리포지토리를 효율적으로 클론합니다
 */
async function cloneOptimizedRepository(targetPath: string, config: UpstreamConfig): Promise<void> {
  const startTime = Date.now()
  
  // 디렉토리 생성
  await mkdir(dirname(targetPath), { recursive: true })
  
  try {
    // 1. Partial clone (blob 없이 메타데이터만)
    log.start(`[${config.path}] Partial clone 시작...`)
    await execAsync(`git clone --filter=blob:none --no-checkout "${config.url}" "${targetPath}"`)
    
    // 2. Sparse checkout 설정
    log.start(`[${config.path}] Sparse checkout 설정 중...`)
    await execAsync('git sparse-checkout init', { cwd: targetPath })
    
    // 3. Localization 경로만 설정 (파일에 직접 작성)
    const sparseCheckoutPath = join(targetPath, '.git', 'info', 'sparse-checkout')
    const sparseCheckoutContent = config.localizationPaths.join('\n')
    await writeFile(sparseCheckoutPath, sparseCheckoutContent)
    
    // 4. 선택적 체크아웃 (필요한 blob만 다운로드)
    log.start(`[${config.path}] Localization 파일 체크아웃 중...`)
    await execAsync('git checkout', { cwd: targetPath })
    
    const duration = Date.now() - startTime
    log.success(`[${config.path}] 최적화된 클론 완료 (${duration}ms)`)
    
  } catch (error) {
    log.error(`[${config.path}] 클론 실패:`, error)
    throw error
  }
}

/**
 * 기존 리포지토리를 업데이트합니다
 */
async function updateExistingRepository(repositoryPath: string, config: UpstreamConfig): Promise<void> {
  try {
    // Git 상태 확인
    const { stdout: status } = await execAsync('git status --porcelain', { cwd: repositoryPath })
    
    if (status.trim()) {
      log.warn(`[${config.path}] 로컬 변경사항이 있어 업데이트를 건너뜁니다`)
      return
    }
    
    // 원격 변경사항 가져오기
    await execAsync('git fetch origin', { cwd: repositoryPath })
    
    // HEAD와 origin/HEAD 비교
    const { stdout: localHead } = await execAsync('git rev-parse HEAD', { cwd: repositoryPath })
    const { stdout: remoteHead } = await execAsync('git rev-parse origin/HEAD', { cwd: repositoryPath })
    
    if (localHead.trim() === remoteHead.trim()) {
      log.info(`[${config.path}] 이미 최신 상태입니다`)
      return
    }
    
    // 업데이트 필요시 체크아웃
    log.start(`[${config.path}] 업데이트 중...`)
    await execAsync('git checkout origin/HEAD', { cwd: repositoryPath })
    log.success(`[${config.path}] 업데이트 완료`)
    
  } catch (error) {
    log.error(`[${config.path}] 업데이트 실패:`, error)
    throw error
  }
}

/**
 * 모든 upstream 리포지토리를 병렬로 업데이트합니다
 */
export async function updateAllUpstreams(rootPath: string): Promise<void> {
  const configs = await parseUpstreamConfigs(rootPath)
  
  if (configs.length === 0) {
    log.warn('업데이트할 upstream 설정을 찾을 수 없습니다')
    return
  }
  
  log.box(`
    Upstream 최적화 업데이트 시작
    - 대상: ${configs.length}개 리포지토리
    - 모드: 병렬 처리 (sparse checkout)
    - 설정 소스: meta.toml 우선, .gitmodules fallback
  `)
  
  const startTime = Date.now()
  
  // 병렬 처리
  const promises = configs.map(config => updateUpstreamOptimized(config, rootPath))
  await Promise.all(promises)
  
  const duration = Date.now() - startTime
  log.success(`모든 upstream 업데이트 완료! (${duration}ms)`)
}