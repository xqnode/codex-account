#!/usr/bin/env node

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    loadMeta,
    saveMeta,
    refreshAllAccountMetadata,
    refreshUsageForAccount,
    cmdUse,
    cmdAdd,
    cmdList,
    cmdRemove,
    cmdCurrent,
    cmdChange,
    printHelp,
    readAuth,      
    extractEmail,    
} from './core.js';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_COMMANDS = new Set(["add", "list", "ls", "use", "remove", "current", "change"]);

function createApp() {
    const app = express();

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    // 获取所有账号列表和状态
    app.get('/api/accounts', (req, res) => {
        console.log(`\n[${new Date().toLocaleTimeString()}] 🟢 正在刷新账号列表元数据...`);
        try {
            const meta = loadMeta();
        
            // 记录刷新前的账号数量
            const accountNames = Object.keys(meta.accounts);
            console.log(`[LOG] 找到 ${accountNames.length} 个本地备份账号: [${accountNames.join(', ')}]`);

            // 执行元数据刷新（同步当前激活状态和账号信息）
            const changed = refreshAllAccountMetadata(meta);
            if (changed) {
                console.log(`[LOG] 检测到账号状态更新，已同步至 meta.json`);
                saveMeta(meta);
            }

            const list = Object.entries(meta.accounts).map(([name, info]) => ({
                name,
                ...info,
                isCurrent: meta.current === name,
            }));

            console.log(`[LOG] 当前激活账号: ${meta.current || '未指定'}`);
            console.log(`[${new Date().toLocaleTimeString()}] ✅ 列表数据组装完成`);
        
            res.json({ accounts: list, current: meta.current });
        } catch (e) {
            console.error(`[${new Date().toLocaleTimeString()}] ❌ 刷新列表失败:`, e.message);
            res.status(500).json({ error: e.message });
        }
    });

    // 切换账号
    app.post('/api/use', (req, res) => {
        const { name } = req.body;
        try {
            cmdUse(name);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 刷新单个账号 Usage
    app.post('/api/refresh', async (req, res) => {
        const { name } = req.body;
        console.log(`\n[API] 正在刷新账号额度: ${name} ...`);
        try {
            const meta = loadMeta();
            const success = await refreshUsageForAccount(meta, name, { strict: true });
            if (success) saveMeta(meta);
        
            const usage = meta.accounts[name]?.usage;
            if (usage?.error) {
                console.log(`[API] ❌ ${name} 刷新失败:`, usage.error);
            } else {
                console.log(`[API] ✅ ${name} 刷新成功`);
            }
        
            res.json({ success, usage: usage ?? null });
        } catch (e) {
            console.error(`[API] ❌ ${name} 代码执行报错:`, e);
            res.status(500).json({ error: e.message });
        }
    });


    // 合并：一键登录并自动保存
    app.post('/api/login-and-auto-save', (req, res) => {
        const isWin = process.platform === "win32";
    
        // Windows: start /wait 会弹出窗口，并在窗口关闭后才回调
        // /c 表示执行完就关闭窗口
        const command = isWin 
            ? 'start /wait cmd /c "codex login"' 
            : 'codex login';

        console.log("[Process] 正在启动登录进程...");

        exec(command, (error) => {
            if (error) {
                console.error("登录失败或被手动关闭:", error);
                return res.status(500).json({ error: "登录进程被中断" });
            }

            try {
                // 第一步：登录窗口已关闭，现在尝试读取新生成的 auth.json
                const auth = readAuth();
                if (!auth) throw new Error("登录似乎未完成，找不到凭据");

                // 第二步：自动提取邮箱前缀
                const email = extractEmail(auth);
                if (!email) throw new Error("登录成功但无法解析邮箱，请手动保存");
            
                const name = email.split('@')[0];

                // 第三步：直接调用核心保存逻辑
                console.log(`[Process] 检测到账号 ${email}，正在自动保存为 ${name}...`);
                cmdAdd(name);

                // 第四步：返回给前端成功信号
                res.json({ success: true, name: name });
            } catch (e) {
                console.error("自动保存失败:", e);
                res.status(500).json({ error: e.message });
            }
        });
    });

    return app;
}

// 引入 open 工具或使用原生 child_process
const PORT = 37891;
const url = `http://localhost:${PORT}`;

function startDashboard() {
    const app = createApp();

    app.listen(PORT, () => {
        console.log(`🚀 界面已启动: ${url}`);

        // 根据操作系统执行打开浏览器的命令
        const start = 
            process.platform === 'darwin' ? 'open' : 
            process.platform === 'win32' ? 'start' : 
            'xdg-open';
    
        // 延迟 500ms 确保服务已经完全就绪再打开
        setTimeout(() => {
            exec(`${start} ${url}`);
        }, 500);
    });
}

async function runCli(sub, args) {
    const refresh = args.includes("--refresh") || args.includes("-R");
    const selectAfterList = args.includes("--select") || args.includes("-S");
    const positionalArgs = args.filter((arg) => !arg.startsWith("-"));

    switch (sub) {
        case "add":      cmdAdd(positionalArgs[0]); break;
        case "list":
        case "ls":       await cmdList({ refresh, select: selectAfterList }); break;
        case "use":      cmdUse(positionalArgs[0]); break;
        case "remove":   cmdRemove(positionalArgs[0]); break;
        case "current":  await cmdCurrent({ refresh }); break;
        case "change":   await cmdChange(); break;
        default:         printHelp();
    }
}

async function main() {
    const [sub, ...args] = process.argv.slice(2);

    if (!sub || ["dashboard", "web", "server", "start"].includes(sub)) {
        startDashboard();
        return;
    }

    if (sub === "--help" || sub === "-h" || sub === "help") {
        printHelp();
        return;
    }

    if (!CLI_COMMANDS.has(sub)) {
        printHelp();
        return;
    }

    await runCli(sub, args);
}

main().catch((error) => {
    console.error("错误:", error?.message || error);
    process.exit(1);
});
