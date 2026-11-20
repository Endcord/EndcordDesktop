# Changelog

What changed in each Endcord Desktop release.

## Update of 2026-11-20 (with Endcord 4.1.2)

The app stays 1.0.0 and installed copies update on their own. Everything in [Endcord 4.1.2](https://github.com/Endcord/Endcord/blob/main/CHANGELOG.md) is in it, and:

### Fixed

- When Discord's page doesn't load, for example when the app starts with Windows before the network is up, the app tries again instead of staying blank.
- Restart from Endcord's settings no longer hides the window in the tray when the app had started with Windows.
- A window saved on a monitor that's no longer connected opens on a screen you have.
- Game Mode tries Discord's list of games again when it couldn't get it, and looks up the running programs by Windows' full path to `tasklist`.
- discord:// links with `.` or `..` in their path are refused.
- The screen share picker ignores key presses that a page makes up, and speaks Spanish, French and Russian too.
- FileUpload and ZIP+ upload through the app's own process, and SekaiStickers and TriviaAI reach their servers (their hosts were missing from the content security policy).

## 1.0.0 (2026-11-15)

The first release. Endcord Desktop is Endcord's own app around Discord's web app, with every Endcord plugin and theme built in.

### Added

- Endcord Desktop has a setup: `EndcordDesktopSetup.exe`. It installs for your Windows account without admin rights, checks everything it downloads against Endcord's signed release, adds Start menu and desktop shortcuts, and lists the app in Settings > Apps, where it can be removed with or without its sign-in and settings. The app itself comes from the releases of its own repository, [Endcord/EndcordDesktop](https://github.com/Endcord/EndcordDesktop), which also takes its bug reports.
- Endcord Desktop can open discord:// links (invites, "Open in app" on discord.com) when you turn it on in its tray menu. It's off by default, since Discord's own app uses those links too, and turning it off gives them back.
- WebRichPresence (arRPC) works in Endcord Desktop, which has no game detection of its own: run arRPC and your games show as your status.
- Endcord Desktop looks like Discord's app: Discord's own title bar with its window buttons and back and forward replaces the Windows frame, the taskbar badge shows how many mentions are waiting (9+ past nine) instead of a plain red dot, and the app's icon is the EC logo with the panda, or Discord's logo for those who pick it under Endcord Desktop in Endcord's settings.
- Endcord Desktop is built to be light. Signed out it runs in three processes and about 250 MB in Task Manager, and hidden in the tray it drops to about 25 to 40 MB a minute later. Idle, it uses under 1% of one CPU core, and about 0.1% in the tray. How:
  - Chromium's audio and network services run inside the app instead of as processes of their own.
  - Chromium's camera service, a process of about 50 MB, only starts once you join a call or use your microphone, camera or screen. Until then Discord gets the list of devices from the last time.
  - In the tray, the app hands its memory back to Windows with a small helper, `EndcordDesktopTrim.exe`, which only touches the app's own processes. It comes back as you use the app again. Endcord's "Keep caches while Discord is minimized or in the tray" setting turns this off too.
  - Discord's page collects its garbage once the window has been out of focus for two minutes.
  - Processes Chromium puts in the background run in Windows' efficiency mode.
  - V8 favours memory over speed, Node keeps a single helper thread, and updates download through Chromium's network stack instead of a second one in Node.
- Game Mode in Endcord Desktop, in the Control Center and under Diagnostics. Discord's web app can't see games, so the app looks for them itself: the running programs against Discord's own list of games, every 20 seconds and only while Game Mode is on and the window is in the background. The list is fetched at most once a week and kept as file names only.

### Security

- Endcord Desktop runs on Electron 45.2.2 (it was on 45.1.0, four security releases behind).

### Fixed

- WebScreenShareFixes keeps stereo on whenever DTX is off in Endcord Desktop while VoiceSettings is on too. VoiceSettings' Force Stereo changed the same line first, and WebScreenShareFixes then found nothing to change.
