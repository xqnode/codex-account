[English](README.md) | [中文](README.zh.md)

# coa - Codex Account Manager

Switch between multiple Codex accounts and view per-account usage.

## Installation

```bash
npm install
npm link
```

## Commands

```bash
coa add <name>      # Save the currently logged-in account
coa list            # List saved accounts
coa ls              # Alias of "coa list"
coa list -R         # Refresh usage for all saved accounts via the usage API
coa ls -R           # Alias of "coa list -R"
coa list -S         # List accounts, then interactively choose one to switch to
coa ls -S           # Alias of "coa list -S"
coa current         # Show the currently logged-in account
coa current -R      # Refresh usage for the current account via the usage API
coa change          # Interactively choose and switch accounts
coa use <name>      # Switch directly to a named account
coa remove <name>   # Delete a saved account
```

Interactive selection supports:

```text
↑↓ select
Enter confirm
Esc cancel
```

## What `list -R` Shows

`coa list -R` fetches the most accurate usage data for each saved account from:

`https://chatgpt.com/backend-api/wham/usage`

The tool uses each saved account's own access token, so usage is refreshed per account rather than guessed from local Codex session logs.

Display rules:

- Free accounts usually show one line: `weekly`
- Plus accounts can show two lines: `5h` and `weekly`
- Remaining percentage is color-coded:
  - `0-10%`: red
  - `11-40%`: yellow
  - `41-80%`: orange
  - `81-100%`: green

Example:

```text
yzkj6669 <yzkj6669@163.com> [free] ← 当前
    切换: 刚刚   保存: 今天
    weekly: ███████░░░░ 67% 剩余  6天20小时后重置

yzkj9988 <yzkj9988@163.com> [plus]
    切换: 14分钟前   保存: 今天
    5h:     ███████████ 100% 剩余  4小时59分钟后重置
    weekly: █░░░░░░░░░░ 13% 剩余  4天18小时后重置
```

## Workflow

```bash
# Log in to your first account
codex login
coa add work

# Log in to your second account
codex logout
codex login
coa add personal

# View accounts
coa ls

# Refresh usage
coa ls -R

# Switch interactively
coa change

# Or list first, then choose
coa ls -S

# Or switch directly
coa use work
```

Restart Codex after switching for the change to take effect.

## How It Works

Codex stores credentials in:

`~/.codex/auth.json`

Saved account backups are stored in:

`~/.codex-accounts/<name>.json`

Metadata is stored in:

`~/.codex-accounts/meta.json`

Usage refresh uses the saved account token to call:

`https://chatgpt.com/backend-api/wham/usage`

## Notes

- `coa` prevents saving the same account under multiple names by comparing account fingerprints.
- `coa list` syncs the "current" marker against the actual `~/.codex/auth.json`.
- If usage refresh fails for an account, `coa` will show an explicit refresh error instead of stale guessed data.
