// Endcord, a Discord client mod
// Copyright (c) 2026 rootpoi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// EndcordDesktopTrim.exe: empties the working sets of Endcord Desktop's own processes, the ids it's given, while the
// app's window is hidden (src/main/memoryTrim.ts). Nothing is freed or changed: Windows keeps the pages, hands them to
// other programs when they need memory, and brings them back as the app uses them again. Only processes whose program
// is the EndcordDesktop.exe next to this file are touched; anything else is skipped. Built by
// scripts/build/buildDesktopApp.mjs with the .NET Framework compiler every Windows has

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

static class Trim
{
    const uint QueryLimitedInformation = 0x1000;
    const uint SetQuota = 0x0100;

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, int processId);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool QueryFullProcessImageNameW(IntPtr process, int flags, StringBuilder name, ref int size);

    [DllImport("psapi.dll")]
    static extern bool EmptyWorkingSet(IntPtr process);

    static int Main(string[] args)
    {
        string app = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "EndcordDesktop.exe");
        int trimmed = 0;
        foreach (string arg in args)
        {
            int id;
            if (!int.TryParse(arg, out id) || id <= 0) continue;
            IntPtr process = OpenProcess(QueryLimitedInformation | SetQuota, false, id);
            if (process == IntPtr.Zero) continue;
            try
            {
                var name = new StringBuilder(1024);
                int size = name.Capacity;
                if (!QueryFullProcessImageNameW(process, 0, name, ref size)) continue;
                if (!string.Equals(Path.GetFullPath(name.ToString()), Path.GetFullPath(app), StringComparison.OrdinalIgnoreCase)) continue;
                if (EmptyWorkingSet(process)) trimmed++;
            }
            finally
            {
                CloseHandle(process);
            }
        }
        return trimmed;
    }
}
