/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The app's own few settings, apart from Endcord's (which live in its settings.json). Read once, written when changed

import { app } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface DesktopSettings {
    /** Closing the window hides it in the tray instead of quitting, like Discord's own app */
    closeToTray: boolean;
    /** What opened discord:// links before this app took them, so it can have them back (desktop/src/links.ts) */
    previousDiscordLinkCommand: string;
    /** The app's icon: "endcord" or "discord" (desktop/src/icon.ts) */
    icon: string;
}

const DEFAULTS: DesktopSettings = { closeToTray: true, previousDiscordLinkCommand: "", icon: "endcord" };

let current: DesktopSettings | undefined;
const file = () => join(app.getPath("userData"), "desktop-settings.json");

export function getSettings(): DesktopSettings {
    if (!current) {
        current = { ...DEFAULTS };
        try {
            const saved = JSON.parse(readFileSync(file(), "utf-8"));
            for (const key of Object.keys(DEFAULTS) as (keyof DesktopSettings)[]) {
                if (typeof saved?.[key] === typeof DEFAULTS[key]) Object.assign(current, { [key]: saved[key] });
            }
        } catch { }
    }
    return current;
}

export function setSetting<K extends keyof DesktopSettings>(key: K, value: DesktopSettings[K]) {
    getSettings()[key] = value;
    try {
        writeFileSync(file(), JSON.stringify(current));
    } catch { }
}
