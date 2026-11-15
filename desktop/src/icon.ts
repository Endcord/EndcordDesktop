/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The app's icon: the EC logo, or Discord's for those who'd rather see that (Endcord's settings, Endcord Desktop only).
// The exe keeps the EC logo; the window, the tray, the taskbar and the shortcuts follow the setting

import type { BrowserWindow } from "electron";
import { join } from "path";

import { APP_ID } from "./common";
import { getSettings } from "./settings";

export const APP_ICONS = ["endcord", "discord"] as const;
export type AppIcon = typeof APP_ICONS[number];

export const isAppIcon = (value: unknown): value is AppIcon => APP_ICONS.includes(value as AppIcon);

export const appIcon = (): AppIcon => isAppIcon(getSettings().icon) ? getSettings().icon as AppIcon : "endcord";

/** The icon file for this system: .ico on Windows, .png on Linux, none on macOS (the app bundle has its own) */
export function iconFile(icon: AppIcon = appIcon()) {
    const name = icon === "discord" ? "icon-discord" : "icon";
    if (process.platform === "win32") return join(__dirname, `${name}.ico`);
    if (process.platform === "linux") return join(__dirname, `${name}.png`);
    return undefined;
}

/**
 * The window's own icon, and on Windows the one its taskbar button shows. The taskbar takes that from the app id's
 * shortcut, which can still point at an earlier copy of the app; the window's relaunch icon outranks it
 */
export function setWindowIcon(win: BrowserWindow) {
    const file = iconFile();
    if (!file) return;
    win.setIcon(file);
    if (process.platform === "win32") {
        win.setAppDetails({ appId: APP_ID, appIconPath: file, appIconIndex: 0, relaunchCommand: `"${process.execPath}"`, relaunchDisplayName: "Endcord Desktop" });
    }
}
