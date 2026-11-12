# Security

## Reporting a problem

Please don't open a public issue for a vulnerability. Use [private vulnerability reporting](https://github.com/Endcord/Endcord/security/advisories/new) on Endcord's repository, where Endcord Desktop's code lives, or message a maintainer on the [Endcord server](https://discord.gg/endcord).

Include what an attacker can do, the steps to reproduce it, and the version you tested. The bottom of Discord's settings sidebar shows the version, for example `Endcord 2ab4baf (Endcord Desktop v1.0.0)`.

## What protects what

Endcord Desktop shares Endcord's [threat model](https://github.com/Endcord/Endcord/blob/main/SECURITY.md). These protections are specific to the app:

| Threat | Protection |
| --- | --- |
| A page that isn't Discord's reaching the app | Only Discord's own pages get the app's native API, and the app checks which page sent every request it gets |
| A link in a message opening something else | Links open in your browser, never inside the app. Only web links and a few app links (Steam, Spotify, Epic Games, Tidal, iTunes) are handed to the system, checked so they can't carry extra commands |
| A tampered download during setup | Setup checks every download against the SHA-256 in Endcord's signed release before installing it |
| A tampered update | ECDSA P-256 signed releases and a SHA-256 for each file, the same as the mod |
| Screen sharing without asking | Every screen share goes through Endcord's own picker first; a request without a fresh pick from the same page is refused |
