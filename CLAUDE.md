# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Paradox Interactive Game Mod Translation Tool** that automatically translates localization files for **Crusader Kings III (CK3)** mods from English to Korean using Google's Gemini AI. The tool processes game mod files while preserving game-specific formatting, variables, and syntax.

## Common Commands

```bash
# Update all upstream repositories (optimized sparse checkout)
pnpm upstream

# Run CK3 translation process
pnpm ck3

# Update file hashes without translating (useful for detecting changes)
pnpm ck3:update-hash

# Run VIC3 translation process
pnpm vic3

# Update VIC3 file hashes without translating
pnpm vic3:update-hash

# Install dependencies
pnpm install
```

## Architecture

### Metadata-Driven Processing
Each mod directory contains a `meta.toml` file that defines translation configuration:

**Git Repository Source:**
```toml
[upstream]
url = "https://github.com/username/mod-repo.git"  # Git repository URL
localization = ["RICE/localization/english"]      # Source file paths
language = "english"                              # Source language
```

**Steam Workshop Source:**
```toml
[upstream]
workshop = "123456789"                            # Steam Workshop mod ID
localization = ["localization/english"]           # Source file paths  
language = "english"                              # Source language
```

### Translation Pipeline
1. **Upstream Update**: Optimized repository sync using sparse checkout (`utils/upstream.ts`) or Steam Workshop download via SteamCMD
2. **Discovery**: Scan for `meta.toml` files in game directories
3. **Parsing**: Parse YAML localization files (`l_english:` → `l_korean:`)
4. **Hashing**: Generate content hashes to detect changes (via `utils/hashing.ts`)
5. **Translation**: AI translation with CK3-specific context prompts
6. **Caching**: Store translations in database to avoid redundant API calls
7. **Output**: Generate Korean files with `___` prefix for proper load order

### Key Components

**Core Translation Logic** (`scripts/factory/translate.ts`):
- Orchestrates the entire translation workflow
- Handles file discovery, parsing, and output generation

**AI Integration** (`scripts/utils/ai.ts`):
- Google Gemini API integration
- Context-aware prompts for medieval/historical content
- Retry logic for API failures

**Game-Specific Parsing** (`scripts/parser/yaml.ts`):
- Preserves CK3 variables (`$k_france$`, `[GetTitle]`, `#bold#`)
- Converts file naming: `*_l_english.yml` → `___*_l_korean.yml`

**Smart Caching System** (`scripts/utils/cache.ts`):
- Content-based hashing to detect source changes
- Translation memory with manual dictionary overrides
- Persistent storage to avoid retranslation

**Upstream Management** (`scripts/utils/upstream.ts`):
- Git repository cloning with sparse checkout optimization
- Steam Workshop mod downloading via SteamCMD
- Automatic SteamCMD installation on Ubuntu/Debian systems
- Support for multiple Paradox games (CK3, Victoria 3, Stellaris)

### Directory Structure

```
ck3/                    # CK3 mods to translate
├── RICE/              # "Rajas of Asia in CK3 Events" mod
├── VIET/              # "VIET Events" mod
└── [MOD_NAME]/        # Pattern for additional mods
    ├── meta.toml      # Configuration
    ├── upstream/      # Original English files
    └── mod/           # Generated Korean translations

scripts/
├── ck3.ts            # Main entry point
├── factory/          # Translation processing
├── parser/           # File parsing (TOML, YAML)
└── utils/            # AI, caching, logging utilities
```

## Translation Context

**Game-Specific Requirements**:
- Preserve ALL CK3 variables and formatting exactly
- Use formal Korean (존댓말) for official content
- Maintain medieval context and terminology
- Handle Korean romanization consistently

**AI Context** (`scripts/utils/prompts.ts`):
- Specialized prompts with CK3 medieval context
- Examples of proper variable preservation
- Guidelines for Korean localization standards

## Development Notes

- Uses TypeScript with jiti for direct execution
- Google Gemini AI integration requires `GOOGLE_GENERATIVE_AI_API_KEY` environment variable
- File hashing system prevents unnecessary retranslation of unchanged content
- Translation dictionary in `scripts/utils/dictionary.ts` provides manual overrides
- Logging system supports different verbosity levels via `scripts/utils/logger.ts`