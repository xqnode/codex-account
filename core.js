#!/usr/bin/env node

import chalk from "chalk";
import select from "@inquirer/select";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { ProxyAgent } from 'undici';

const CODEX_DIR = path.join(os.homedir(), ".codex");
const CODEX_AUTH = path.join(CODEX_DIR, "auth.json");
const ACCOUNTS_DIR = path.join(os.homedir(), ".codex-accounts");
const ACCOUNTS_META = path.join(ACCOUNTS_DIR, "meta.json");
const WHAM_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

// ─── 文件 / 元数据 ────────────────────────────────────────────────────────────

export function ensureDir() {
  if (!fs.existsSync(ACCOUNTS_DIR)) {
    fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  }
}

export function loadJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function loadMeta() {
  const meta = loadJson(ACCOUNTS_META, { accounts: {}, current: null });
  if (!meta || typeof meta !== "object") return { accounts: {}, current: null };
  if (!meta.accounts || typeof meta.accounts !== "object") meta.accounts = {};
  if (!("current" in meta)) meta.current = null;
  return meta;
}

export function saveMeta(meta) {
  ensureDir();
  fs.writeFileSync(ACCOUNTS_META, JSON.stringify(meta, null, 2));
}

export function accountPath(name) {
  return path.join(ACCOUNTS_DIR, `${name}.json`);
}

export function readAuth(file = CODEX_AUTH) {
  return loadJson(file, null);
}

// ─── JWT / Token ──────────────────────────────────────────────────────────────

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function extractTokens(auth) {
  return {
    accessToken: auth?.accessToken || auth?.tokens?.access_token || auth?.access_token || null,
    idToken: auth?.idToken || auth?.tokens?.id_token || auth?.id_token || null,
  };
}

export function extractAccessToken(auth) {
  return extractTokens(auth).accessToken;
}

export function getTokenPayloads(auth) {
  const { accessToken, idToken } = extractTokens(auth);
  return {
    accessPayload: decodeJwtPayload(accessToken),
    idPayload: decodeJwtPayload(idToken),
  };
}

export function extractEmail(auth) {
  if (auth?.user?.email) return auth.user.email;
  if (auth?.email) return auth.email;
  const { accessPayload, idPayload } = getTokenPayloads(auth);
  return accessPayload?.["https://api.openai.com/profile"]?.email || idPayload?.email || null;
}

export function extractPlan(auth) {
  if (auth?.account?.planType) return auth.account.planType;
  const { accessPayload, idPayload } = getTokenPayloads(auth);
  return (
    accessPayload?.["https://api.openai.com/auth"]?.chatgpt_plan_type ||
    idPayload?.["https://api.openai.com/auth"]?.chatgpt_plan_type ||
    null
  );
}

export function extractAccountFingerprint(auth) {
  const { accessPayload, idPayload } = getTokenPayloads(auth);
  const authInfo =
    accessPayload?.["https://api.openai.com/auth"] ||
    idPayload?.["https://api.openai.com/auth"] ||
    null;
  return {
    subject: idPayload?.sub || accessPayload?.sub || null,
    accountId: auth?.tokens?.account_id || authInfo?.chatgpt_account_id || null,
    userId: authInfo?.chatgpt_user_id || authInfo?.user_id || null,
  };
}

// ─── 账号匹配 / 去重 ──────────────────────────────────────────────────────────

export function fingerprintsMatch(a, b) {
  return Boolean(
    (a?.accountId && b?.accountId && a.accountId === b.accountId) ||
    (a?.subject && b?.subject && a.subject === b.subject) ||
    (a?.userId && b?.userId && a.userId === b.userId)
  );
}

export function findDuplicateAccounts(targetName, fingerprint, meta) {
  const duplicates = [];
  for (const [otherName, otherInfo] of Object.entries(meta.accounts || {})) {
    if (otherName === targetName) continue;
    let otherFingerprint = otherInfo || {};
    const savedAuth = readAuth(accountPath(otherName));
    if (savedAuth) {
      otherFingerprint = { ...otherFingerprint, ...extractAccountFingerprint(savedAuth) };
    }
    if (fingerprintsMatch(fingerprint, otherFingerprint)) {
      duplicates.push(otherName);
    }
  }
  return duplicates;
}

export function findMatchingAccountName(meta, auth = readAuth()) {
  if (!auth) return null;
  const fingerprint = extractAccountFingerprint(auth);
  for (const [name, info] of Object.entries(meta.accounts || {})) {
    if (fingerprintsMatch(fingerprint, info || {})) return name;
  }
  return null;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

export function normalizeName(name) {
  return String(name || "").trim();
}

export function nowIso() {
  return new Date().toISOString();
}

export function sameLocalDay(a, b = new Date()) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatRelative(ts, { sameDayLabel = null } = {}) {
  if (!ts) return "从未";
  const time = new Date(ts);
  if (Number.isNaN(time.getTime())) return "未知";
  if (sameDayLabel && sameLocalDay(time)) return sameDayLabel;
  const diffMs = Date.now() - time.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 30) return `${diffDays}天前`;
  return time.toLocaleDateString("zh-CN");
}

export function formatResetCountdown(unixSeconds) {
  if (!unixSeconds) return null;
  const diffMs = unixSeconds * 1000 - Date.now();
  if (diffMs <= 0) return "即将重置";
  const totalHours = Math.floor(diffMs / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (days > 0) return `${days}天${hours}小时后重置`;
  if (hours > 0) return `${hours}小时${minutes}分钟后重置`;
  return `${Math.max(1, minutes)}分钟后重置`;
}

export function renderPercentBar(percent) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const total = 11;
  const filled = Math.round((clamped / 100) * total);
  return `${"█".repeat(filled)}${"░".repeat(total - filled)}`;
}

export function colorizeRemaining(text, remaining) {
  if (remaining <= 10) return chalk.red(text);
  if (remaining <= 40) return chalk.yellow(text);
  if (remaining <= 80) return chalk.hex("#f59e0b")(text);
  return chalk.green(text);
}

export function formatApiReset(unixSeconds, resetAfterSeconds) {
  if (unixSeconds) return formatResetCountdown(unixSeconds);
  if (resetAfterSeconds == null) return null;
  const totalHours = Math.floor(resetAfterSeconds / 3600);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((resetAfterSeconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时后重置`;
  if (hours > 0) return `${hours}小时${minutes}分钟后重置`;
  return `${Math.max(1, minutes)}分钟后重置`;
}

export function getAccountReferenceTime(info) {
  const timestamps = [info?.savedAt, info?.lastUsed]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  if (!timestamps.length) return null;
  return Math.max(...timestamps);
}

export function isUsageFresh(info) {
  const updatedAt = info?.usage?.updatedAt;
  if (!updatedAt) return false;
  const usageTime = new Date(updatedAt).getTime();
  if (Number.isNaN(usageTime)) return false;
  const refTime = getAccountReferenceTime(info);
  if (!refTime) return true;
  return usageTime >= refTime;
}

// ─── 元数据刷新 ───────────────────────────────────────────────────────────────

export function syncCurrentAccount(meta) {
  const matchedName = findMatchingAccountName(meta);
  if (!matchedName) return false;
  if (meta.current === matchedName) return false;
  meta.current = matchedName;
  return true;
}

export function refreshAccountMetadata(meta, name) {
  const auth = readAuth(accountPath(name));
  if (!auth) return false;
  const current = meta.accounts[name] || {};
  const email = extractEmail(auth);
  const plan = extractPlan(auth);
  const fingerprint = extractAccountFingerprint(auth);
  meta.accounts[name] = {
    ...current,
    email: email || current.email || null,
    plan: plan || current.plan || null,
    ...fingerprint,
  };
  return true;
}

export function refreshAllAccountMetadata(meta) {
  let changed = false;
  for (const name of Object.keys(meta.accounts || {})) {
    changed = refreshAccountMetadata(meta, name) || changed;
  }
  return changed;
}

// ─── 渲染（CLI 用）────────────────────────────────────────────────────────────

export function formatPlan(plan) {
  return plan ? `[${plan}]` : "";
}

export function renderAccountHeader(name, info, isCurrent) {
  const email = info?.email ? ` <${info.email}>` : "";
  const plan = formatPlan(info?.plan);
  const current = isCurrent ? " ← 当前" : "";
  return `${name}${email}${plan ? ` ${plan}` : ""}${current}`;
}

export function renderUsageLine(info) {
  const usage = info?.usage;
  if (usage?.source === "refresh_failed" && usage?.error) {
    return `    weekly: ${usage.error}`;
  }
  if (!usage || !isUsageFresh(info)) {
    return "    weekly: 暂无数据，请执行 coa list -R 刷新";
  }
  const lines = [];
  const pushUsageLine = (label, usedPercent, resetLabel, resetAt) => {
    if (typeof usedPercent !== "number") return;
    const remaining = Math.max(0, Math.min(100, Math.round(100 - usedPercent)));
    const resetText = resetLabel || formatResetCountdown(resetAt);
    const bar = colorizeRemaining(renderPercentBar(remaining), remaining);
    const percentText = colorizeRemaining(`${remaining}%`, remaining);
    const paddedLabel = `${label}:`.padEnd(7, " ");
    lines.push(`    ${paddedLabel}${bar} ${percentText} 剩余  ${resetText || "重置时间未知"}`);
  };
  if (typeof usage.secondaryUsedPercent === "number") {
    pushUsageLine("5h", usage.primaryUsedPercent, usage.primaryResetLabel, usage.primaryResetsAt);
    pushUsageLine("weekly", usage.secondaryUsedPercent, usage.secondaryResetLabel, usage.secondaryResetsAt);
  } else {
    pushUsageLine("weekly", usage.primaryUsedPercent, usage.primaryResetLabel, usage.primaryResetsAt);
  }
  return lines.length ? lines.join("\n") : "    weekly: 暂无数据，请执行 coa list -R 刷新";
}

// ─── Usage API（真正的异步）───────────────────────────────────────────────────

export function mapUsageResponse(data) {
  const rateLimit = data?.rate_limit || {};
  const primary = rateLimit.primary_window || null;
  const secondary = rateLimit.secondary_window || null;
  return {
    plan: data?.plan_type || null,
    primaryUsedPercent: primary?.used_percent ?? null,
    primaryResetsAt: primary?.reset_at ?? null,
    primaryResetLabel: formatApiReset(primary?.reset_at, primary?.reset_after_seconds),
    secondaryUsedPercent: secondary?.used_percent ?? null,
    secondaryResetsAt: secondary?.reset_at ?? null,
    secondaryResetLabel: formatApiReset(secondary?.reset_at, secondary?.reset_after_seconds),
    updatedAt: nowIso(),
    source: "api",
    error: null,
  };
}

export async function fetchUsageForAuth(auth) {
  const accessToken = extractAccessToken(auth);
  if (!accessToken) throw new Error("账号缺少 access token");

  // 【注意】这里填你本地科学上网工具的代理端口！
  // Clash 通常是 http://127.0.0.1:7890
  // v2rayN 通常是 http://127.0.0.1:10809
  // 如果你有环境变量，它会优先读取
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "http://127.0.0.1:7890";
  const dispatcher = new ProxyAgent(proxyUrl);

  const response = await fetch(WHAM_USAGE_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    // 将 dispatcher 传给原生的 fetch，强制它走代理
    dispatcher: dispatcher
  });

  if (!response.ok) {
      if (response.status === 401) throw new Error("Token已过期，请重新登录");
      throw new Error(`usage 接口返回 ${response.status}`);
  }
  
  return response.json();
}

export async function refreshUsageForAccount(meta, name, { strict = false } = {}) {
  const info = meta.accounts[name];
  if (!info) return false;
  const auth = readAuth(accountPath(name));
  if (!auth) return false;
  try {
    const data = await fetchUsageForAuth(auth);
    info.usage = mapUsageResponse(data);
    if (data?.email) info.email = data.email;
    if (data?.plan_type) info.plan = data.plan_type;
    return true;
  } catch (error) {
    if (strict) {
      info.usage = {
        ...(info.usage || {}),
        updatedAt: nowIso(),
        source: "refresh_failed",
        error: `实时刷新失败: ${error.message}`,
      };
      return true;
    }
    return false;
  }
}

export async function refreshAllUsage(meta, { strict = false } = {}) {
  let changed = false;
  for (const name of Object.keys(meta.accounts || {})) {
    changed = (await refreshUsageForAccount(meta, name, { strict })) || changed;
  }
  return changed;
}

// ─── CLI 命令 ─────────────────────────────────────────────────────────────────

export function cmdUse(rawName) {
  ensureDir();
  const name = normalizeName(rawName);
  const meta = loadMeta();
  if (!name) throw new Error("用法: coa use <名字>");
  if (!meta.accounts[name]) throw new Error(`账号 "${name}" 不存在`);
  const src = accountPath(name);
  if (!fs.existsSync(src)) throw new Error(`账号文件丢失，请重新执行 codex login 后再 coa add ${name}`);
  if (!fs.existsSync(CODEX_DIR)) fs.mkdirSync(CODEX_DIR, { recursive: true });
  fs.copyFileSync(src, CODEX_AUTH);
  meta.current = name;
  meta.accounts[name].lastUsed = nowIso();
  refreshAccountMetadata(meta, name);
  saveMeta(meta);
  console.log(chalk.green(`已切换到 "${name}"`));
  if (meta.accounts[name].email) console.log(chalk.gray(`  邮箱: ${meta.accounts[name].email}`));
  if (meta.accounts[name].plan) console.log(chalk.gray(`  套餐: ${meta.accounts[name].plan}`));
  console.log(chalk.gray("  重启 codex 后生效"));
}

export function cmdAdd(rawName) {
  ensureDir();
  const name = normalizeName(rawName);
  if (!name) throw new Error("用法: coa add <名字>");
  const auth = readAuth();
  if (!auth) throw new Error("未找到 ~/.codex/auth.json，请先运行 codex login");
  const meta = loadMeta();
  const email = extractEmail(auth);
  const plan = extractPlan(auth);
  const fingerprint = extractAccountFingerprint(auth);
  const existed = fs.existsSync(accountPath(name));
  const duplicateNames = findDuplicateAccounts(name, fingerprint, meta);
  if (duplicateNames.length) {
    throw new Error(`当前登录账号与已保存账号重复: ${duplicateNames.join(", ")}`);
  }
  fs.copyFileSync(CODEX_AUTH, accountPath(name));
  meta.accounts[name] = {
    ...meta.accounts[name],
    savedAt: nowIso(),
    lastUsed: meta.accounts[name]?.lastUsed || null,
    email,
    plan,
    ...fingerprint,
  };
  saveMeta(meta);
  console.log(chalk.green(`账号已${existed ? "更新" : "保存"}: "${name}"`));
  if (email) console.log(chalk.gray(`  邮箱: ${email}`));
  if (plan) console.log(chalk.gray(`  套餐: ${plan}`));
}

export async function cmdList(options = {}) {
  ensureDir();
  const meta = loadMeta();
  const names = Object.keys(meta.accounts);
  const refreshedMeta = refreshAllAccountMetadata(meta);
  const syncedCurrent = syncCurrentAccount(meta);
  const refreshedUsage = options.refresh ? await refreshAllUsage(meta, { strict: true }) : false;
  if (refreshedMeta || syncedCurrent || refreshedUsage) saveMeta(meta);
  if (names.length === 0) {
    console.log(chalk.yellow("没有保存的账号"));
    console.log(chalk.gray("  先运行 codex login，然后执行 coa add <名字>"));
    return;
  }
  console.log("");
  for (const name of names) {
    const info = meta.accounts[name] || {};
    const isCurrent = meta.current === name;
    console.log(`  ${renderAccountHeader(name, info, isCurrent)}`);
    console.log(`    切换: ${formatRelative(info.lastUsed)}   保存: ${formatRelative(info.savedAt, { sameDayLabel: "今天" })}`);
    console.log(renderUsageLine(info));
    console.log("");
  }
  if (options.select) {
    const chosen = await promptAccountSelection(
      "选择要切换的账号 (↑↓ 选择, Enter 确认, Esc 取消)",
      names.map((name) => ({
        value: name,
        name: renderAccountHeader(name, meta.accounts[name], meta.current === name),
      }))
    );
    if (chosen && chosen !== meta.current) cmdUse(chosen);
  }
}

export function cmdRemove(rawName) {
  const name = normalizeName(rawName);
  const meta = loadMeta();
  if (!name) throw new Error("用法: coa remove <名字>");
  if (!meta.accounts[name]) throw new Error(`账号 "${name}" 不存在`);
  const file = accountPath(name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  delete meta.accounts[name];
  if (meta.current === name) meta.current = null;
  saveMeta(meta);
  console.log(chalk.green(`已删除 "${name}"`));
}

export async function cmdCurrent(options = {}) {
  const meta = loadMeta();
  const syncedCurrent = syncCurrentAccount(meta);
  const refreshedCurrentMeta = meta.current ? refreshAccountMetadata(meta, meta.current) : false;
  const refreshedUsage =
    options.refresh && meta.current
      ? await refreshUsageForAccount(meta, meta.current, { strict: true })
      : false;
  if (syncedCurrent || refreshedCurrentMeta || refreshedUsage) saveMeta(meta);
  if (!meta.current) {
    console.log(chalk.yellow("当前没有激活的账号"));
    return;
  }
  const info = meta.accounts[meta.current] || {};
  console.log(chalk.green(renderAccountHeader(meta.current, info, true)));
  console.log(renderUsageLine(info));
}

export async function promptAccountSelection(message, choices) {
  const controller = new AbortController();
  const stdin = process.stdin;
  const wasRaw = Boolean(stdin.isRaw);
  let canceled = false;
  const onKeypress = (_, key = {}) => {
    if (key.name === "escape") {
      canceled = true;
      controller.abort();
    }
  };
  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY && typeof stdin.setRawMode === "function" && !wasRaw) {
    stdin.setRawMode(true);
  }
  stdin.on("keypress", onKeypress);
  try {
    return await select({ message, choices }, { signal: controller.signal });
  } catch (error) {
    if (canceled || error?.name === "AbortPromptError" || error?.name === "ExitPromptError") {
      console.log(chalk.gray("已取消"));
      return null;
    }
    throw error;
  } finally {
    stdin.off("keypress", onKeypress);
    if (stdin.isTTY && typeof stdin.setRawMode === "function" && !wasRaw) {
      stdin.setRawMode(false);
    }
  }
}

export async function cmdChange() {
  ensureDir();
  const meta = loadMeta();
  const names = Object.keys(meta.accounts);
  if (names.length === 0) {
    console.log(chalk.yellow("没有保存的账号"));
    console.log(chalk.gray("  先运行 codex login，然后执行 coa add <名字>"));
    return;
  }
  const chosen = await promptAccountSelection(
    "选择要切换的账号 (↑↓ 选择, Enter 确认, Esc 取消)",
    names.map((name) => ({
      value: name,
      name: renderAccountHeader(name, meta.accounts[name], meta.current === name),
    }))
  );
  if (!chosen) return;
  cmdUse(chosen);
}

export function printHelp() {
  console.log(`
${chalk.bold("coa")} - Codex 账号管理

${chalk.bold("用法:")}
  ${chalk.cyan("coa add")}     ${chalk.yellow("<名字>")}    保存当前登录的账号
  ${chalk.cyan("coa list")}                   列出所有账号
  ${chalk.cyan("coa ls")}                     列出所有账号
  ${chalk.cyan("coa list")}    ${chalk.yellow("-R")}         通过 usage 接口刷新所有账号 usage
  ${chalk.cyan("coa ls")}      ${chalk.yellow("-R")}         通过 usage 接口刷新所有账号 usage
  ${chalk.cyan("coa list")}    ${chalk.yellow("-S")}         列出账号后交互式选择切换
  ${chalk.cyan("coa ls")}      ${chalk.yellow("-S")}         列出账号后交互式选择切换
  ${chalk.cyan("coa use")}     ${chalk.yellow("<名字>")}    切换到指定账号
  ${chalk.cyan("coa change")}                 交互式选择并切换账号
  ${chalk.cyan("coa current")}                显示当前账号
  ${chalk.cyan("coa current")} ${chalk.yellow("-R")}         通过 usage 接口刷新当前账号 usage
  ${chalk.cyan("coa remove")}  ${chalk.yellow("<名字>")}    删除账号
`);
}

// ─── CLI 入口（只在直接运行时执行，被 server.js import 时跳过）────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [sub, ...args] = process.argv.slice(2);
  const refresh = args.includes("--refresh") || args.includes("-R");
  const selectAfterList = args.includes("--select") || args.includes("-S");

  async function main() {
    switch (sub) {
      case "add":      cmdAdd(args[0]); break;
      case "list":
      case "ls":       await cmdList({ refresh, select: selectAfterList }); break;
      case "use":      cmdUse(args[0]); break;
      case "remove":   cmdRemove(args[0]); break;
      case "current":  await cmdCurrent({ refresh }); break;
      case "change":   await cmdChange(); break;
      default:         printHelp();
    }
  }

  main().catch((error) => {
    console.error(chalk.red("错误:"), error?.message || error);
    process.exit(1);
  });
}