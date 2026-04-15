# coa — Codex 账号管理 (CLI + Web UI)

[English](README.md) | [中文](README.zh.md)

多个 ChatGPT/Codex 账号一键切换，解决用量限制。
不仅提供强大的命令行工具，现在还内置了**现代简约的 Web 可视化面板**，让你直观监控每个账号的 `5h/Weekly` 剩余额度。

## 🌟 新特性

- **Web Dashboard**: 提供可视化卡片界面，支持一键切换账号与刷新额度。
- **状态可视化**: 带有颜色梯度的进度条指示器（绿/橙/黄/红），额度耗尽时自动视觉阻断。
- **后台自动刷新**: 页面激活时静默同步所有账号的最新额度数据。
- **代理支持**: 后端基于 `undici`，完美兼容 Clash/FLClash 等本地网络代理，告别 `fetch failed`。

## 📦 安装

```bash
npm install
npm link
```

## 🚀 使用指南

### 模式一：Web 仪表盘模式（推荐）

启动本地服务器：

Bash

```
node index.js
```

启动后，在浏览器打开 `http://localhost:3000` 即可使用可视化面板管理你的所有账号。

### 模式二：命令行 (CLI) 模式

Bash

```
# 账号添加与基础管理
coa add <名字>    # 保存当前已登录的账号
coa list          # 列出所有账号及简要状态
coa ls            # 同上
coa remove <名字> # 删除指定账号

# 账号切换
coa use <名字>    # 直接无缝切换到指定账号
coa change        # 交互式选择并切换账号（上下键选择，回车确认）
coa ls -S         # 列出账号后，交互式选择切换

# 额度与状态查询
coa current       # 显示当前激活的账号
coa current -R    # 强制从官方接口刷新当前账号的 Usage
coa list -R       # 强制从官方接口刷新所有保存账号的 Usage
```

## 🔄 完整使用流程

1. **登录第一个账号**

   Bash

   ```
   codex login
   coa add work
   ```

2. **登录第二个账号**

   Bash

   ```
   codex logout
   codex login
   coa add personal
   ```

3. **日常使用** 运行 `node index.js` 打开浏览器面板，点击卡片上的“切换使用”即可无缝切换身份。重启你的 Codex 客户端生效。

## ⚙️ 原理与架构

- **身份克隆**：Codex 登录后凭据存在 `~/.codex/auth.json`。`coa add` 将其备份至 `~/.codex-accounts/`，切换时只需将对应的备份文件覆盖回去。
- **元数据管理**：账号别名、邮箱、套餐类型和使用记录统一保存在 `~/.codex-accounts/meta.json` 中。
- **额度查询**：使用账号独立的 Access Token 直接调用 `https://chatgpt.com/backend-api/wham/usage` 接口，数据精准。

## ⚠️ 注意事项

1. **Token 过期**：Token 有效期通常约为 14 天。如果 Web 面板提示刷新失败或 Token 失效，请执行 `codex login` 重新登录，然后 `coa add <名字>` 覆盖更新。
2. **网络代理设置**：如果你在刷新额度时遇到网络问题，请确保你的科学上网工具（如 FLClash）已启动，并在 `core.js` 中配置了正确的本地代理端口（默认兼容 HTTP 7890 端口）。