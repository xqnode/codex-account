# coa — Codex 账号管理

多个 ChatGPT Plus 账号一键切换，解决 Codex CLI 用量限制。

## 安装

```bash
npm install
npm link
```

## 命令

```bash
coa add <名字>    # 保存当前登录的账号
coa list          # 列出所有账号
coa current       # 显示当前账号
coa change        # 交互式选择并切换账号（上下键选择，回车确认）
coa use <名字>    # 直接切换到指定账号
coa remove <名字> # 删除账号
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

# 交互式切换
coa change

# 或直接切换
coa use work
```

切换后重启 codex 生效。

## 原理

Codex 登录后把凭据存在 `~/.codex/auth.json`。

- `coa add`：把当前 `auth.json` 备份到 `~/.codex-accounts/<名字>.json`
- `coa use` / `coa change`：把指定账号的备份覆盖回 `~/.codex/auth.json`

账号元数据（邮箱、套餐、切换时间）存在 `~/.codex-accounts/meta.json`。

## 注意

Token 有效期约 14 天，过期后重新登录更新：

```bash
codex login
coa add <名字>   # 覆盖更新
```