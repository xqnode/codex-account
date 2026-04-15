# coa - Codex Account Manager

[English](README.md) | [中文](README.zh.md)

Switch between multiple Codex accounts seamlessly and track your usage limits.
Now upgraded with a **Modern Web Dashboard**, allowing you to visually manage your accounts and monitor `5h/Weekly` limits in real-time.

## 🌟 Key Features

- **Web Dashboard**: A beautiful, responsive UI to manage accounts and refresh limits with a single click.
- **Visual Status Tracking**: Color-coded progress bars for rate limits. Visually blocks switching to accounts with 0% remaining weekly quota.
- **Auto-Sync**: Silently refreshes account usage data in the background when the dashboard is active.
- **Proxy Ready**: Built-in support for local proxies (like Clash) via `undici` to ensure API requests never fail.

## 📦 Installation

```bash
npm install
npm link
```

## 🚀 Usage

### Mode 1: Web Dashboard (Recommended)

Start the local server:

Bash

```
node index.js
```

Then, open your browser and navigate to `http://localhost:3000` to access the visual manager.

### Mode 2: CLI Commands

Bash

```
# Basic Management
coa add <name>      # Save the currently logged-in account
coa list            # List saved accounts (alias: coa ls)
coa remove <name>   # Delete a saved account

# Switching Accounts
coa use <name>      # Switch directly to a named account
coa change          # Interactively choose and switch accounts (↑↓ to select)
coa ls -S           # List accounts, then interactively choose to switch

# Usage & Status
coa current         # Show the currently active account
coa current -R      # Force refresh usage for the current account via API
coa list -R         # Force refresh usage for all saved accounts via API
```

## 🔄 Standard Workflow

1. **Log in to your first account**

   Bash

   ```
   codex login
   coa add work
   ```

2. **Log in to your second account**

   Bash

   ```
   codex logout
   codex login
   coa add personal
   ```

3. **Daily Use** Run `node index.js`, open the dashboard, and click "Switch" on any account card. Restart your Codex client for the changes to take effect.

## ⚙️ How It Works

- **Token Swapping**: Codex stores credentials in `~/.codex/auth.json`. `coa add` backs this up to `~/.codex-accounts/<name>.json`. Switching simply overwrites the main auth file with the selected backup.
- **Metadata**: Account emails, plans, and timestamps are stored in `~/.codex-accounts/meta.json`.
- **Accurate Usage**: Fetches real-time limit data directly from `https://chatgpt.com/backend-api/wham/usage` using each account's isolated access token.

## ⚠️ Notes

1. **Token Expiration**: Access tokens generally expire after 14 days. If the dashboard shows an authorization error, log in manually via `codex login` and run `coa add <name>` to overwrite and renew the token.
2. **Network/Proxy**: `coa` uses Node's native fetch. If you experience `fetch failed` errors during usage refresh, ensure your local proxy (e.g., Clash) is running on the port specified in `core.js` (defaults to HTTP 7890).
