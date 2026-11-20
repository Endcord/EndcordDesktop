/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// discord:// links (invites, "Open in app" on discord.com) open here only when the user turns it on: Discord's own
// app, and the Endcord mod inside it, use the same address. The program that had it before is remembered and gets it
// back when this is turned off or the app is removed

import { execFileSync } from "child_process";
import { app } from "electron";
import { join } from "path";

import { TEST_PROFILE } from "./common";
import { getSettings, setSetting } from "./settings";

const PROTOCOL = "discord";
const REG = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
const COMMAND_KEY = "HKCU\\Software\\Classes\\discord\\shell\\open\\command";

// The pages a discord:// link may open. Anything else in one is ignored rather than loaded
const PAGES = new Set(["app", "channels", "invite", "users", "settings", "discovery", "guild-discovery", "events", "quests", "shop", "store", "login"]);

/** The discord.com page a discord:// link stands for, or null when it isn't a link to one of Discord's pages */
export function discordLinkTarget(argv: readonly string[]) {
    const link = argv.find(arg => arg.toLowerCase().startsWith(`${PROTOCOL}://`));
    if (!link) return null;
    // discord://-/channels/1/2 and discord:///invite/abc both name a path on discord.com
    const path = link.slice(`${PROTOCOL}://`.length).replace(/^-?\/+/, "").replace(/\/+$/, "");
    // A "." or ".." part would lead the URL out of the page it names
    if (path.length > 300 || !/^[\w@.-]+(?:\/[\w@.-]+)*$/.test(path) || /(?:^|\/)\.+(?:\/|$)/.test(path) || !PAGES.has(path.split("/")[0])) return null;
    return `https://discord.com/${path}`;
}

/** Whether this app can take discord:// links on this system: Windows, and never a test profile */
export const canHandleDiscordLinks = () => process.platform === "win32" && !TEST_PROFILE && app.isPackaged;

export const handlesDiscordLinks = () => canHandleDiscordLinks() && app.isDefaultProtocolClient(PROTOCOL);

function readCommand(): string {
    try {
        const out = execFileSync(REG, ["query", COMMAND_KEY, "/ve"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        // "    (Default)    REG_SZ    "C:\...\Update.exe" --processStart Discord.exe --process-start-args "%1"". The
        // value's name is in the system's language, its type isn't
        return /REG_(?:EXPAND_)?SZ[ \t]+(.+?)\s*$/m.exec(out)?.[1] ?? "";
    } catch {
        return "";
    }
}

export function setHandlesDiscordLinks(on: boolean) {
    if (!canHandleDiscordLinks()) return;
    if (on) {
        if (!app.isDefaultProtocolClient(PROTOCOL)) setSetting("previousDiscordLinkCommand", readCommand());
        app.setAsDefaultProtocolClient(PROTOCOL);
        return;
    }
    if (app.isDefaultProtocolClient(PROTOCOL)) {
        const previous = getSettings().previousDiscordLinkCommand;
        if (previous) {
            try {
                execFileSync(REG, ["add", COMMAND_KEY, "/ve", "/d", previous, "/f"], { windowsHide: true, stdio: "ignore" });
            } catch {
                app.removeAsDefaultProtocolClient(PROTOCOL);
            }
        } else {
            app.removeAsDefaultProtocolClient(PROTOCOL);
        }
    }
    setSetting("previousDiscordLinkCommand", "");
}
