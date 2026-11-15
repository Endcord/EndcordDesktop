# Endcord Desktop

Endcord's own lightweight desktop app for Discord, with Endcord's 500 plugins built in.

It opens Discord in a window of its own, so there's no Discord desktop app to patch. It's for when Discord's desktop app is no longer the Electron one that client mods can load into. [Endcord](https://github.com/Endcord/Endcord) is a fork of [Vencord](https://github.com/Vendicated/Vencord).

[Website](https://endcord.com) · [Download](https://github.com/Endcord/EndcordDesktop/releases/latest) · [Discord](https://discord.gg/endcord)

## Features

- Every Endcord plugin, setting and theme. Your Endcord settings and themes are copied over the first time it starts.
- Discord's own title bar, window buttons, and back and forward buttons, with no Windows frame around them.
- A tray icon. Close to the tray and start with Windows, both from the tray menu.
- The taskbar shows how many mentions are waiting, up to 9+. Notifications, and spell check with cut, copy and paste in text fields.
- Screen sharing with Endcord's own picker. Your computer's sound can be shared too, without your call's voices.
- Game Mode: the app finds running games itself, so Discord draws at a lower frame rate while you play.
- Opens discord:// links, such as invites, once you turn that on in the tray menu.
- The EC logo for the app icon, or Discord's logo if you prefer. Pick it under Endcord Desktop in Endcord's settings.
- Updates itself from this repository. Every update is signed with Endcord's release key and checked before it's used, the same way the mod's updates are.

## Lightweight

Built to use as little memory and CPU as it can. Here it is against Endcord 4.0.26 in Discord's own app, on the same PC and the same Discord account, signed in, with the window maximized on the Friends page and default settings:

| | Endcord Desktop 1.0.0 | Endcord 4.0.26 in Discord's app | Discord's app without mods |
|---|---:|---:|---:|
| Memory, all processes (MB) | **551** | 698 | 672 |
| Memory of Discord's page (MB) | **302** | 401 | 366 |
| JavaScript heap after a collection (MB) | 103 | 107 | **98** |
| Processes | **4** | 7 | 7 |
| Start to usable (ms) | **2,502** | 3,745 | 3,379 |
| CPU time in the first 30 s (ms) | **13,516** | 29,219 | 28,508 |
| CPU while idle (% of one core) | 4.81 | 1.80 | **1.51** |

That's about 150 MB (21%) less memory than Endcord in Discord's app, and 120 MB less than Discord's app without any mod. It's usable 1.2 s sooner and uses less than half the CPU time while it starts.

Each number is the median of 6 cold starts, taken by Endcord's [benchmark script](https://github.com/Endcord/Endcord/tree/main/benchmark) with the same definitions: memory is private memory 120 s after the start, and idle CPU is measured between 60 s and 120 s. Endcord Desktop was measured on 15 November 2026. The other two columns are from Endcord's benchmark of 23 October 2026 (Intel Core i5-12400F, 32 GB RAM, Windows 10, Discord 1.0.9265). Every run is in [`benchmark/results-desktop`](https://github.com/Endcord/Endcord/tree/main/benchmark/results-desktop).

The two days aren't identical:

- Discord's page changes from week to week.
- The account's Friends page had more on it in November: 12 friends online with live activity timers, against 4 friends and 2 activities in October, or 4,579 elements on the page against 3,701. That makes the page heavier for Endcord Desktop, not lighter.
- CPU while idle follows what Discord shows, so that row says more about the account than about the app. In a CPU profile of the same page, Endcord's own code was about 3% of the work, and Discord's page updating those timers was the rest. Signed out, with nothing changing on screen, the app idles under 1% of one core.
- Both process counts include a second GPU process that only shows up while the benchmark is attached. In normal use the app runs in three.

Hidden in the tray, the app takes about 25 to 40 MB a minute after you hide it, and about 0.1% CPU. The start after Discord updates its web app takes about 30 MB more, while Chromium compiles the new code and caches it for the starts after.

How:

- Three processes: the app, the GPU and Discord's page. Chromium's audio and network services run inside the app instead of in processes of their own.
- Chromium's camera service, a process of about 50 MB, only starts once you join a call or use your microphone, camera or screen. Until then Discord gets the list of devices from the last time.
- Hidden in the tray, the app hands its memory back to Windows. It comes back as you use the app again.
- After two minutes out of focus, Discord's page clears its unused memory.
- Background work runs in Windows' efficiency mode.
- V8 favours memory over speed, Node uses a single helper thread, and updates download through Chromium's network stack instead of a second one.
- Plugins only load when you turn them on.

## Install

Windows 10 and 11, 64-bit.

1. Download `EndcordDesktopSetup.exe` from the [latest release](https://github.com/Endcord/EndcordDesktop/releases/latest), or from [endcord.com/download](https://endcord.com/download), and run it. It installs for your Windows account and needs no admin rights.
2. It downloads the app from the same release, checks everything against Endcord's signed release, then adds Start menu and desktop shortcuts.
3. To remove it, open **Settings > Apps** and uninstall it. You can keep or delete your sign-in and settings.

Windows will warn about the setup because it isn't code-signed yet. Each release lists the SHA-256 of its files in `SHA256SUMS`.

The same code builds for Linux and macOS, but neither has been tried yet.

## Good to know

- It runs Discord's web app, the same one as in your browser, and Discord sees it as that.
- Like any client mod, it's against Discord's terms, the same as Endcord itself.
- Not there yet: push to talk while the window is in the background.
- Your game doesn't show as your status on its own yet. Turn on the WebRichPresence plugin and run [arRPC](https://github.com/OpenAsar/arrpc) for that.

## Privacy

Endcord Desktop sends no data to us. The app connects to:

- Discord.
- GitHub, for Endcord's signed updates.
- Discord's public list of games, at most once a week, while Game Mode is on. It keeps only the file names.

Plugins you turn on may talk to their own services.

## Source and building

This repository has the app's own code. It sits at the same paths it would have in [Endcord's repository](https://github.com/Endcord/Endcord), which has Endcord itself and its plugins:

- [`desktop/`](desktop) is the app around Discord's page: the window, tray, taskbar, screen sharing and updates. [`desktop/trim/`](desktop/trim) is the small Windows helper that hands memory back while the app is in the tray.
- [`scripts/build/buildDesktopApp.mjs`](scripts/build/buildDesktopApp.mjs) builds it, and [`test/desktop.mjs`](test/desktop.mjs) tests its main process against a stubbed Electron.
- [`src/plugins/_core/`](src/plugins/_core) has the parts of Endcord only this app loads: Discord's own title bar and window buttons, and holding back the camera service until media is used.
- [`assets/`](assets) has its icons.
- [`dist/`](dist) and [`version.json`](version.json) are the current release's update files and their signed manifest, which the app and setup read.

The app loads the whole of Endcord, so it builds from Endcord's repository with this one's files laid over it. You need Node.js 22 or newer and [pnpm](https://pnpm.io), and on Windows the .NET Framework 4 compiler that comes with Windows, for the tray helper.

```sh
git clone https://github.com/Endcord/Endcord.git
git clone https://github.com/Endcord/EndcordDesktop.git
cp -r EndcordDesktop/desktop EndcordDesktop/scripts EndcordDesktop/src EndcordDesktop/assets EndcordDesktop/test Endcord/
cd Endcord
pnpm install
pnpm buildStandalone
node scripts/build/buildDesktopApp.mjs
node test/desktop.mjs
```

The app ends up in `dist/EndcordDesktop-<platform>-<arch>`.

## Reporting problems

Open an [issue](https://github.com/Endcord/EndcordDesktop/issues) for problems with the app itself: the window, tray, taskbar, screen sharing, setup or updates. Pull requests for the app's code are welcome here too; see [CONTRIBUTING.md](CONTRIBUTING.md).

A plugin that misbehaves goes to [Endcord's issues](https://github.com/Endcord/Endcord/issues), and help questions go to the [Endcord server](https://discord.gg/endcord).

For security problems, see [SECURITY.md](SECURITY.md).

## Credits

Endcord Desktop is Endcord's own code. [Vesktop](https://github.com/Vencord/Vesktop) served as the example of what a desktop app around Discord's web app needs.

Endcord is built on [Vencord](https://github.com/Vendicated/Vencord) by Vendicated and its contributors. Most of its plugins come from [Equicord](https://github.com/Equicord/Equicord), by the Equicord contributors. Thank you all.

## License

[GPL-3.0-or-later](LICENSE). Copyright © Vendicated and the Vencord contributors, the Equicord contributors, and the Endcord team.

Endcord is not affiliated with Discord Inc. Discord and its logo are trademarks of Discord Inc.
