/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Unread mentions on the taskbar. Discord's web app puts their count in the page title ("(3) Discord | ..."), so the
// title is all this watches: no polling, nothing in the page

import { app, type BrowserWindow, type NativeImage, nativeImage, type Tray } from "electron";

import { strings } from "./strings";

export const mentionsInTitle = (title: string) => Number(/^\((\d+)\)/.exec(title)?.[1] ?? 0);

/** What the badge says: the count, or "9+" past nine, as on Discord's app */
export const badgeText = (count: number) => count > 9 ? "9+" : String(count);

// #region Drawing

type Point = [number, number];

/** Points along an ellipse, angles in degrees, clockwise on screen (0 is right, 90 is down) */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Point[] {
    const steps = Math.ceil(Math.abs(to - from) / 12);
    return Array.from({ length: steps + 1 }, (_, i) => {
        const angle = (from + (to - from) * i / steps) * Math.PI / 180;
        return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
    });
}

// Each glyph as strokes in a box 0.56 wide and 1 high
const GLYPHS: Record<string, Point[][]> = {
    "0": [arc(0.28, 0.5, 0.24, 0.44, 0, 360)],
    "1": [[[0.1, 0.24], [0.34, 0.06], [0.34, 0.94]]],
    "2": [[...arc(0.28, 0.3, 0.23, 0.23, 190, 375), [0.04, 0.94], [0.55, 0.94]]],
    "3": [[...arc(0.27, 0.27, 0.22, 0.21, 200, 450), ...arc(0.27, 0.71, 0.25, 0.23, 270, 520)]],
    "4": [[[0.42, 0.94], [0.42, 0.06], [0.03, 0.68], [0.56, 0.68]]],
    "5": [[[0.5, 0.06], [0.12, 0.06], [0.08, 0.47], ...arc(0.27, 0.67, 0.26, 0.27, 222, 520)]],
    "6": [[[0.44, 0.06], [0.08, 0.6]], arc(0.29, 0.69, 0.24, 0.25, 0, 360)],
    "7": [[[0.03, 0.06], [0.55, 0.06], [0.2, 0.94]]],
    "8": [arc(0.28, 0.27, 0.2, 0.21, 0, 360), arc(0.28, 0.71, 0.25, 0.23, 0, 360)],
    "9": [arc(0.27, 0.31, 0.24, 0.25, 0, 360), [[0.48, 0.4], [0.12, 0.94]]],
    "+": [[[0.28, 0.22], [0.28, 0.78]], [[0.02, 0.5], [0.54, 0.5]]]
};
const GLYPH_WIDTH = 0.56;

function distanceToSegment(px: number, py: number, [ax, ay]: Point, [bx, by]: Point) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const SIZE = 32;
const images = new Map<string, NativeImage>();

/** Discord's red circle with the count in white, drawn here rather than shipped as files */
export function badgeImage(text: string) {
    let image = images.get(text);
    if (image) return image;

    // The text's strokes in pixels, centred in the circle
    const height = text.length > 1 ? 15 : 17;
    const gap = 0.12;
    const width = (text.length * GLYPH_WIDTH + (text.length - 1) * gap) * height;
    const left = (SIZE - width) / 2, top = (SIZE - height) / 2;
    const segments: [Point, Point][] = [];
    [...text].forEach((char, i) => {
        for (const stroke of GLYPHS[char] ?? []) {
            const points = stroke.map(([x, y]): Point => [left + (x + i * (GLYPH_WIDTH + gap)) * height, top + y * height]);
            for (let j = 1; j < points.length; j++) segments.push([points[j - 1], points[j]]);
        }
    });

    const pixels = Buffer.alloc(SIZE * SIZE * 4);
    const center = SIZE / 2, radius = SIZE / 2;
    const halfStroke = text.length > 1 ? 1.45 : 1.6;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const px = x + 0.5, py = y + 0.5;
            // How much of the pixel each shape covers, from its distance to the edge
            const disc = Math.min(1, Math.max(0, radius - Math.hypot(px - center, py - center) + 0.5));
            if (!disc) continue;
            let nearest = Infinity;
            for (const [a, b] of segments) nearest = Math.min(nearest, distanceToSegment(px, py, a, b));
            const ink = Math.min(1, Math.max(0, halfStroke - nearest + 0.5));
            // #f23f43 under white, BGRA with premultiplied alpha
            const at = (y * SIZE + x) * 4;
            pixels[at] = Math.round((0x43 + (255 - 0x43) * ink) * disc);
            pixels[at + 1] = Math.round((0x3f + (255 - 0x3f) * ink) * disc);
            pixels[at + 2] = Math.round((0xf2 + (255 - 0xf2) * ink) * disc);
            pixels[at + 3] = Math.round(255 * disc);
        }
    }
    image = nativeImage.createFromBitmap(pixels, { width: SIZE, height: SIZE });
    images.set(text, image);
    return image;
}

// #endregion

export function trackMentions(win: BrowserWindow, tray: Tray | null) {
    let mentions = 0;
    win.on("page-title-updated", (_event, title) => {
        const count = mentionsInTitle(title);
        if (count === mentions) return;
        // A new one while the window is away gets the taskbar button's attention, as in Discord's app
        if (count > mentions && !win.isFocused()) win.flashFrame(true);
        mentions = count;

        const label = count ? strings().mentions(count) : "";
        if (process.platform === "win32") win.setOverlayIcon(count ? badgeImage(badgeText(count)) : null, label);
        else app.setBadgeCount(count);
        tray?.setToolTip(count ? `Endcord · ${label}` : "Endcord");
    });
    win.on("focus", () => win.flashFrame(false));
}
