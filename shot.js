// 独立截图脚本：起静态服务器 → puppeteer-core 复用已装 Chrome 精确锁定视口截图 → 关服务器
// 用法：node shot.js <dist目录> <输出png> [宽] [高] [页面路径]
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(process.argv[2] || 'dist-shot');
const OUT = path.resolve(process.argv[3] || 'shot.png');
const W = parseInt(process.argv[4] || '390', 10);
const H = parseInt(process.argv[5] || '844', 10);
// 可选：加载的页面路径。Git Bash 的 MSYS 路径转换会把 /probe.html 篡改成
// H:/Program Files/Git/probe.html，这里只取最后的文件名部分兜底。
let PAGE = process.argv[6] || '/';
{
  const m = PAGE.match(/[^\\/]+\.html?$/i);
  PAGE = m ? '/' + m[0] : '/';
}
// 可选：截图前点击包含该文本的元素（用来切换底部 Tab，如 健身/日历/管理）
const CLICK_TEXT = process.argv[7] || '';
const PORT = 9500;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.map': 'application/json', '.ttf': 'font/ttf',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(ROOT, urlPath);
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        // SPA 兜底：找不到就回 index.html
        const idx = path.join(ROOT, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(fs.readFileSync(idx));
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  if (!CHROME) { console.error('no chrome'); process.exit(1); }
  const server = await serve();
  console.log('server up on', PORT);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage();
    // CDP 精确锁定 CSS 视口，所见即所得（不受窗口边框影响）
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${PORT}${PAGE}`, { waitUntil: 'networkidle0', timeout: 30000 });
    // 再给 JS 一点渲染时间
    await new Promise((r) => setTimeout(r, 800));
    // 可选：依次点击包含指定文本的元素（用 > 分隔多步，如 健身>胸>卧推）
    if (CLICK_TEXT) {
      const steps = CLICK_TEXT.split('>').map((s) => s.trim()).filter(Boolean);
      for (const txt of steps) {
        const clicked = await page.evaluate((t) => {
          const els = Array.from(document.querySelectorAll('*'));
          // 找最深、文本正好等于目标的可点节点
          const hit = els.reverse().find(
            (el) => el.children.length === 0 && (el.textContent || '').trim() === t,
          );
          if (!hit) return false;
          let target = hit;
          // 向上找到可点的容器（div[tabindex]/带 onclick 的祖先）
          for (let i = 0; i < 6 && target.parentElement; i++) target = target.parentElement;
          (hit).click();
          (target).click();
          return true;
        }, txt);
        console.log('click', txt, clicked ? 'ok' : 'not-found');
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    await page.screenshot({ path: OUT });
  } finally {
    await browser.close();
    server.close();
  }

  if (fs.existsSync(OUT)) {
    console.log('OK screenshot:', OUT, fs.statSync(OUT).size, 'bytes');
  } else {
    console.error('FAILED: no screenshot produced');
    process.exit(2);
  }
}

main();
