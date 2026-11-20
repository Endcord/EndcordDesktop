/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Which games are running, for Endcord's Game Mode (src/plugins/gameMode.desktop). Discord's web app can't see other
// programs, so the app looks for it: the system's process list against the game executables Discord's own app detects
// (its public list, fetched at most once a week and kept as names only). Only while Game Mode asks and the window is in
// the background, every 20 seconds. Windows only for now

import { execFile } from "child_process";
import { app, type BrowserWindow, ipcMain, net } from "electron";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { dirname, join } from "path";

import { fromDiscord } from "./common";
import { DesktopIpc } from "./ipc";

const LIST_URL = "https://discord.com/api/v9/applications/detectable";
const LIST_MAX_AGE = 7 * 24 * 60 * 60_000;
const SCAN_EVERY = 20_000;
// After a fetch that left no list (offline, Discord down)
const LIST_RETRY = 10 * 60_000;
const TASKLIST = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tasklist.exe");

// Names that ordinary programs share with a few entries of Discord's list
const NOT_GAMES = new Set([
    "nw.exe", "electron.exe", "java.exe", "javaw.exe", "python.exe", "pythonw.exe", "node.exe", "autorun.exe", "launcher.exe",
    "build.exe", "cmd.exe", "conhost.exe", "explorer.exe", "chrome.exe", "msedge.exe", "firefox.exe", "code.exe"
]);

// A flat object of the list, as each executable is, its keys in any order. Read with a pattern, not JSON.parse: the
// list is 13 MB of JSON for a few hundred KB of names
const FIELD = String.raw`"\w+":\s*(?:"(?:[^"\\]|\\.)*"|true|false|null|-?\d+)`;
const EXECUTABLE = new RegExp(String.raw`\{\s*${FIELD}(?:\s*,\s*${FIELD})*\s*\}`, "g");
const WIN32 = /"os":\s*"win32"/;
const NOT_LAUNCHER = /"is_launcher":\s*false/;
const NAME = /"name":\s*"((?:[^"\\]|\\.)*)"/;

/** The executable names in Discord's list of detectable games: file names only, lowercase */
export function parseDetectable(text: string) {
    const names = new Set<string>();
    for (const [entry] of text.matchAll(EXECUTABLE)) {
        const raw = WIN32.test(entry) && NOT_LAUNCHER.test(entry) && NAME.exec(entry)?.[1];
        if (!raw) continue;
        let name: string;
        try {
            name = JSON.parse(`"${raw}"`);
        } catch {
            continue;
        }
        // "folder/game.exe", and ">game.exe" for an exact match: either way the file name is what a process shows
        const file = name.split("/").pop()!.replace(/^>/, "").toLowerCase();
        if (file.endsWith(".exe") && !NOT_GAMES.has(file)) names.add(file);
    }
    return names;
}

/** Image names from `tasklist /fo csv /nh`, lowercase */
export const parseTasklist = (csv: string) => csv.split(/\r?\n/).map(line => /^"([^"]+)"/.exec(line)?.[1].toLowerCase()).filter((name): name is string => !!name);

async function loadGameNames(): Promise<Set<string>> {
    const file = join(app.getPath("userData"), "game-executables.txt");
    const saved = await stat(file).then(s => s.mtimeMs, () => 0);
    if (Date.now() - saved < LIST_MAX_AGE) return new Set((await readFile(file, "utf8")).split("\n").filter(Boolean));
    try {
        const res = await net.fetch(LIST_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const names = parseDetectable(await res.text());
        if (names.size < 1000) throw new Error(`only ${names.size} games in the list`);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, [...names].join("\n")).catch(e => console.error("[Endcord Desktop] Couldn't keep the list of games", e));
        return names;
    } catch (e) {
        console.error("[Endcord Desktop] Couldn't get Discord's list of games", e);
        // An old list is better than none
        return saved ? new Set((await readFile(file, "utf8")).split("\n").filter(Boolean)) : new Set();
    }
}

function runningPrograms() {
    return new Promise<string[]>(resolve => {
        execFile(TASKLIST, ["/fo", "csv", "/nh"], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => resolve(error ? [] : parseTasklist(stdout)));
    });
}

export function watchGames(win: BrowserWindow) {
    if (process.platform !== "win32") return;
    let watching = false;
    let names: Promise<Set<string>> | undefined;
    let noListSince = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let reported = "";

    function gameNames() {
        if (!names || (noListSince && Date.now() - noListSince > LIST_RETRY)) {
            noListSince = 0;
            names = loadGameNames().catch(() => new Set<string>()).then(list => {
                if (!list.size) noListSince = Date.now();
                return list;
            });
        }
        return names;
    }

    async function scan() {
        const games = await gameNames();
        if (!watching || !games.size || win.isDestroyed()) return;
        const running = [...new Set((await runningPrograms()).filter(name => games.has(name)))].sort();
        const key = running.join("\n");
        if (key === reported || !watching || win.isDestroyed()) return;
        reported = key;
        win.webContents.send(DesktopIpc.GAMES, running);
    }

    // Game Mode only acts while the window is in the background, so that's the only time to look. A window that never
    // had the system's focus gets no blur when it's minimized, and can still count as focused then
    const inBackground = () => !win.isFocused() || win.isMinimized() || !win.isVisible();
    function schedule() {
        clearInterval(timer);
        timer = undefined;
        if (!watching || win.isDestroyed() || !inBackground()) return;
        scan();
        timer = setInterval(scan, SCAN_EVERY);
    }

    for (const event of ["blur", "focus", "minimize", "restore", "hide", "show"] as const) win.on(event as "blur", schedule);
    win.on("closed", () => clearInterval(timer));
    // A new page starts without Game Mode until its plugin asks again
    win.webContents.on("did-navigate", () => {
        watching = false;
        reported = "";
        schedule();
    });

    ipcMain.handle(DesktopIpc.GAMES_WATCH, (event, on: boolean) => {
        if (!fromDiscord(event)) return;
        watching = on === true;
        if (watching) gameNames();
        else reported = "";
        schedule();
    });
}
