// 달 없는 밤: 등불을 든 자 — PC 실행기
// 게임 자체는 서버에서 받아오므로 배포하면 다음 실행(또는 재접속)부터 자동으로 최신.
// 실행기 프로그램은 GitHub Releases로 자동 업데이트(electron-updater).
const { app, BrowserWindow, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

const GAME_URL = process.env.BC_URL || 'https://43-202-116-151.sslip.io/';
const GAME_ORIGIN = new URL(GAME_URL).origin;
// 서버 이전(2026-10): 예전 주소에 저장된 캐릭터를 처음 한 번 옮겨 온다.
// 예전 주소가 저장 데이터를 챙겨 새 주소로 넘겨주므로, 그 이동만 실행기 안에서 허용한다.
const OLD_URL = 'https://blood-catacomb.onrender.com/';
const OLD_ORIGIN = new URL(OLD_URL).origin;
const ALLOWED = new Set([GAME_ORIGIN, OLD_ORIGIN]);

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null, splash = null, tries = 0, shown = false;

const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return { width: 1440, height: 810 }; }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, max: win.isMaximized(), full: win.isFullScreen() }));
  } catch (e) { /* 무시 */ }
}

function splashMsg(t) {
  if (splash && !splash.isDestroyed()) splash.webContents.executeJavaScript(`window.setMsg&&setMsg(${JSON.stringify(t)})`).catch(() => {});
}

function createWindows() {
  const st = loadState();
  const icon = path.join(__dirname, 'icon.png');

  splash = new BrowserWindow({
    width: 520, height: 320, frame: false, resizable: false, show: true, center: true,
    backgroundColor: '#050407', icon, skipTaskbar: false, title: '달 없는 밤',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  splash.loadFile(path.join(__dirname, 'splash.html'), { query: { v: app.getVersion() } });

  win = new BrowserWindow({
    width: st.width || 1440, height: st.height || 810, x: st.x, y: st.y,
    minWidth: 960, minHeight: 540, show: false, backgroundColor: '#050407',
    title: '달 없는 밤: 등불을 든 자', icon, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false }
  });
  win.setMenu(null);

  // 게임이 실행기 안에서 돌고 있다는 표시(웹 화면의 'PC 버전 다운로드' 버튼 숨김 등)
  const ua = win.webContents.getUserAgent().replace(/Electron\/\S+\s?/, '') + ` BCDesktop/${app.getVersion()}`;
  win.webContents.setUserAgent(ua);

  const movedFile = path.join(app.getPath('userData'), 'moved-seoul.flag');
  const needMove = !process.env.BC_URL && !fs.existsSync(movedFile);
  const go = () => { win.loadURL(needMove ? OLD_URL : GAME_URL).catch(() => {}); };
  // 새 주소에 도착하면 이전 완료로 기록 → 다음부터는 새 주소로 바로 접속
  win.webContents.on('did-navigate', (e, url) => {
    try { if (needMove && new URL(url).origin === GAME_ORIGIN) fs.writeFileSync(movedFile, String(Date.now())); } catch (er) { /* 무시 */ }
  });

  win.webContents.on('did-finish-load', () => {
    if (shown) return;
    // 예전 주소의 '이동 중' 화면에서는 아직 창을 띄우지 않음 (새 주소 도착 후 표시)
    try { if (new URL(win.webContents.getURL()).origin !== GAME_ORIGIN) { splashMsg('새 서울 서버로 캐릭터를 옮기는 중…'); return; } } catch (er) { /* 무시 */ }
    shown = true;
    if (splash && !splash.isDestroyed()) { splash.destroy(); splash = null; }
    if (st.max) win.maximize();
    win.show();
    if (st.full) win.setFullScreen(true);
    win.focus();
  });
  // Render 무료 서버는 잠들어 있으면 깨어나는 데 최대 1분쯤 걸림 → 실패하면 3초 뒤 다시
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || shown) return;
    tries++;
    splashMsg(tries < 3 ? '서버를 깨우는 중… 잠시만 기다려 주세요' : `서버에 연결하는 중… (${tries}번째 시도) · 인터넷 연결을 확인해 주세요`);
    setTimeout(go, 3000);
  });

  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11' || (i.alt && i.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'F5') { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
    else if (i.key === 'F12' && i.control && i.shift) { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    try { if (!ALLOWED.has(new URL(url).origin)) { e.preventDefault(); shell.openExternal(url); } } catch (er) { e.preventDefault(); }
  });
  win.on('page-title-updated', e => e.preventDefault());
  win.on('close', saveState);
  win.on('closed', () => { win = null; });

  // 늘 최신 게임 파일을 받도록 시작할 때 캐시를 비움(캐릭터 저장은 그대로)
  session.defaultSession.clearCache().catch(() => {}).finally(go);
}

function setupUpdater() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let asked = false;
  autoUpdater.on('update-downloaded', info => {
    if (asked) return;
    asked = true;
    dialog.showMessageBox(win || undefined, {
      type: 'info', buttons: ['지금 재시작', '나중에'], defaultId: 0, cancelId: 1, title: '실행기 업데이트',
      message: `새 실행기 버전 ${info.version}이(가) 준비됐어요.`,
      detail: '지금 재시작하면 바로 적용돼요. "나중에"를 누르면 게임을 끌 때 자동으로 적용돼요.\n캐릭터는 그대로 남아 있어요.'
    }).then(r => { if (r.response === 0) { saveState(); autoUpdater.quitAndInstall(true, true); } });
  });
  autoUpdater.on('error', () => {});
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 4000);
  setInterval(check, 60 * 60 * 1000);
}

app.on('second-instance', () => {
  const w = win && win.isVisible() ? win : splash;
  if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.whenReady().then(() => { createWindows(); setupUpdater(); });
app.on('window-all-closed', () => app.quit());
