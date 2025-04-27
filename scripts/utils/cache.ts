import process from 'node:process'
import { join } from 'node:path'
import {createDatabase} from 'db0'
import libSql from "db0/connectors/libsql/node";
import { createStorage } from 'unstorage'
import dbDriver from "unstorage/drivers/db0";


const database = createDatabase(libSql({ url: `file:translate-cache.db` }));
const translationCache = createStorage({
  driver: dbDriver({
    database,
  })
})

export async function hasCache (key: string): Promise<boolean> {
  return await translationCache.hasItem(key)
}

export async function getCache (key: string): Promise<string | null> {
  return await translationCache.getItem<string>(key)
}

export async function setCache (key: string, value: string): Promise<void> {
  await translationCache.setItem(key, value)
}
