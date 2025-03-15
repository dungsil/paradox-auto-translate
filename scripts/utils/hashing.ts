import xxhash from "xxhash-wasm";

const { h64 } = await xxhash();

export function hashing (data: string): string {
  return h64(data).toString()
}
