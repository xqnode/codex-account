# coa — Codex 账号管理

多个 ChatGPT Plus 账号一键切换，解决 Codex CLI 用量限制。

## 安装

```bash
npm install
npm link
```

## 命令

```bash
coa add <名字>      # 保存当前登录的账号
coa list            # 列出所有账号和用量
coa list --raw      # 显示用量接口原始数据（调试用）
coa use <名字>      # 切换账号
coa remove <名字>   # 删除账号
```

## 使用流程

```bash
# 登录第一个账号
codex login
coa add work

# 登录第二个账号
codex logout
codex login
coa add personal

# 查看所有账号
coa list

# 切换账号（切换后重启 codex 生效）
coa use personal
```

## 原理

Codex 登录后把凭据存在 `~/.codex/auth.json`。

- `coa add`：把当前 `auth.json` 备份到 `~/.codex-accounts/<名字>.json`
- `coa use`：把指定账号的备份覆盖回 `~/.codex/auth.json`
- `coa list`：用每个账号的 token 请求 ChatGPT 接口查询用量

## 注意

- 切换账号后需要重启 codex 才生效
- token 有效期约 14 天，过期后重新 `codex login && coa add <名字>` 更新