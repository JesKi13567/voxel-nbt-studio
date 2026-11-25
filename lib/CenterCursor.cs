using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

internal static class CenterCursor
{
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point p);
    [DllImport("user32.dll")] private static extern bool ScreenToClient(IntPtr window, ref Point p);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out Rect b);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    private static bool Contains(Rect r, Point p) { return p.X >= r.Left && p.X < r.Right && p.Y >= r.Top && p.Y < r.Bottom; }

    private static int Main(string[] args)
    {
        int dx, dy;
        if (args.Length != 3 || !int.TryParse(args[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out dx) ||
            !int.TryParse(args[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out dy) ||
            dx < -20000 || dx > 20000 || dy < -20000 || dy > 20000) return 2;
        try
        {
            // Match Chromium's physical pixels, including a non-primary monitor's negative coordinates.
            if (SetThreadDpiAwarenessContext(new IntPtr(-4)) == IntPtr.Zero) return 1;
            var window = GetForegroundWindow();
            uint pid;
            if (window == IntPtr.Zero || GetWindowThreadProcessId(window, out pid) == 0) return 1;
            using (var owner = Process.GetProcessById((int)pid))
                if (!String.Equals(owner.MainModule.FileName, args[0], StringComparison.OrdinalIgnoreCase)) return 1;
            if ((GetAsyncKeyState(1) & 0x8000) != 0 || (GetAsyncKeyState(2) & 0x8000) != 0 || (GetAsyncKeyState(4) & 0x8000) != 0) return 1;
            Point current;
            Rect bounds;
            if (!GetCursorPos(out current) || !GetClientRect(window, out bounds)) return 1;
            var target = new Point { X = current.X + dx, Y = current.Y + dy };
            var fromClient = current;
            var toClient = target;
            if (!ScreenToClient(window, ref fromClient) || !ScreenToClient(window, ref toClient) ||
                !Contains(bounds, fromClient) || !Contains(bounds, toClient) || window != GetForegroundWindow()) return 1;
            return SetCursorPos(target.X, target.Y) ? 0 : 1;
        }
        catch { return 1; }
    }
}
