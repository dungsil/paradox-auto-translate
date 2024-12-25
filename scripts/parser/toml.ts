// utils/toml.ts
import TOML from '@iarna/toml';

export function parseToml(content: string): unknown {
  return TOML.parse(content);
}
