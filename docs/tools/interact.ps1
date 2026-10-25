param(
  [string]$Keys = 'cd /etc{ENTER}',
  [int]$ClickX = 700,
  [int]$ClickY = 300,
  [string]$Out = 'C:\project\shell\docs\shots\interact.png'
)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32In {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*HostShell*' } | Select-Object -First 1
if (-not $p) { 'NO_WINDOW'; exit 1 }
$h = $p.MainWindowHandle
if ([W32In]::IsIconic($h)) { [W32In]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 800 }
[W32In]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500
$r = New-Object W32In+RECT
[W32In]::GetWindowRect($h, [ref]$r) | Out-Null
$cx = $r.Left + $ClickX
$cy = $r.Top + $ClickY
[W32In]::SetCursorPos($cx, $cy) | Out-Null
Start-Sleep -Milliseconds 150
# left down / left up
[W32In]::mouse_event(0x0002, 0, 0, 0, 0)
Start-Sleep -Milliseconds 60
[W32In]::mouse_event(0x0004, 0, 0, 0, 0)
Start-Sleep -Milliseconds 400
$ws = New-Object -ComObject WScript.Shell
$ws.SendKeys($Keys)
Start-Sleep -Seconds 2
powershell -NoProfile -ExecutionPolicy Bypass -File C:\project\shell\docs\tools\capture-window.ps1 -ProcessName electron -TitleLike HostShell -Out $Out
