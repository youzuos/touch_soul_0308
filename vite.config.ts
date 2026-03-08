import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 从与 vite.config.ts 同目录的 .env 显式读取 DEEPSEEK_API_KEY，避免 loadEnv 路径问题
function readEnvFromFile(): Record<string, string> {
  const envPath = path.join(__dirname, '.env');
  const out: Record<string, string> = {};
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch (_) {}
  return out;
}

export default defineConfig(({ mode }) => {
    const fileEnv = readEnvFromFile();
    const env = loadEnv(mode, __dirname, '');
    // 优先：同目录 .env 文件 > loadEnv > 系统环境变量
    const apiKey = (fileEnv.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim();
    if (apiKey) {
      console.log('[Vite] DEEPSEEK_API_KEY 已从 .env 加载');
    } else {
      console.warn('[Vite] 未检测到 DEEPSEEK_API_KEY，请确认 touchsoul/.env 存在且包含 DEEPSEEK_API_KEY=你的密钥');
    }
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // 用 Vite 官方方式注入到前端，保证浏览器里能拿到
        'import.meta.env.VITE_DEEPSEEK_API_KEY': JSON.stringify(apiKey),
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.DEEPSEEK_API_KEY': JSON.stringify(apiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
