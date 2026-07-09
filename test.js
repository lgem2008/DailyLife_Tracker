// 功能测试脚本：起静态服务器 → puppeteer 驱动交互 → 捕获运行时报错
// 用法：node test.js <dist目录>
// 以“测试员”身份实际走一遍健身记录流程：切 Tab → 选部位 → 选动作 → 填重量次数 → 保存
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(process.argv[2] || 'dist-shot');
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

// 点击“文本正好等于 t”的最深节点，并冒泡点它的祖先容器
async function clickText(page, t) {
  const ok = await page.evaluate((txt) => {
    const els = Array.from(document.querySelectorAll('*'));
    const hit = els.reverse().find(
      (el) => el.children.length === 0 && (el.textContent || '').trim() === txt,
    );
    if (!hit) return false;
    let target = hit;
    for (let i = 0; i < 6 && target.parentElement; i++) target = target.parentElement;
    hit.click();
    target.click();
    return true;
  }, t);
  await new Promise((r) => setTimeout(r, 500));
  return ok;
}

async function main() {
  if (!CHROME) { console.error('no chrome'); process.exit(1); }
  const server = await serve();
  const errors = [];

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  // 抓运行时报错
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  console.log('步骤1 切到健身:', await clickText(page, '健身'));
  console.log('步骤2 选部位 胸:', await clickText(page, '胸'));
  console.log('步骤3 选动作 卧推:', await clickText(page, '卧推'));

  // 步骤4：往前两个 input 填 重量 / 次数
  const filled = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    if (inputs.length < 2) return { count: inputs.length };
    const setVal = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      desc.set.call(el, v); // 触发 React 受控组件的 onChange
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(inputs[0], '50');
    setVal(inputs[1], '10');
    return { count: inputs.length, v0: inputs[0].value, v1: inputs[1].value };
  });
  console.log('步骤4 填入重量/次数:', JSON.stringify(filled));
  await new Promise((r) => setTimeout(r, 400));

  console.log('步骤5 点击 保存这次训练:', await clickText(page, '保存这次训练'));
  await new Promise((r) => setTimeout(r, 900));
  // 保存后自动回到动作列表。确认历史已写入 localStorage
  const wkBefore = await page.evaluate(() => {
    try { return JSON.parse(window.localStorage.getItem('dlt_workouts') || '[]').length; } catch (e) { return -1; }
  });
  console.log('步骤6 保存后训练记录条数:', wkBefore, wkBefore >= 1 ? 'OK' : 'FAIL');

  // 步骤7：删除“卧推”——先挂上 confirm 拦截器（记录是否被调用，并自动确认）
  let confirmFired = false;
  page.on('dialog', async (d) => { confirmFired = true; await d.accept(); });
  await page.evaluate(() => { window.__origConfirm = window.confirm; });
  // 点“卧推”那一行的 ✕
  const delClicked = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('*')).filter(
      (el) => (el.textContent || '').includes('卧推'),
    );
    // 找到含 ✕ 的可点子节点
    const x = Array.from(document.querySelectorAll('*')).find(
      (el) => el.children.length === 0 && (el.textContent || '').trim() === '✕',
    );
    if (!x) return false;
    x.click();
    let t = x; for (let i = 0; i < 3 && t.parentElement; i++) { t = t.parentElement; t.click(); }
    return true;
  });
  await new Promise((r) => setTimeout(r, 800));
  console.log('步骤7 点删除✕:', delClicked, '| 确认框触发:', confirmFired ? 'OK' : 'FAIL');

  // 步骤8：动作是否从列表消失 + 历史是否保留
  const afterState = await page.evaluate(() => {
    const listHasWoTui = Array.from(document.querySelectorAll('*')).some(
      (el) => el.children.length === 0 && (el.textContent || '').trim() === '卧推',
    );
    let exList = [];
    let wkCount = -1;
    try { exList = JSON.parse(window.localStorage.getItem('dlt_exercises') || '{}').chest || []; } catch (e) {}
    try { wkCount = JSON.parse(window.localStorage.getItem('dlt_workouts') || '[]').length; } catch (e) {}
    return { listHasWoTui, exListHasWoTui: exList.includes('卧推'), wkCount };
  });
  console.log('步骤8 列表还显示卧推:', afterState.listHasWoTui, afterState.listHasWoTui ? 'FAIL' : 'OK(已消失)');
  console.log('        动作数据里还有卧推:', afterState.exListHasWoTui, afterState.exListHasWoTui ? 'FAIL' : 'OK(已删)');
  console.log('        训练历史仍保留:', afterState.wkCount, afterState.wkCount >= 1 ? 'OK' : 'FAIL');

  await page.screenshot({ path: path.resolve('test-result.png') });

  await browser.close();
  server.close();

  console.log('\n===== 捕获到的运行时报错 =====');
  if (errors.length === 0) console.log('（无）');
  else errors.forEach((e) => console.log(e));
}

main();
