/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-check

// Builds Endcord Desktop (desktop/) for this computer's system into dist/EndcordDesktop-<platform>-<arch>, and that
// folder as a zip next to it: Electron, the app's own two files, and the endcordDesktop* files of the last
// `pnpm buildStandalone`. Run that first. Also writes dist/desktop-build.json, which the release script reads.
//
// Electron and, on Windows, rcedit (which gives the exe Endcord's icon and name) come from their GitHub releases,
// checked against the checksums below, and are kept in node_modules/.cache.

import { execFileSync } from "child_process";
import { createHash } from "crypto";
import esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..", "..");
const DIST = join(ROOT, "dist");
const VERSION = JSON.parse(readFileSync(join(ROOT, "desktop", "app.json"), "utf-8")).version;

// A release at least a week old, like every other dependency (see minimumReleaseAge in pnpm-workspace.yaml).
// Checksums from its SHASUMS256.txt
const ELECTRON = "45.2.2";
/** @type {Record<string, string>} */
const ELECTRON_SHA256 = {
    "win32-x64": "a234388419ccbcb18dd2feec856e4ae1832499e200837f23f8e653bd51ff3be5",
    "win32-arm64": "d1cf215298a259c3f73bd44bedb06ccbafe3fad590d2a6695c527063ff411939",
    "linux-x64": "b5d3e7e5a80faeb194e741f85c667951490ba8052b655566d47dacb20f9868f9",
    "linux-arm64": "ebecf43f3c348fd589bf3bfa5643842deb0993da94ce5604255799ac9d4512d1",
    "darwin-x64": "fbf5bcc8eee6c45e99f5aeaf63adfad8a75cb46974c258f5d0f2d865bedb8536",
    "darwin-arm64": "f9d9a3419cb9514a209fb95470f520b7e557c6262849bde81ca91d7a7435772e",
};
// electron/rcedit v2.0.0, the tool Electron's own packagers use. It isn't code-signed, so its checksum is pinned here
const RCEDIT = { version: "2.0.0", sha256: "3e7801db1a5edbec91b49a24a094aad776cb4515488ea5a4ca2289c400eade2a" };

// Chromium's own words (menus, dialogs) only in the languages Endcord speaks; the rest fall back to English
const LOCALES = ["en-US", "es", "es-419", "fr", "ru", "tr"];
const ENDCORD_FILES = ["endcordDesktopMain.js", "endcordDesktopPreload.js", "endcordDesktopRenderer.js", "endcordDesktopRenderer.css"];

const target = `${process.platform}-${process.arch}`;
if (!ELECTRON_SHA256[target]) throw new Error(`No Electron for ${target}`);
for (const file of ENDCORD_FILES) {
    if (!existsSync(join(DIST, file))) throw new Error(`dist/${file} is missing. Run pnpm buildStandalone first`);
}

const cacheDir = join(ROOT, "node_modules", ".cache", "endcord-desktop");
const digest = (/** @type {string} */ file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const windowsTool = (/** @type {string} */ name) => join(process.env.SystemRoot ?? "C:\\Windows", "System32", name);

/** A download kept in the cache, only ever used when its checksum matches */
async function cached(/** @type {string} */ url, /** @type {string} */ name, /** @type {string} */ sha256) {
    const file = join(cacheDir, name);
    if (existsSync(file) && digest(file) === sha256) return file;
    mkdirSync(cacheDir, { recursive: true });
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const got = createHash("sha256").update(data).digest("hex");
    if (got !== sha256) throw new Error(`${name}'s checksum doesn't match: expected ${sha256}, got ${got}`);
    writeFileSync(file, data);
    return file;
}

// 1. Electron
const electronZip = await cached(
    `https://github.com/electron/electron/releases/download/v${ELECTRON}/electron-v${ELECTRON}-${target}.zip`,
    `electron-v${ELECTRON}-${target}.zip`,
    ELECTRON_SHA256[target]
);

const folderName = `EndcordDesktop-${target}`;
const out = join(DIST, folderName);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
if (process.platform === "win32") execFileSync(windowsTool("tar.exe"), ["-xf", electronZip, "-C", out]);
else if (process.platform === "darwin") execFileSync("ditto", ["-x", "-k", electronZip, out]);
else execFileSync("unzip", ["-q", electronZip, "-d", out]);

// 2. Electron's folder as Endcord Desktop's
const resources = process.platform === "darwin" ? join(out, "Electron.app", "Contents", "Resources") : join(out, "resources");
rmSync(join(resources, "default_app.asar"), { force: true });
const exe = process.platform === "win32" ? join(out, "EndcordDesktop.exe") : join(out, "endcord-desktop");
if (process.platform === "win32") renameSync(join(out, "electron.exe"), exe);
else if (process.platform === "linux") renameSync(join(out, "electron"), exe);

const localesDir = process.platform === "darwin" ? null : join(out, "locales");
if (localesDir && existsSync(localesDir)) {
    for (const file of readdirSync(localesDir)) {
        if (!LOCALES.includes(file.replace(/\.pak$/, ""))) rmSync(join(localesDir, file));
    }
}

// Task Manager, the taskbar and Explorer show the exe's own icon and name
if (process.platform === "win32") {
    const rcedit = await cached(
        `https://github.com/electron/rcedit/releases/download/v${RCEDIT.version}/rcedit-x64.exe`,
        `rcedit-x64-v${RCEDIT.version}.exe`,
        RCEDIT.sha256
    );
    const strings = {
        FileDescription: "Endcord",
        ProductName: "Endcord Desktop",
        CompanyName: "Endcord",
        LegalCopyright: "Endcord: GPL-3.0-or-later. Electron: MIT",
        OriginalFilename: "EndcordDesktop.exe",
        InternalName: "EndcordDesktop"
    };
    execFileSync(rcedit, [
        exe,
        "--set-icon", join(ROOT, "assets", "desktop_icon.ico"),
        "--set-file-version", VERSION,
        "--set-product-version", VERSION,
        ...Object.entries(strings).flatMap(([key, value]) => ["--set-version-string", key, value])
    ]);
}

// 3. The app: a plain folder, not an asar, since Endcord's preload keeps a startup file next to its renderer file and
// the updater replaces files in it
const app = join(resources, "app");
mkdirSync(app, { recursive: true });
writeFileSync(join(app, "package.json"), JSON.stringify({ name: "endcord-desktop", productName: "Endcord Desktop", version: VERSION, main: "main.js", license: "GPL-3.0-or-later" }, null, 4));

await Promise.all(["main", "preload"].map(name => esbuild.build({
    entryPoints: [join(ROOT, "desktop", "src", `${name}.ts`)],
    outfile: join(app, `${name}.js`),
    bundle: true,
    minify: true,
    platform: "node",
    format: "cjs",
    target: `node${process.versions.node.split(".")[0]}`,
    external: ["electron", "electron/*", "./endcordDesktopMain.js", "./endcordDesktopPreload.js"],
    legalComments: "none",
    logLevel: "warning",
    tsconfig: join(ROOT, "tsconfig.json")
})));

for (const file of ENDCORD_FILES) copyFileSync(join(DIST, file), join(app, file));
for (const file of readdirSync(DIST).filter(f => /^endcordDesktop\w+\.js\.LEGAL\.txt$/.test(f))) copyFileSync(join(DIST, file), join(app, file));
// The EC logo with the panda; the installer keeps app_icon.ico
copyFileSync(join(ROOT, "assets", "desktop_icon.ico"), join(app, "icon.ico"));
copyFileSync(join(ROOT, "assets", "desktop_icon.png"), join(app, "icon.png"));
// Discord's logo, for those who pick it in Endcord's settings (desktop/src/icon.ts)
copyFileSync(join(ROOT, "assets", "desktop_icon_discord.ico"), join(app, "icon-discord.ico"));
copyFileSync(join(ROOT, "assets", "desktop_icon_discord.png"), join(app, "icon-discord.png"));
copyFileSync(join(ROOT, "LICENSE"), join(out, "LICENSE.endcord.txt"));

// Windows: the helper that hands the hidden app's working sets back to Windows (desktop/trim/Trim.cs), compiled with
// the .NET Framework compiler every Windows has. Without it the app still trims what Chromium can, and nothing else
if (process.platform === "win32") {
    const csc = join(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
    if (existsSync(csc)) {
        execFileSync(csc, ["/nologo", "/target:winexe", "/optimize+", `/out:${join(out, "EndcordDesktopTrim.exe")}`, join(ROOT, "desktop", "trim", "Trim.cs")], { stdio: "inherit" });
    } else {
        console.warn(`No ${csc}: EndcordDesktopTrim.exe left out`);
    }
}

// 4. The download: the folder as one zip, and what the release needs to know about it
const zipName = `${folderName}.zip`;
const zipFile = join(DIST, zipName);
rmSync(zipFile, { force: true });
if (process.platform === "win32") execFileSync(windowsTool("tar.exe"), ["-a", "-c", "-f", zipFile, "-C", DIST, folderName]);
else if (process.platform === "darwin") execFileSync("ditto", ["-c", "-k", "--keepParent", out, zipFile]);
else execFileSync("zip", ["-qry", zipFile, folderName], { cwd: DIST });
const zipSha256 = digest(zipFile);
writeFileSync(`${zipFile}.sha256`, `${zipSha256}  ${zipName}\n`);
writeFileSync(join(DIST, "desktop-build.json"), JSON.stringify({ version: VERSION, electron: ELECTRON, target, folder: folderName, zip: zipName, zipSha256 }, null, 4));

const size = (/** @type {string} */ dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .reduce((total, entry) => total + statSync(join(entry.parentPath, entry.name)).size, 0);
console.log(`${out}: ${Math.round(size(out) / 2 ** 20)} MB (the app's own files ${Math.round(size(app) / 1024)} KB)`);
console.log(`${zipFile}: ${Math.round(statSync(zipFile).size / 2 ** 20)} MB, sha256 ${zipSha256}`);
