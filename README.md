[English](README.md) | [中文](README.zh.md)

# coa — Codex Account Manager

Switch between multiple ChatGPT Plus accounts to work around Codex CLI usage limits.

## Installation

```bash
npm install
npm link
```

## Commands

```bash
coa add <name>     # Save the currently logged-in account
coa list           # List all saved accounts
coa current        # Show the active account
coa change         # Interactively select and switch accounts (arrow keys + enter)
coa use <name>     # Switch directly to a named account
coa remove <name>  # Delete a saved account
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

# View all accounts
coa list

# Switch interactively
coa change

# Or switch directly
coa use work
```

Restart codex after switching for the change to take effect.

## How It Works

When you log in, Codex caches credentials at `~/.codex/auth.json`.

- `coa add` copies the current `auth.json` to `~/.codex-accounts/<name>.json`
- `coa use` / `coa change` copies the chosen account back to `~/.codex/auth.json`

Account metadata (email, plan, last used) is stored in `~/.codex-accounts/meta.json`.

## Notes

Tokens expire after ~14 days. To refresh a saved account:

```bash
codex login
coa add <name>   # overwrites the existing entry
```