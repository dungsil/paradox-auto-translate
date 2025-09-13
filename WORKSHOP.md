# Steam Workshop Integration Guide

This document describes how to configure and use the Steam Workshop integration feature for downloading mods automatically.

## Overview

The paradox-auto-translate tool now supports automatic downloading of mods from Steam Workshop using SteamCMD. This allows you to translate mods directly from Steam Workshop without manually downloading and extracting them.

## Configuration

### meta.toml Structure

To use Steam Workshop integration, configure your `meta.toml` file with the `workshop` field instead of `url`:

```toml
[upstream]
workshop = "123456789"  # Steam Workshop mod ID
localization = ["localization/english"]
language = "english"
```

### Finding Workshop IDs

You can find the Workshop ID from the Steam Workshop URL:
- URL: `https://steamcommunity.com/sharedfiles/filedetails/?id=2218107383`
- Workshop ID: `2218107383`

### Supported Games

The integration supports multiple Paradox games with their respective Steam app IDs:

| Game | Steam App ID | Directory |
|------|-------------|-----------|
| Crusader Kings III | 1158310 | ck3/ |
| Victoria 3 | 529340 | vic3/ |
| Stellaris | 281990 | stellaris/ |

## System Requirements

### SteamCMD Installation

The system will automatically attempt to install SteamCMD when needed. For manual installation:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install steamcmd
```

**Other Systems:**
Please install SteamCMD manually according to your distribution's package manager or from the [official Valve documentation](https://developer.valvesoftware.com/wiki/SteamCMD).

## Usage

### Basic Workflow

1. **Create mod directory structure:**
   ```
   ck3/YourModName/
   └── meta.toml
   ```

2. **Configure meta.toml:**
   ```toml
   [upstream]
   workshop = "2218107383"  # Example: "More Decisions" mod
   localization = ["localization/english"]
   language = "english"
   ```

3. **Run translation:**
   ```bash
   pnpm ck3
   ```

### What Happens

1. The system detects the `workshop` field in `meta.toml`
2. SteamCMD is used to download the mod from Steam Workshop
3. The mod is extracted to `YourModName/upstream/`
4. Translation proceeds normally using existing localization files

## Example Configuration

See the example in `ck3/ExampleWorkshopMod/meta.toml`:

```toml
# Example Steam Workshop mod configuration
# This is a real CK3 mod from Steam Workshop for testing
[upstream]
workshop = "2218107383"  # "More Decisions" mod - popular and actively maintained CK3 mod
localization = ["localization/english"]
language = "english"
```

## Error Handling

### Common Issues

1. **Workshop ID not found:**
   - Verify the Workshop ID is correct
   - Check if the mod is publicly available
   - Ensure you have the correct game (CK3 vs Victoria 3, etc.)

2. **SteamCMD installation fails:**
   - Install SteamCMD manually
   - Ensure you have admin privileges
   - Check your distribution's package manager

3. **Download timeout:**
   - Check your internet connection
   - Try again later (Steam servers might be busy)
   - Some large mods may take longer to download

### Fallback Behavior

If Steam Workshop download fails, the system will:
1. Create an empty upstream directory
2. Log a warning message
3. Continue with the translation process (though it may fail due to missing files)
4. Suggest manual mod download

## Migration from Git to Workshop

To migrate an existing mod configuration from Git to Workshop:

**Before:**
```toml
[upstream]
url = "https://github.com/username/mod-repo.git"
localization = ["localization/english"]
language = "english"
```

**After:**
```toml
[upstream]
workshop = "123456789"  # Workshop ID of the same mod
localization = ["localization/english"]
language = "english"
```

## Limitations

1. **Anonymous Downloads Only:** Currently only supports publicly available mods that can be downloaded anonymously
2. **No Version Control:** Workshop downloads always get the latest version (unlike Git repos with tags)
3. **Network Dependency:** Requires internet connection for each download
4. **SteamCMD Dependency:** Requires SteamCMD to be available on the system

## Troubleshooting

### Enable Debug Logging

To see detailed SteamCMD commands and output, check the console logs when running the translation process. The system logs:
- Workshop ID and game detection
- SteamCMD command execution
- Download progress and results

### Manual Verification

You can manually test SteamCMD with your Workshop ID:

```bash
steamcmd +login anonymous +workshop_download_item 1158310 2218107383 +quit
```

The downloaded content will be in:
```
~/.steam/steamcmd/steamapps/workshop/content/1158310/2218107383/
```

## Contributing

If you encounter issues with specific Workshop mods or want to suggest improvements:

1. Check the console output for detailed error messages
2. Verify the Workshop ID and game compatibility
3. Report issues with specific mod IDs and error logs
4. Suggest improvements to the error handling or installation process