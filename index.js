#!/usr/bin/env node

import chalk from "chalk";
import select from "@inquirer/select";
import fs from "fs";
import path from "path";
import os from "os";

const CODEX_AUTH    = path.join(os.homedir(), ".codex", "auth.json");
const ACCOUNTS_DIR  = path.join(os.homedir(), ".codex-accounts");
const ACCOUNTS_META = path.join(ACCOUNTS_DIR, "meta.json");

function ensureDir() {
  if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
}

function loadMeta() {
  if (!fs.existsSync(ACCOUNTS_META)) return { accounts: {}, current: null };
  return JSON.parse(fs.readFileSync(ACCOUNTS_META, "utf8"));
}

function saveMeta(meta) {
  fs.writeFileSync(ACCOUNTS_META, JSON.stringify(meta, null, 2));
}

function accountPath(name) {
  return path.join(ACCOUNTS_DIR, `${name}.json`);
}

function readAuth() {
  if (!fs.existsSync(CODEX_AUTH)) return null;
  try { return JSON.parse(fs.readFileSync(CODEX_AUTH, "utf8")); }
  catch { return null; }
}

function timeAgo(ts) {
  if (!ts) return chalk.gray("从未");
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return chalk.gray(`${d}天前`);
  if (h > 0) return chalk.gray(`${h}小时前`);
  if (m > 0) return chalk.gray(`${m}分钟前`);
  return chalk.gray("刚刚");
}

function extractToken(auth) {
  return auth?.accessToken || auth?.tokens?.access_token || auth?.access_token || null;
}

function extractEmail(auth) {
  if (auth?.user?.email) return auth.user.email;
  const token = extractToken(auth);
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      return payload?.["https://api.openai.com/profile"]?.email || null;
    } catch {}
  }
  return auth?.email || null;
}

function extractPlan(auth) {
  return auth?.account?.planType || null;
}

// ── 命令 ──────────────────────────────────────────────────

async function cmdAdd(name) {
  ensureDir();
  const auth = readAuth();
  if (!auth) {
    console.error(chalk.red("✗ 未找到 ~/.codex/auth.json，请先运行 codex login"));
    process.exit(1);
  }
  const existed = fs.existsSync(accountPath(name));
  fs.copyFileSync(CODEX_AUTH, accountPath(name));

  const meta  = loadMeta();
  const email = extractEmail(auth);
  const plan  = extractPlan(auth);
  meta.accounts[name] = {
    savedAt:  new Date().toISOString(),
    lastUsed: meta.accounts[name]?.lastUsed || null,
    email,
    plan,
  };
  saveMeta(meta);

  console.log(chalk.green(`✓ 账号已${existed ? "更新" : "保存"}为 "${name}"`));
  if (email) console.log(chalk.gray(`  邮箱: ${email}`));
  if (plan)  console.log(chalk.gray(`  套餐: ${plan}`));
}

async function cmdList() {
  ensureDir();
  const meta  = loadMeta();
  const names = Object.keys(meta.accounts);

  if (names.length === 0) {
    console.log(chalk.yellow("没有保存的账号"));
    console.log(chalk.gray("  先运行: codex login  然后:  coa add <名字>"));
    return;
  }

  console.log("");
  for (const name of names) {
    const info  = meta.accounts[name];
    const isCur = meta.current === name;
    const bullet = isCur ? chalk.green("●") : chalk.gray("○");
    const label  = isCur ? chalk.green.bold(name) : chalk.white(name);
    const cur    = isCur ? chalk.green(" ← 当前") : "";
    const email  = info.email ? chalk.gray(` <${info.email}>`) : "";
    const plan   = info.plan  ? chalk.blue(` [${info.plan}]`)  : "";

    console.log(`  ${bullet} ${label}${email}${plan}${cur}`);
    console.log(`    ${chalk.gray("切换:")} ${timeAgo(info.lastUsed)}   ${chalk.gray("保存:")} ${timeAgo(info.savedAt)}`);
    console.log("");
  }
}

async function cmdUse(name) {
  ensureDir();
  const meta = loadMeta();

  if (!meta.accounts[name]) {
    console.error(chalk.red(`✗ 账号 "${name}" 不存在`));
    const list = Object.keys(meta.accounts);
    if (list.length) console.log(chalk.gray(`  可用: ${list.join("  ")}`));
    process.exit(1);
  }

  const src = accountPath(name);
  if (!fs.existsSync(src)) {
    console.error(chalk.red(`✗ 账号文件丢失，请重新 codex login 后 coa add ${name}`));
    process.exit(1);
  }

  const codexDir = path.dirname(CODEX_AUTH);
  if (!fs.existsSync(codexDir)) fs.mkdirSync(codexDir, { recursive: true });

  fs.copyFileSync(src, CODEX_AUTH);
  meta.current = name;
  meta.accounts[name].lastUsed = new Date().toISOString();
  saveMeta(meta);

  const info = meta.accounts[name];
  console.log(chalk.green(`✓ 已切换到 "${name}"`));
  if (info.email) console.log(chalk.gray(`  邮箱: ${info.email}`));
  console.log(chalk.gray("  重启 codex 生效"));
}

async function cmdRemove(name) {
  const meta = loadMeta();
  if (!meta.accounts[name]) {
    console.error(chalk.red(`✗ 账号 "${name}" 不存在`));
    process.exit(1);
  }
  const f = accountPath(name);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  delete meta.accounts[name];
  if (meta.current === name) meta.current = null;
  saveMeta(meta);
  console.log(chalk.green(`✓ 已删除 "${name}"`));
}

async function cmdCurrent() {
  const meta = loadMeta();
  if (!meta.current) {
    console.log(chalk.yellow("当前没有激活的账号"));
    return;
  }
  const info  = meta.accounts[meta.current];
  const email = info?.email ? chalk.gray(` <${info.email}>`) : "";
  const plan  = info?.plan  ? chalk.blue(` [${info.plan}]`)  : "";
  console.log(chalk.green(`● ${meta.current}`) + email + plan);
}

async function cmdChange() {
  ensureDir();
  const meta  = loadMeta();
  const names = Object.keys(meta.accounts);

  if (names.length === 0) {
    console.log(chalk.yellow("没有保存的账号"));
    console.log(chalk.gray("  先运行: codex login  然后:  coa add <名字>"));
    return;
  }

  const chosen = await select({
    message: "选择要切换的账号",
    choices: names.map(name => {
      const info  = meta.accounts[name];
      const isCur = meta.current === name;
      const email = info.email ? ` <${info.email}>` : "";
      const plan  = info.plan  ? ` [${info.plan}]`  : "";
      const cur   = isCur ? " ← 当前" : "";
      return {
        value: name,
        name:  `${isCur ? "●" : "○"} ${name}${email}${plan}${cur}`,
      };
    }),
  });

  await cmdUse(chosen);
}

function printHelp() {
  console.log(`
${chalk.bold("coa")} — Codex 账号管理

${chalk.bold("用法:")}
  ${chalk.cyan("coa add")}     ${chalk.yellow("<名字>")}  保存当前登录的账号
  ${chalk.cyan("coa list")}             列出所有账号
  ${chalk.cyan("coa use")}     ${chalk.yellow("<名字>")}  切换到指定账号
  ${chalk.cyan("coa change")}           交互式选择并切换账号
  ${chalk.cyan("coa current")}          显示当前账号
  ${chalk.cyan("coa remove")}  ${chalk.yellow("<名字>")}  删除账号

${chalk.bold("流程:")}
  codex login       登录账号1
  coa add work      保存为 work

  codex logout
  codex login       登录账号2
  coa add personal  保存为 personal

  coa change        交互式切换
`);
}

// ── 入口 ──────────────────────────────────────────────────
const [sub, ...args] = process.argv.slice(2);

async function main() {
  switch (sub) {
    case "add":
      if (!args[0]) { console.error(chalk.red("用法: coa add <名字>")); process.exit(1); }
      await cmdAdd(args[0]);
      break;
    case "list":
      await cmdList();
      break;
    case "use":
      if (!args[0]) { console.error(chalk.red("用法: coa use <名字>")); process.exit(1); }
      await cmdUse(args[0]);
      break;
    case "remove":
      if (!args[0]) { console.error(chalk.red("用法: coa remove <名字>")); process.exit(1); }
      await cmdRemove(args[0]);
      break;
    case "current":
      await cmdCurrent();
      break;
    case "change":
      await cmdChange();
      break;
    default:
      printHelp();
  }
}

main().catch(e => { console.error(chalk.red("错误:"), e.message); process.exit(1); });