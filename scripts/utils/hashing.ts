import xxhash from "xxhash-wasm";

const { h64 } = await xxhash();

export function hashing (data: string) {
  return h64(data)
}
