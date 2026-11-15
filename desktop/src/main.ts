/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Endcord Desktop: Discord's web app in Endcord's own window. Everything Endcord itself does comes from the same
// files as the mod (endcordDesktopMain.js and endcordDesktopPreload.js, built from src/main and src/preload.ts);
// this app only makes the window and gives it what Discord's own app would: a tray, notifications, a taskbar badge,
// text field menus and screen sharing. Each of those costs nothing until it's used.

import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, session, type Tray, type WebContents } from "electron";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { trackMentions } from "./badge";
import { APP_ID, BACKGROUND, DISCORD_URL, fromDiscord, isDiscordUrl, openExternally, VANILLA } from "./common";
import { addTextMenu } from "./contextMenu";
import { watchGames } from "./games";
import { appIcon, iconFile, isAppIcon, setWindowIcon } from "./icon";
import { DesktopIpc, type WindowAction } from "./ipc";
import { discordLinkTarget, setHandlesDiscordLinks } from "./links";
import { getSettings, setSetting } from "./settings";
import { setUpScreenShare } from "./share";
import { desktopShortcut, ensureStartMenuShortcut, removeShortcut, startMenuShortcut, updateDesktopShortcut, writeDesktopShortcut } from "./shortcut";
import { createTray, HIDDEN_ARG, loginItem, showWindow } from "./tray";
import { collectAfterLoads, collectWhileUnfocused } from "./trim";

// Node's thread pool, which Endcord's file calls and the updater's DNS lookups start in this process, commits 8 MB of
// stack per thread on Windows, four threads by default. One does for the few files the main process reads: 24 MB less
// for the whole session. A file read may wait while a lookup sits out a dropped connection, which only delays it
process.env.UV_THREADPOOL_SIZE ??= "1";

// A data folder of its own when asked (tests, a second profile). Has to happen before anything reads userData
if (process.env.ENDCORD_DESKTOP_DATA_DIR) app.setPath("userData", process.env.ENDCORD_DESKTOP_DATA_DIR);
const USER_DATA = app.getPath("userData");

// Run by setup (installer/Core/DesktopEngine.cs): once after installing, for the shortcuts, and before removing the
// app's folder, to take back what it set up. Neither opens a window
const UNINSTALLING = process.argv.includes("--uninstall-cleanup");
const MAKING_SHORTCUTS = process.argv.includes("--setup-shortcuts");

// Endcord's settings and themes live in this app's own folder, not the mod's: both can run at once, and two programs
// writing one settings file would undo each other's changes. A first start copies the mod's settings over, once
process.env.ENDCORD_USER_DATA_DIR ??= join(USER_DATA, "Endcord");
if (!UNINSTALLING && !MAKING_SHORTCUTS) importModSettings(process.env.ENDCORD_USER_DATA_DIR);

// The app starts at the end of this file, once everything it uses is defined

let quitting = false;
let mainWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;
const quit = () => {
    quitting = true;
    app.quit();
};

function start() {
    // Chromium keeps a spare renderer process ready for the next site, and this app only ever shows one. Media keys
    // stay with the music player instead of pausing Discord's sounds, as in Discord's own app
    // Chromium's audio service runs in this process instead of one of its own: one process fewer, 10 MB private and
    // 90 MB of working set less
    app.commandLine.appendSwitch("disable-features", "SpareRendererForSitePerProcess,HardwareMediaKeyHandling,MediaSessionService,AudioServiceOutOfProcess");
    // V8 favours memory over speed, as Chromium does on low-memory phones: Discord's page held 14 MB less on average
    // and varied less (measured 2026-11-12, logged out, 90 s after load, five runs each way). Running the network
    // service or the GPU in this process and a smaller young generation were measured too, and saved nothing
    app.commandLine.appendSwitch("js-flags", "--optimize-for-size");
    // The network service in this process too: one process and 8 MB private, 50 MB of working set less (measured as
    // above, three runs). Processes Chromium puts in the background (a hidden window's page) run in Windows' efficiency
    // mode, which lets Windows keep them on slower, cooler cores
    app.commandLine.appendSwitch("enable-features", "NetworkServiceInProcess2,UseEcoQoSForBackgroundProcess");

    // Discord's web app starts Chromium's video capture service at load and keeps it all session, a process of 51 MB.
    // Running it in this process instead (RunVideoCaptureServiceInBrowserProcess) saves that, but screen shares then
    // sometimes never start (measured 2026-11-05: one in four failed or hung, none with the service apart), so it stays
    // apart, and DeferredDevices (src/plugins/_core/deferredDevices.endcordDesktop.ts) holds it back until a call or the
    // voice settings need a device

    // Discord's page sees a normal Chrome, the same as a browser
    const platform = ({ win32: "Windows NT 10.0; Win64; x64", darwin: "Macintosh; Intel Mac OS X 10_15_7" } as Record<string, string>)[process.platform] ?? "X11; Linux x86_64";
    app.userAgentFallback = `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split(".")[0]}.0.0.0 Safari/537.36`;

    if (process.platform === "win32") app.setAppUserModelId(APP_ID);
    // No menu bar: its accelerators are replaced by the few shortcuts below
    Menu.setApplicationMenu(null);

    // Endcord's own main: settings, its IPC, its updater, the endcord:// protocol and the CSP for themes (src/main)
    const endcord: { setupMainWindow?(win: BrowserWindow): void; } = VANILLA ? {} : require("./endcordDesktopMain.js");

    let win: BrowserWindow | null = null;
    // A second start, from a shortcut or a discord:// link, brings this window up and opens what the link names
    app.on("second-instance", (_event, argv) => {
        if (!win) return;
        showWindow(win);
        const target = discordLinkTarget(argv);
        if (target) win.loadURL(target);
    });
    app.on("open-url", (event, url) => {
        event.preventDefault();
        const target = discordLinkTarget([url]);
        if (!win || !target) return;
        showWindow(win);
        win.loadURL(target);
    });
    app.on("activate", () => win && showWindow(win));
    app.on("before-quit", () => quitting = true);
    app.on("window-all-closed", () => app.quit());
    // Every window, popouts included, only ever shows Discord. Endcord's own windows (the QuickCSS editor) set their
    // own link handling after this
    app.on("web-contents-created", (_event, contents) => {
        if (contents.getType() !== "window") return;
        keepOnDiscord(contents);
        addTextMenu(contents);
    });

    app.whenReady().then(() => {
        setUpSession();
        const link = discordLinkTarget(process.argv);
        const main = win = mainWindow = createWindow(process.argv.includes(HIDDEN_ARG) && !link, link ?? DISCORD_URL);
        const tray = appTray = createTray(main, quit);
        // Closing hides the window in the tray, as in Discord's app, unless that's turned off or there's no tray
        main.on("close", event => {
            if (quitting || !tray || !getSettings().closeToTray) return;
            event.preventDefault();
            main.hide();
        });
        main.on("closed", () => {
            win = mainWindow = appTray = null;
            tray?.destroy();
        });
        trackMentions(main, tray);
        watchGames(main);
        collectAfterLoads(main);
        collectWhileUnfocused(main);
        endcord.setupMainWindow?.(main);
        // Off the start's path: it touches the disk and the shell
        setTimeout(ensureStartMenuShortcut, 10_000).unref();
    });
}

/** Links go to the browser. Discord's blank popouts, which its page fills itself, open as windows of their own */
function keepOnDiscord(contents: WebContents) {
    contents.setWindowOpenHandler(({ url }) => {
        if (url === "about:blank" || (isDiscordUrl(url) && new URL(url).pathname.startsWith("/popout"))) {
            return {
                action: "allow",
                overrideBrowserWindowOptions: { backgroundColor: BACKGROUND, autoHideMenuBar: true, icon: iconFile() }
            };
        }
        openExternally(url);
        return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
        if (isDiscordUrl(url)) return;
        event.preventDefault();
        openExternally(url);
    });
    // A server-side redirect off discord.com isn't a navigation the page made, so it needs its own check
    contents.on("will-redirect", (event, url) => {
        if (isDiscordUrl(url)) return;
        event.preventDefault();
        openExternally(url);
    });
}

// #region Window

interface WindowState { x?: number; y?: number; width: number; height: number; maximized: boolean; }

const WINDOW_STATE_FILE = join(USER_DATA, "window-state.json");

function readWindowState(): WindowState {
    try {
        const state = JSON.parse(readFileSync(WINDOW_STATE_FILE, "utf-8"));
        if (state.width >= 400 && state.height >= 300) return state;
    } catch { }
    return { width: 1280, height: 760, maximized: false };
}

function createWindow(hidden: boolean, url: string) {
    const state = readWindowState();
    const win = new BrowserWindow({
        title: "Endcord",
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        minWidth: 940,
        minHeight: 500,
        show: false,
        backgroundColor: BACKGROUND,
        autoHideMenuBar: true,
        icon: iconFile(),
        // Discord's own title bar and window buttons instead of the system's, as in Discord's app
        // (src/plugins/_core/desktopWindow.endcordDesktop.ts). macOS keeps its frame
        frame: process.platform === "darwin",
        webPreferences: {
            preload: join(__dirname, "preload.js"),
            // What the preload needs to know without asking the main process
            additionalArguments: [`--endcord-desktop-version=${app.getVersion()}`, ...(VANILLA ? ["--endcord-desktop-vanilla"] : [])],
            contextIsolation: true,
            nodeIntegration: false,
            // Endcord's preload reads its files directly (src/pluginChunkLoader.ts)
            sandbox: false,
            spellcheck: true,
            // A minimized or covered window stops drawing and slows its timers, as a background tab would
            backgroundThrottling: true
        }
    });

    // Shown right away in Endcord's night blue, which is also Discord's loading screen's, rather than after the first
    // paint a second later. Started at sign-in, it stays in the tray
    const show = () => {
        if (state.maximized) win.maximize();
        win.show();
    };
    if (hidden) win.once("show", () => state.maximized && win.maximize());
    else show();

    // Windows ending the session closes the window without quitting first: it mustn't go to the tray then
    win.on("session-end", () => {
        quitting = true;
    });
    win.on("close", () => {
        try {
            writeFileSync(WINDOW_STATE_FILE, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
        } catch { }
    });

    const { webContents } = win;
    webContents.on("before-input-event", (event, input) => {
        if (input.type !== "keyDown") return;
        const mod = process.platform === "darwin" ? input.meta : input.control;
        const key = input.key.toLowerCase();
        if ((mod && input.shift && key === "i") || key === "f12") webContents.toggleDevTools();
        else if ((mod && key === "r") || key === "f5") webContents.reload();
        else if (mod && (key === "=" || key === "+")) webContents.setZoomLevel(Math.min(webContents.getZoomLevel() + 0.5, 4));
        else if (mod && key === "-") webContents.setZoomLevel(Math.max(webContents.getZoomLevel() - 0.5, -3));
        else if (mod && key === "0") webContents.setZoomLevel(0);
        else return;
        event.preventDefault();
    });

    // A crashed page comes back by itself, but not over and over
    let crashes: number[] = [];
    webContents.on("render-process-gone", (_event, details) => {
        if (details.reason === "clean-exit") return;
        const now = Date.now();
        crashes = [...crashes.filter(at => now - at < 5 * 60_000), now];
        if (crashes.length <= 3) setTimeout(() => win.isDestroyed() || webContents.reload(), 1000);
    });

    setWindowIcon(win);
    win.loadURL(url);
    return win;
}

// #endregion

// #region Session

// What Discord's page may ask for: the microphone and camera, notifications, copying, full screen and the screen
const ALLOWED_PERMISSIONS = new Set(["media", "notifications", "clipboard-sanitized-write", "fullscreen", "pointerLock", "display-capture", "speaker-selection"]);

function setUpSession() {
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
        callback(ALLOWED_PERMISSIONS.has(permission) && isDiscordUrl(details.requestingUrl));
    });
    ses.setPermissionCheckHandler((_webContents, permission, origin) => ALLOWED_PERMISSIONS.has(permission) && isDiscordUrl(`${origin}/`));
    setUpScreenShare(ses);
}

// #endregion

// #region What Endcord asks of the app (EndcordDesktopNative in desktop/src/preload.ts)

ipcMain.handle(DesktopIpc.RELAUNCH, event => {
    if (!fromDiscord(event)) return;
    app.relaunch();
    quit();
});

ipcMain.handle(DesktopIpc.COPY_IMAGE, (event, data: ArrayBuffer) => {
    if (!fromDiscord(event) || !(data instanceof ArrayBuffer)) return;
    clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(data)));
});

ipcMain.handle(DesktopIpc.WINDOW, (event, action: WindowAction) => {
    const win = fromDiscord(event) && BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === "minimize") win.minimize();
    else if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
    // Closing goes through the window's close handler, so it hides in the tray when that's on
    else if (action === "close") win.close();
});

ipcMain.handle(DesktopIpc.GET_ICON, event => fromDiscord(event) ? appIcon() : undefined);

// Applies at once: windows, tray, taskbar and the shortcuts. The exe's own icon stays the EC logo
ipcMain.handle(DesktopIpc.SET_ICON, (event, icon: unknown) => {
    if (!fromDiscord(event) || !isAppIcon(icon) || icon === appIcon()) return;
    setSetting("icon", icon);
    for (const window of BrowserWindow.getAllWindows()) {
        if (window === mainWindow) setWindowIcon(window);
        else if (iconFile()) window.setIcon(iconFile()!);
    }
    const file = iconFile();
    if (file) appTray?.setImage(file);
    ensureStartMenuShortcut();
    updateDesktopShortcut();
});

// #endregion

/**
 * The mod's settings and themes, copied into this app's folder on its first start. Only copied, never written back.
 * A test profile (ENDCORD_DESKTOP_DATA_DIR) starts empty instead
 */
function importModSettings(target: string) {
    if (existsSync(target) || process.env.ENDCORD_DESKTOP_DATA_DIR) return;
    const mod = join(app.getPath("appData"), "Endcord");
    try {
        mkdirSync(join(target, "settings"), { recursive: true });
        for (const file of ["settings.json", "quickCss.css"]) {
            const from = join(mod, "settings", file);
            if (existsSync(from)) cpSync(from, join(target, "settings", file));
        }
        if (existsSync(join(mod, "themes"))) cpSync(join(mod, "themes"), join(target, "themes"), { recursive: true });
    } catch (e) {
        console.error("[Endcord Desktop] Couldn't copy the mod's settings", e);
    }
}

/** What the app put into the system, taken back: discord:// links, the startup list entry and the Start menu shortcut */
function uninstallCleanup() {
    if (process.platform === "win32") app.setAppUserModelId(APP_ID);
    setHandlesDiscordLinks(false);
    if (!process.env.ENDCORD_DESKTOP_DATA_DIR) {
        app.setLoginItemSettings({ ...loginItem, openAtLogin: false });
        removeShortcut(startMenuShortcut());
        removeShortcut(desktopShortcut());
    }
}

if (UNINSTALLING) {
    try {
        uninstallCleanup();
    } catch (e) {
        console.error("[Endcord Desktop] Couldn't clean up", e);
    }
    app.exit(0);
} else if (MAKING_SHORTCUTS) {
    if (process.platform === "win32") app.setAppUserModelId(APP_ID);
    app.whenReady().then(() => {
        try {
            ensureStartMenuShortcut();
            writeDesktopShortcut();
        } catch (e) {
            console.error("[Endcord Desktop] Couldn't make the shortcuts", e);
        }
        app.exit(0);
    });
} else if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    start();
}
