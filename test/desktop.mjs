/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Endcord Desktop's main process (desktop/src/main.ts), bundled and run against a stubbed Electron: it starts, its
// window, permissions and screen sharing only ever serve Discord's page, and the tray, badge and menus behave.
import esbuild from "esbuild";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "dist", ".desktop-test");
const DATA = join(tmpdir(), `endcord-desktop-test-${process.pid}`);

let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
    if (!ok) failed++;
}

const ELECTRON_STUB = `
const s = globalThis.__electron;
export const app = s.app, BrowserWindow = s.BrowserWindow, clipboard = s.clipboard, desktopCapturer = s.desktopCapturer,
    ipcMain = s.ipcMain, Menu = s.Menu, nativeImage = s.nativeImage, net = s.net, screen = s.screen, session = s.session, shell = s.shell, Tray = s.Tray;
`;
// The process list games are looked for in (desktop/src/games.ts)
const CHILD_PROCESS_STUB = `
export { execFileSync } from "node:child_process";
export function execFile(file, args, options, callback) {
    globalThis.__tasklistRuns = (globalThis.__tasklistRuns ?? 0) + 1;
    setTimeout(() => callback(null, globalThis.__tasklist ?? ""), 1);
}
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await esbuild.build({
    entryPoints: [join(ROOT, "desktop", "src", "main.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "main.cjs"), logLevel: "error", tsconfig: join(ROOT, "tsconfig.json"),
    external: ["./endcordDesktopMain.js"],
    plugins: [{
        name: "stub-electron",
        setup(b) {
            b.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "stub" }));
            b.onResolve({ filter: /^child_process$/ }, () => ({ path: "child_process", namespace: "stub" }));
            b.onLoad({ filter: /.*/, namespace: "stub" }, ({ path }) => ({ contents: path === "child_process" ? CHILD_PROCESS_STUB : ELECTRON_STUB, loader: "js" }));
        }
    }]
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A fresh stubbed Electron, then the main process started against it */
async function start(args = []) {
    const state = { switches: [], appEvents: {}, ipc: {}, opened: [], windows: [], session: {}, trays: [], menus: [], quit: 0, shortcuts: 0, badge: [] };
    const on = events => (event, fn) => { (events[event] ??= []).push(fn); };
    const emit = (events, event, ...a) => (events[event] ?? []).forEach(fn => fn(...a));
    class FakeContents {
        events = {};
        on = on(this.events);
        once = on(this.events);
        reloads = 0;
        session = { addWordToSpellCheckerDictionary: word => { state.addedWord = word; } };
        debugger = { isAttached: () => false, attach() { }, detach() { }, sendCommand: async () => { } };
        sent = [];
        send(channel, ...args) { this.sent.push([channel, ...args]); }
        setWindowOpenHandler(fn) { this.openHandler = fn; }
        getType() { return "window"; }
        isDevToolsOpened() { return false; }
        reload() { this.reloads++; }
        replaceMisspelling(word) { state.replaced = word; }
        toggleDevTools() { } getZoomLevel() { return 0; } setZoomLevel() { }
    }
    class FakeWindow {
        events = {};
        on = on(this.events);
        once = on(this.events);
        visible = false;
        focused = false;
        destroyed = false;
        constructor(options) {
            this.options = options;
            this.webContents = new FakeContents();
            state.windows.push(this);
            emit(state.appEvents, "web-contents-created", {}, this.webContents);
        }
        loadURL(url) { this.url = url; return Promise.resolve(); }
        show() { this.visible = true; emit(this.events, "show"); }
        hide() { this.visible = false; }
        focus() { this.focused = true; }
        maximize() { this.maximized = true; }
        unmaximize() { this.maximized = false; }
        minimize() { this.minimized = true; }
        restore() { this.minimized = false; } isMinimized() { return !!this.minimized; } isMaximized() { return !!this.maximized; }
        isVisible() { return this.visible; } isFocused() { return this.focused; } isDestroyed() { return this.destroyed; }
        getNormalBounds() { return { x: 0, y: 0, width: 1000, height: 700 }; }
        flashFrame(on) { this.flashing = on; }
        setIcon(icon) { this.icon = icon; }
        setAppDetails(details) { this.appDetails = details; }
        setOverlayIcon(icon, label) { state.badge.push([!!icon, label, icon]); }
        /** What a click on the close button does: true if the window really closes */
        close() {
            let prevented = false;
            emit(this.events, "close", { preventDefault: () => { prevented = true; } });
            return !prevented;
        }
    }
    class FakeTray {
        constructor(icon) { this.icon = icon; this.events = {}; this.on = on(this.events); state.trays.push(this); }
        setImage(icon) { this.icon = icon; }
        setToolTip(text) { this.tooltip = text; }
        setContextMenu(menu) { this.menu = menu; }
        destroy() { }
    }
    let ready;
    const paths = {};
    globalThis.__electron = {
        app: {
            getPath: name => paths[name] ?? join(DATA, name), setPath: (name, path) => { paths[name] = path; }, getVersion: () => "0.1.0",
            requestSingleInstanceLock: () => true, quit() { state.quit++; }, on: on(state.appEvents), setAppUserModelId() { }, relaunch() { }, exit() { state.exited = true; },
            isDefaultProtocolClient: () => false, setAsDefaultProtocolClient: protocol => { state.protocol = protocol; }, removeAsDefaultProtocolClient() { },
            getLocale: () => "tr", isPackaged: true, setBadgeCount(n) { state.badge.push([n > 0, String(n)]); },
            getLoginItemSettings: () => ({ openAtLogin: false }), setLoginItemSettings: settings => { state.loginItem = settings; },
            commandLine: { appendSwitch: (key, value) => state.switches.push([key, value]) },
            whenReady: () => new Promise(resolve => { ready = resolve; })
        },
        BrowserWindow: Object.assign(FakeWindow, { fromWebContents: () => state.windows[0], getAllWindows: () => state.windows }),
        Tray: FakeTray,
        screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }], getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) },
        clipboard: { writeImage() { }, writeText(text) { state.copied = text; } },
        desktopCapturer: { getSources: async () => [{ id: "screen:0:0", name: "Screen", thumbnail: { toJPEG: () => Buffer.from("jpeg") } }] },
        ipcMain: { handle: (channel, fn) => { state.ipc[channel] = fn; }, on: (channel, fn) => { state.ipc[channel] = fn; } },
        Menu: { setApplicationMenu() { }, buildFromTemplate: items => { const menu = { items, popup() { state.menus.push(items); } }; return menu; } },
        nativeImage: { createFromBuffer: () => ({}), createFromBitmap: (buffer, size) => ({ buffer, size }) },
        // Discord's list of detectable games: a thousand, plus a launcher, an ordinary program and an exact name
        net: {
            fetch: async () => {
                state.listFetches = (state.listFetches ?? 0) + 1;
                const games = Array.from({ length: 1000 }, (_, i) => `{"is_launcher": false, "name": "folder/game${i}.exe", "os": "win32"}`);
                const text = `[{"executables": [${games.join(", ")}, {"is_launcher": true, "name": "steam.exe", "os": "win32"}, {"is_launcher": false, "name": "nw.exe", "os": "win32"}, {"is_launcher": false, "name": ">hl2.exe", "os": "win32"}]}]`;
                return { ok: true, status: 200, text: async () => text };
            }
        },
        session: {
            defaultSession: {
                setPermissionRequestHandler: fn => { state.session.request = fn; },
                setPermissionCheckHandler: fn => { state.session.check = fn; },
                setDisplayMediaRequestHandler: fn => { state.session.display = fn; }
            }
        },
        shell: { openExternal: url => state.opened.push(url), readShortcutLink() { throw new Error("none"); }, writeShortcutLink() { state.shortcuts++; return true; } }
    };

    const require = createRequire(import.meta.url);
    delete require.cache[require.resolve(join(OUT, "main.cjs"))];
    const argv = process.argv.length;
    process.argv.push(...args);
    let error = null;
    try {
        require(join(OUT, "main.cjs"));
        // The uninstall cleanup exits without waiting for Electron
        ready?.();
        await sleep(10);
    } catch (e) {
        error = e;
    }
    process.argv.length = argv;
    return { state, error, emit };
}

const DISCORD_FRAME = { url: "https://discord.com/channels/@me", processId: 1, routingId: 1 };
const EVIL_FRAME = { url: "https://evil.example/", processId: 2, routingId: 1 };

process.argv.push("--vanilla");
// Electron's Node has these; the user agent is built from Chromium's version
Object.defineProperty(process.versions, "chrome", { value: "156.0.0.0" });
delete process.env.ENDCORD_USER_DATA_DIR;
delete process.env.UV_THREADPOOL_SIZE;
process.env.ENDCORD_DESKTOP_DATA_DIR = DATA;
rmSync(DATA, { recursive: true, force: true });
// Electron makes the data folder before the app starts
mkdirSync(DATA, { recursive: true });

const { state, error, emit } = await start();
check("the main process starts", !error, error?.stack ?? "");
const win = state.windows[0];
check("one window, on Discord", state.windows.length === 1 && win.url === "https://discord.com/app", state.windows.map(w => w.url));
check("it shows right away, without waiting for the first paint", win.visible);
check("Discord's own title bar replaces the system frame", process.platform === "darwin" ? win.options.frame === true : win.options.frame === false, win.options.frame);
check("Node's thread pool is kept to one thread", process.env.UV_THREADPOOL_SIZE === "1", process.env.UV_THREADPOOL_SIZE);
check("the network service runs in the main process", state.switches.some(([key, value]) => key === "enable-features" && value.includes("NetworkServiceInProcess2")));
check("no spare renderer process", state.switches.some(([key, value]) => key === "disable-features" && value.includes("SpareRendererForSitePerProcess")));
check("V8 favours memory over speed", state.switches.some(([key, value]) => key === "js-flags" && value.includes("--optimize-for-size")));
check("the audio service runs in the main process", state.switches.some(([key, value]) => key === "disable-features" && value.includes("AudioServiceOutOfProcess")));
// In the main process, screen shares sometimes never start (desktop/src/main.ts)
check("the video capture service keeps its own process", !state.switches.some(([, value]) => String(value).includes("RunVideoCaptureServiceInBrowserProcess")));

// Links and navigation
const contents = win.webContents;
check("a link opens in the browser, not the window", contents.openHandler({ url: "https://example.com/" }).action === "deny" && state.opened.includes("https://example.com/"));
check("a javascript: link goes nowhere", contents.openHandler({ url: "javascript:alert(1)" }).action === "deny" && !state.opened.includes("javascript:alert(1)"));
check("Discord's blank popout opens", contents.openHandler({ url: "about:blank" }).action === "allow");
let prevented = false;
emit(contents.events, "will-navigate", { preventDefault: () => { prevented = true; } }, "https://evil.example/");
check("the window can't be sent to another site", prevented);
prevented = false;
emit(contents.events, "will-navigate", { preventDefault: () => { prevented = true; } }, "https://discord.com/login");
check("it can move around Discord", !prevented);

// Permissions
const ask = (permission, url) => new Promise(resolve => state.session.request(null, permission, resolve, { requestingUrl: url }));
check("Discord may use the microphone", await ask("media", "https://discord.com/app") === true);
check("another site may not", await ask("media", "https://evil.example/") === false);
check("Discord may not ask for the location", await ask("geolocation", "https://discord.com/app") === false);
check("permission checks follow the same rules", state.session.check(null, "notifications", "https://discord.com") === true && state.session.check(null, "notifications", "https://evil.example") === false);

// Screen sharing
const display = request => new Promise(resolve => state.session.display(request, resolve));
check("a share without a pick in the page gets nothing", await display({ frame: DISCORD_FRAME, audioRequested: false }) === null);
check("another site can't list the screens", await state.ipc.EndcordDesktopGetSources({ senderFrame: EVIL_FRAME }) === null);
const sources = await state.ipc.EndcordDesktopGetSources({ senderFrame: DISCORD_FRAME });
check("Discord's page lists them", Array.isArray(sources) && sources[0]?.id === "screen:0:0" && sources[0].thumbnail.startsWith("data:image/jpeg;base64,"), sources);
check("another frame can't pick from that list", await state.ipc.EndcordDesktopPickSource({ senderFrame: { ...DISCORD_FRAME, processId: 9 } }, "screen:0:0", false) === false);
check("only a listed source can be picked", await state.ipc.EndcordDesktopPickSource({ senderFrame: DISCORD_FRAME }, "window:123:0", false) === false);
check("a listed one can", await state.ipc.EndcordDesktopPickSource({ senderFrame: DISCORD_FRAME }, "screen:0:0", true) === true);
check("another frame's request doesn't get the pick", await display({ frame: EVIL_FRAME, audioRequested: false }) === null);
await state.ipc.EndcordDesktopGetSources({ senderFrame: DISCORD_FRAME });
await state.ipc.EndcordDesktopPickSource({ senderFrame: DISCORD_FRAME }, "screen:0:0", true);
const granted = await display({ frame: DISCORD_FRAME, audioRequested: true });
check("the page's request gets what was picked", granted?.video?.id === "screen:0:0", granted);
check("with the computer's sound minus the app's own on Windows", process.platform !== "win32" || ["loopbackWithoutChrome", "loopback"].includes(granted?.audio), granted?.audio);
check("a pick is used once", await display({ frame: DISCORD_FRAME, audioRequested: false }) === null);

// Discord's title bar buttons
await state.ipc.EndcordDesktopWindow({ senderFrame: EVIL_FRAME, sender: contents }, "close");
await state.ipc.EndcordDesktopWindow({ senderFrame: EVIL_FRAME, sender: contents }, "minimize");
check("another frame can't use the window buttons", !win.minimized && win.visible);
await state.ipc.EndcordDesktopWindow({ senderFrame: DISCORD_FRAME, sender: contents }, "maximize");
check("maximize maximizes", win.maximized === true);
await state.ipc.EndcordDesktopWindow({ senderFrame: DISCORD_FRAME, sender: contents }, "maximize");
check("and again restores", win.maximized === false);
await state.ipc.EndcordDesktopWindow({ senderFrame: DISCORD_FRAME, sender: contents }, "minimize");
check("minimize minimizes", win.minimized === true);
win.restore();
await state.ipc.EndcordDesktopWindow({ senderFrame: DISCORD_FRAME, sender: contents }, "close");
check("close hides the window in the tray, like the frame's button did", !win.visible);
win.show();

// The app's icon: the EC logo, or Discord's
const iconName = path => String(path).split(/[\\/]/).pop();
check("the window starts with the EC logo", iconName(win.icon) === (process.platform === "win32" ? "icon.ico" : "icon.png"), win.icon);
check("and gives the taskbar the same icon, over an older shortcut's", process.platform !== "win32" || (iconName(win.appDetails?.appIconPath) === "icon.ico" && win.appDetails?.appId === "com.endcord.desktop"), win.appDetails);
check("Endcord's settings can read which", await state.ipc.EndcordDesktopGetIcon({ senderFrame: DISCORD_FRAME }) === "endcord");
check("another frame can't", await state.ipc.EndcordDesktopGetIcon({ senderFrame: EVIL_FRAME }) === undefined);
await state.ipc.EndcordDesktopSetIcon({ senderFrame: EVIL_FRAME }, "discord");
await state.ipc.EndcordDesktopSetIcon({ senderFrame: DISCORD_FRAME }, "../../evil");
check("another frame or an unknown icon changes nothing", await state.ipc.EndcordDesktopGetIcon({ senderFrame: DISCORD_FRAME }) === "endcord" && iconName(win.icon).startsWith("icon."));
await state.ipc.EndcordDesktopSetIcon({ senderFrame: DISCORD_FRAME }, "discord");
check("picking Discord's changes the window, the taskbar and the tray at once", iconName(win.icon).startsWith("icon-discord.") && iconName(state.trays[0].icon).startsWith("icon-discord.") && (process.platform !== "win32" || iconName(win.appDetails.appIconPath) === "icon-discord.ico"), [win.icon, state.trays[0].icon]);
check("and is kept", JSON.parse(readFileSync(join(DATA, "desktop-settings.json"), "utf8")).icon === "discord");
await state.ipc.EndcordDesktopSetIcon({ senderFrame: DISCORD_FRAME }, "endcord");
check("and back", iconName(win.icon).startsWith("icon.") && iconName(state.trays[0].icon).startsWith("icon."));

// Unread mentions on the taskbar
win.focused = false;
emit(win.events, "page-title-updated", {}, "(3) Discord | #general");
const lastBadge = () => state.badge.at(-1);
check("mentions in the title put a badge on the taskbar", lastBadge()?.[0] === true && /3/.test(lastBadge()?.[1] ?? ""), state.badge);
const three = lastBadge()?.[2];
const inkOf = image => { let ink = 0; for (let i = 0; i < image.buffer.length; i += 4) if (image.buffer[i] > 200 && image.buffer[i + 2] > 200) ink++; return ink; };
check("the badge shows the count in white on red", three?.size?.width === 32 && inkOf(three) > 20, three?.size);
check("and get the taskbar button's attention while the window is away", win.flashing === true);
check("the tray says how many, in the system's language", /3 okunmamış/.test(state.trays[0]?.tooltip ?? ""), state.trays[0]?.tooltip);
emit(win.events, "page-title-updated", {}, "(51) Discord | #general");
const many = lastBadge()?.[2];
check("past nine it says 9+", many && many !== three && inkOf(many) > inkOf(three) && /51/.test(lastBadge()?.[1] ?? ""), lastBadge()?.[1]);
emit(win.events, "page-title-updated", {}, "Discord | #general");
check("read, the badge goes", lastBadge()?.[0] === false);
emit(win.events, "focus");
check("looking at the window stops the flashing", win.flashing === false);

// Games for Game Mode, which Discord's web app can't see
if (process.platform === "win32") {
    globalThis.__tasklist = '"System","4","Services","0","100 K"\r\n"GAME7.exe","1200","Console","1","900.000 K"\r\n"nw.exe","1300","Console","1","50.000 K"\r\n"hl2.exe","1400","Console","1","50.000 K"\r\n';
    const gamesSent = () => contents.sent.filter(([channel]) => channel === "EndcordDesktopGames");
    win.focused = false;
    await state.ipc.EndcordDesktopGamesWatch({ senderFrame: EVIL_FRAME }, true);
    await sleep(30);
    check("another frame can't start the game watch", !state.listFetches && !globalThis.__tasklistRuns);
    await state.ipc.EndcordDesktopGamesWatch({ senderFrame: DISCORD_FRAME }, true);
    await sleep(50);
    check("Game Mode asking gets the running games, by Discord's list", JSON.stringify(gamesSent().at(-1)?.[1]) === JSON.stringify(["game7.exe", "hl2.exe"]), gamesSent());
    check("launchers and ordinary programs that share a game's name don't count", !gamesSent().at(-1)?.[1].includes("nw.exe"));
    win.focused = true;
    emit(win.events, "focus");
    const runs = globalThis.__tasklistRuns;
    await sleep(30);
    check("with the window in front, it doesn't look", globalThis.__tasklistRuns === runs);
    globalThis.__tasklist = '"System","4","Services","0","100 K"\r\n';
    win.focused = false;
    emit(win.events, "blur");
    await sleep(50);
    check("in the background it looks again, and says when the game is gone", JSON.stringify(gamesSent().at(-1)?.[1]) === "[]", gamesSent().at(-1));
    // Minimized without losing the system's focus first, as a window started behind others is
    globalThis.__tasklist = '"GAME7.exe","1200","Console","1","900.000 K"\r\n';
    win.focused = true;
    emit(win.events, "focus");
    win.minimized = true;
    emit(win.events, "minimize");
    await sleep(50);
    check("a minimized window counts as in the background, focused or not", JSON.stringify(gamesSent().at(-1)?.[1]) === JSON.stringify(["game7.exe"]), gamesSent().at(-1));
    win.minimized = false;
    win.focused = false;
    await state.ipc.EndcordDesktopGamesWatch({ senderFrame: DISCORD_FRAME }, false);
    const stopped = globalThis.__tasklistRuns;
    emit(win.events, "blur");
    await sleep(30);
    check("once Game Mode stops, it stops looking", globalThis.__tasklistRuns === stopped);
    check("the list was fetched once and kept", state.listFetches === 1 && existsSync(join(DATA, "game-executables.txt")), state.listFetches);
    win.focused = true;
}

// Out of focus but on screen for a while, the page's garbage is collected; minutes are milliseconds here
const debuggerCommands = [];
const { sendCommand } = contents.debugger;
contents.debugger.sendCommand = async command => { debuggerCommands.push(command); };
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms >= 60_000 ? 5 : ms, ...rest);
win.focused = false;
emit(win.events, "blur");
globalThis.setTimeout = realSetTimeout;
await sleep(40);
check("a window left out of focus on screen gets its garbage collected", debuggerCommands.includes("HeapProfiler.collectGarbage"), debuggerCommands);
win.focused = true;
emit(win.events, "focus");
contents.debugger.sendCommand = sendCommand;

// Text field menu
emit(contents.events, "context-menu", {}, { isEditable: true, misspelledWord: "helo", dictionarySuggestions: ["hello", "help"], editFlags: { canCut: true, canCopy: true, canPaste: true }, selectionText: "", linkURL: "" });
const menu = state.menus.at(-1) ?? [];
check("a text field gets spelling fixes first", menu[0]?.label === "hello" && menu[1]?.label === "help", menu.map(i => i.label ?? i.role ?? i.type));
check("then cut, copy and paste", ["cut", "copy", "paste"].every(role => menu.some(i => i.role === role)));
menu[0].click();
check("a fix replaces the word", state.replaced === "hello");
const menus = state.menus.length;
emit(contents.events, "context-menu", {}, { isEditable: false, misspelledWord: "", dictionarySuggestions: [], editFlags: {}, selectionText: "", linkURL: "" });
check("an empty spot gets no menu", state.menus.length === menus);
emit(contents.events, "context-menu", {}, { isEditable: false, misspelledWord: "", dictionarySuggestions: [], editFlags: {}, selectionText: "", linkURL: "javascript:alert(1)" });
check("a javascript: link gets no copy item", state.menus.length === menus);

// A crashed page comes back, but not over and over
for (let i = 0; i < 4; i++) emit(contents.events, "render-process-gone", {}, { reason: "crashed" });
emit(contents.events, "render-process-gone", {}, { reason: "clean-exit" });
await sleep(1200);
check("a crashed page reloads, at most three times in five minutes", contents.reloads === 3, contents.reloads);

// The tray and closing
check("there's a tray icon", state.trays.length === 1);
const trayMenu = state.trays[0].menu.items;
const startItem = trayMenu.find(i => i.type === "checkbox" && /Windows|Oturum/.test(i.label));
check("a test profile can't add itself to the system's startup list", startItem?.enabled === false, startItem);
check("closing hides the window in the tray", win.close() === false && !win.visible);
check("the tray icon brings it back", (emit(state.trays[0].events, "click"), win.visible));
trayMenu.find(i => i.type === "checkbox" && /tepside/.test(i.label)).click({ checked: false });
check("with that turned off, closing closes", win.close() === true);
trayMenu.find(i => i.type === "checkbox" && /tepside/.test(i.label)).click({ checked: true });
trayMenu.at(-1).click();
check("quitting from the tray quits", state.quit === 1 && win.close() === true);
check("a test profile makes no Start menu shortcut", state.shortcuts === 0);

// Started at sign-in: in the tray, not on screen
const hidden = await start(["--hidden"]);
check("started at sign-in, the window waits in the tray", !hidden.error && hidden.state.windows[0]?.visible === false);

// discord:// links: invites and "Open in app" from discord.com
const linkItem = trayMenu.find(i => i.type === "checkbox" && /Discord bağlantı/.test(i.label));
check("a test profile can't take discord:// links from Discord's app", linkItem?.enabled === false && state.protocol === undefined, linkItem);
const linked = await start(["discord://-/invite/endcord"]);
const linkedWin = linked.state.windows[0];
check("started from a link, the window opens that page", !linked.error && linkedWin?.url === "https://discord.com/invite/endcord" && linkedWin.visible, linkedWin?.url);
const secondStart = (...argv) => linked.emit(linked.state.appEvents, "second-instance", {}, ["EndcordDesktop.exe", ...argv]);
secondStart("discord://-/channels/1/2");
check("a link opened while it runs goes to the same window", linked.state.windows.length === 1 && linkedWin.url === "https://discord.com/channels/1/2", linkedWin.url);
for (const link of ["discord://-/../evil", "discord://evil.example/x", "discord://-/channels/1?next=https://evil.example", "discord://-/javascript:alert(1)"]) secondStart(link);
check("links to anything but Discord's own pages are ignored", linkedWin.url === "https://discord.com/channels/1/2", linkedWin.url);

// The uninstaller runs the app once to take back what it set up, without opening a window
const removing = await start(["--uninstall-cleanup"]);
check("the uninstall cleanup opens no window and exits", !removing.error && removing.state.windows.length === 0 && removing.state.exited === true, removing.error?.stack ?? removing.state.windows.length);
check("on a test profile it leaves the system's startup list alone", removing.state.loginItem === undefined, removing.state.loginItem);

rmSync(DATA, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
if (failed) {
    console.error(`\n${failed} FAILED`);
    process.exit(1);
}
console.log("\nALL PASSED");
