import process from 'node:process'
import { join } from 'node:path'
import {createDatabase} from 'db0'
import libSql from "db0/connectors/libsql/node";
import { createStorage } from 'unstorage'
import dbDriver from "unstorage/drivers/db0";
import { type GameType } from './prompts'


const database = createDatabase(libSql({ url: `file:translate-cache.db` }));
const translationCache = createStorage({
  driver: dbDriver({
    database,
  })
})

function getCacheKey(key: string, gameType: GameType): string {
  // CK3는 기존 캐시와의 하위호환성을 위해 프리픽스 없이 사용
  if (gameType === 'ck3') {
    return key
  }
  return `${gameType}:${key}`
}

export async function hasCache (key: string, gameType: GameType = 'ck3'): Promise<boolean> {
  return await translationCache.hasItem(getCacheKey(key, gameType))
}

export async function getCache (key: string, gameType: GameType = 'ck3'): Promise<string | null> {
  return await translationCache.getItem<string>(getCacheKey(key, gameType))
}

export async function setCache (key: string, value: string, gameType: GameType = 'ck3'): Promise<void> {
  await translationCache.setItem(getCacheKey(key, gameType), value)
}
