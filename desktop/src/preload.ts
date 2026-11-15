/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isDiscordOrigin } from "@shared/trustedOrigins";
import { contextBridge, ipcRenderer, webFrame } from "electron/renderer";
import { release } from "os";

import { DesktopIpc, type ShareSource, type WindowAction } from "./ipc";
import { listenForPickerKeys, showSharePicker } from "./sharePicker";

const VANILLA = process.argv.includes("--endcord-desktop-vanilla");
const VERSION = process.argv.find(arg => arg.startsWith("--endcord-desktop-version="))?.slice("--endcord-desktop-version=".length) ?? "0.0.0";

// Discord's own page only. Its blank popouts run this preload too, and get nothing
if (location.protocol === "https:" && isDiscordOrigin(window.origin)) {
    // Screen sharing. A browser shows its own picker when a page calls getDisplayMedia; here the page's call shows
    // Endcord's first, and only then asks Chromium, for what was picked. Asking first is what lets "no sound" leave the
    // sound out of the request, which Chromium would otherwise refuse as a whole
    listenForPickerKeys();
    contextBridge.exposeInMainWorld("EndcordDesktopShare", {
        async pick(audioRequested: boolean) {
            const sources: ShareSource[] | null = await ipcRenderer.invoke(DesktopIpc.GET_SOURCES);
            if (!sources) return null;
            const picked = await showSharePicker(sources, audioRequested && process.platform === "win32", Number(release().split(".")[2]) >= 19041);
            if (!picked || !await ipcRenderer.invoke(DesktopIpc.PICK_SOURCE, picked.id, picked.audio)) return null;
            return { audio: picked.audio };
        }
    });
    webFrame.executeJavaScript(`(() => {
        const share = window.EndcordDesktopShare;
        const getDisplayMedia = MediaDevices.prototype.getDisplayMedia;
        MediaDevices.prototype.getDisplayMedia = async function (constraints = {}) {
            const picked = await share.pick(!!constraints.audio);
            if (!picked) throw new DOMException("Permission denied", "NotAllowedError");
            return getDisplayMedia.call(this, { ...constraints, audio: picked.audio ? constraints.audio : false });
        };
    })()`);

    if (!VANILLA) {
        // Endcord's code finds the desktop app's API under this name (IS_ENDCORD_DESKTOP in src/)
        contextBridge.exposeInMainWorld("EndcordDesktopNative", {
            app: {
                getVersion: () => VERSION,
                isDevBuild: () => false,
                relaunch: () => ipcRenderer.invoke(DesktopIpc.RELAUNCH),
                getIcon: () => ipcRenderer.invoke(DesktopIpc.GET_ICON),
                setIcon: (icon: string) => ipcRenderer.invoke(DesktopIpc.SET_ICON, icon),
                isOutdated: () => Promise.resolve(false),
                openUpdater: () => { }
            },
            clipboard: {
                copyImage: (data: ArrayBuffer) => ipcRenderer.invoke(DesktopIpc.COPY_IMAGE, data)
            },
            window: Object.fromEntries((["minimize", "maximize", "close"] satisfies WindowAction[])
                .map(action => [action, () => ipcRenderer.invoke(DesktopIpc.WINDOW, action)])),
            // For Game Mode: Discord's web app can't see games (desktop/src/games.ts)
            games: {
                watch(onChange: (games: string[]) => void) {
                    ipcRenderer.removeAllListeners(DesktopIpc.GAMES);
                    ipcRenderer.on(DesktopIpc.GAMES, (_event, games: string[]) => onChange(games));
                    return ipcRenderer.invoke(DesktopIpc.GAMES_WATCH, true);
                },
                unwatch() {
                    ipcRenderer.removeAllListeners(DesktopIpc.GAMES);
                    return ipcRenderer.invoke(DesktopIpc.GAMES_WATCH, false);
                }
            }
        });
    }
}

// Endcord's own preload: its settings and IPC, and the renderer (src/preload.ts). It decides for itself which pages
// get Endcord
if (!VANILLA) require("./endcordDesktopPreload.js");
