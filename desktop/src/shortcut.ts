/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Windows only shows an app's notifications when a Start menu shortcut carries its app id, which is what an installer
// would make. Endcord Desktop comes as a folder, so it keeps its own shortcut, and points it at wherever it now runs from

import { app, shell } from "electron";
import { rmSync } from "fs";
import { join } from "path";

import { APP_ID, TEST_PROFILE } from "./common";
import { iconFile } from "./icon";

export const startMenuShortcut = () => join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Endcord Desktop.lnk");
export const desktopShortcut = () => join(app.getPath("desktop"), "Endcord Desktop.lnk");

const shortcutOptions = () => ({ target: process.execPath, appUserModelId: APP_ID, description: "Endcord", icon: iconFile(), iconIndex: 0 });

/** Made once, by setup (installer/Core/DesktopEngine.cs). Later starts leave it alone, so deleting it sticks */
export function writeDesktopShortcut() {
    if (process.platform !== "win32" || TEST_PROFILE || !app.isPackaged) return;
    shell.writeShortcutLink(desktopShortcut(), shortcutOptions());
}

/** Removes a shortcut of this app's name, if it is one of this app's */
export function removeShortcut(link: string) {
    try {
        if (shell.readShortcutLink(link).target.toLowerCase() === process.execPath.toLowerCase()) rmSync(link, { force: true });
    } catch { }
}

export function ensureStartMenuShortcut() {
    if (process.platform !== "win32" || TEST_PROFILE || !app.isPackaged) return;
    const link = startMenuShortcut();
    try {
        const current = shell.readShortcutLink(link);
        if (current.target === process.execPath && current.appUserModelId === APP_ID && current.icon === iconFile()) return;
    } catch { }
    shell.writeShortcutLink(link, shortcutOptions());
}

/** The desktop shortcut takes a new icon too, if there still is one of this app's */
export function updateDesktopShortcut() {
    if (process.platform !== "win32" || TEST_PROFILE || !app.isPackaged) return;
    try {
        if (shell.readShortcutLink(desktopShortcut()).target.toLowerCase() === process.execPath.toLowerCase()) shell.writeShortcutLink(desktopShortcut(), "update", shortcutOptions());
    } catch { }
}
