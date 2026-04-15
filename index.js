import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    loadMeta,
    saveMeta,
    refreshAllAccountMetadata,
    refreshUsageForAccount,
    cmdUse,
} from './core.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static('public'));

// 获取所有账号列表和状态
app.get('/api/accounts', (req, res) => {
    try {
        const meta = loadMeta();
        refreshAllAccountMetadata(meta);
        const list = Object.entries(meta.accounts).map(([name, info]) => ({
            name,
            ...info,
            isCurrent: meta.current === name,
        }));
        res.json({ accounts: list, current: meta.current });
    } catch (e) {
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 界面已启动: http://localhost:${PORT}`);
});