# Endcord Desktop

Endcord's own lightweight desktop app for Discord, with Endcord's 500 plugins built in.

It opens Discord in a window of its own, so there's no Discord desktop app to patch. It's for when Discord's desktop app is no longer the Electron one that client mods can load into. [Endcord](https://github.com/Endcord/Endcord) is a fork of [Vencord](https://github.com/Vendicated/Vencord).

[Website](https://endcord.com) · [Download](https://endcord.com/download) · [Discord](https://discord.gg/endcord)

## Features

- Every Endcord plugin, setting and theme. Your Endcord settings and themes are copied over the first time it starts.
- Discord's own title bar, window buttons, and back and forward buttons, with no Windows frame around them.
- A tray icon. Close to the tray and start with Windows, both from the tray menu.
- The taskbar shows how many mentions are waiting, up to 9+. Notifications, and spell check with cut, copy and paste in text fields.
- Screen sharing with Endcord's own picker. Your computer's sound can be shared too, without your call's voices.
- Game Mode: the app finds running games itself, so Discord draws at a lower frame rate while you play.
- Opens discord:// links, such as invites, once you turn that on in the tray menu.
- The EC logo for the app icon, or Discord's logo if you prefer. Pick it under Endcord Desktop in Endcord's settings.
- Updates from Endcord's signed releases, the same way the mod gets them.

## Lightweight

Built to use as little memory as it can:

- Chromium's audio and network services run inside the app, not as separate processes.
- V8 is tuned to favour memory over speed.
- Node uses a single helper thread.
- After two minutes out of focus, the app clears Discord's unused memory.
- Plugins only load when you turn them on.

## Install

Windows 10 and 11, 64-bit.

Endcord Desktop hasn't had its first release yet. When it does, the setup will be on [endcord.com/download](https://endcord.com/download):

1. Download `EndcordDesktopSetup.exe` and run it. It installs for your Windows account and needs no admin rights.
2. It downloads the app from this repository's [releases](https://github.com/Endcord/EndcordDesktop/releases), checks everything against Endcord's signed release, then adds Start menu and desktop shortcuts.
3. To remove it, open **Settings > Apps** and uninstall it. You can keep or delete your sign-in and settings.

Windows will warn about the setup because it isn't code-signed yet.

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

The code is developed in [Endcord's repository](https://github.com/Endcord/Endcord):

- [`desktop/`](https://github.com/Endcord/Endcord/tree/main/desktop) is the app around Discord's page.
- The rest of the repository is the Endcord it loads.

You need Node.js 22 or newer and [pnpm](https://pnpm.io).

```sh
git clone https://github.com/Endcord/Endcord.git
cd Endcord
pnpm install
pnpm buildDesktopApp
```

The app ends up in `dist/EndcordDesktop-<platform>-<arch>`.

## Reporting problems

Open an [issue](https://github.com/Endcord/EndcordDesktop/issues) for problems with the app itself: the window, tray, taskbar, screen sharing, setup or updates.

A plugin that misbehaves goes to [Endcord's issues](https://github.com/Endcord/Endcord/issues), and help questions go to the [Endcord server](https://discord.gg/endcord).

For security problems, see [SECURITY.md](SECURITY.md).

## Credits

Endcord Desktop is Endcord's own code. [Vesktop](https://github.com/Vencord/Vesktop) served as the example of what a desktop app around Discord's web app needs.

Endcord is built on [Vencord](https://github.com/Vendicated/Vencord) by Vendicated and its contributors. Most of its plugins come from [Equicord](https://github.com/Equicord/Equicord), by the Equicord contributors. Thank you all.

## License

[GPL-3.0-or-later](LICENSE). Copyright © Vendicated and the Vencord contributors, the Equicord contributors, and the Endcord team.

Endcord is not affiliated with Discord Inc. Discord and its logo are trademarks of Discord Inc.
