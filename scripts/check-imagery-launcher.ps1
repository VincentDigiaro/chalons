$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $projectRoot ('artifacts/imagery-launcher-tests/' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$launcher = Join-Path $projectRoot 'artifacts/imagery-service/runtime/ChalonsImageryCache.exe'
$probe = Join-Path $testRoot 'probe.exe'
$probeSource = Join-Path $testRoot 'probe.cs'
@'
using System;
using System.Runtime.InteropServices;
using System.Threading;
class Probe {
 [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
 static int Main() {
  Console.WriteLine("console=" + GetConsoleWindow().ToInt64());
  Console.Error.WriteLine("stderr-preserved");
  Thread.Sleep(300);
  return 23;
 }
}
'@ | Set-Content -LiteralPath $probeSource -Encoding UTF8
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:exe ('/out:' + $probe) $probeSource
if ($LASTEXITCODE -ne 0) { throw 'Probe compilation failed.' }
function Start-TestLauncher([string]$NodePath, [string]$Logs) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $launcher
    $start.UseShellExecute = $false
    # Deliberately do not hide the launcher here: its GUI subsystem must itself
    # prevent console allocation, as when Explorer or the scheduler starts it.
    $start.Arguments = '"' + $projectRoot + '" "' + $NodePath + '" "' + $Logs + '"'
    return [Diagnostics.Process]::Start($start)
}
function Read-Records([string]$Directory) {
    Get-Content -LiteralPath (Join-Path $Directory 'supervisor.jsonl') | ForEach-Object { $_ | ConvertFrom-Json }
}
$logs = Join-Path $testRoot 'probe'
$process = Start-TestLauncher $probe $logs
if (!$process.WaitForExit(10000)) { $process.Kill(); throw 'Launcher did not exit.' }
if ($process.ExitCode -ne 23) { throw "Wrong exit code: $($process.ExitCode)" }
$events = @(Read-Records $logs)
if (!($events | Where-Object { $_.event -eq 'process_exited' -and $_.exitCode -eq 23 })) { throw 'Child exit log missing.' }
$stdout = Get-ChildItem -LiteralPath $logs -Filter '*.stdout.log' | Get-Content
$stderr = Get-ChildItem -LiteralPath $logs -Filter '*.stderr.log' | Get-Content
if ($stdout -notcontains 'console=0') { throw 'Child has a console.' }
if ($stderr -notcontains 'stderr-preserved') { throw 'Stderr was lost.' }
# The PE subsystem must be Windows GUI (2), never Windows Console (3).
$bytes = [IO.File]::ReadAllBytes($launcher)
$peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
if ([BitConverter]::ToUInt16($bytes, $peOffset + 24 + 68) -ne 2) { throw 'Launcher is a console executable.' }

$failedLogs = Join-Path $testRoot 'missing-node'
$process = Start-TestLauncher (Join-Path $testRoot 'missing.exe') $failedLogs
if (!$process.WaitForExit(10000)) { $process.Kill(); throw 'Failure did not exit.' }
if ($process.ExitCode -ne 1 -or !((Read-Records $failedLogs) | Where-Object { $_.event -eq 'supervisor_failed' })) { throw 'Startup failure not preserved.' }

$previousPort = $env:IGN_PORT
$previousOffline = $env:IGN_OFFLINE
$running = $null
try {
    $env:IGN_PORT = '0'
    $env:IGN_OFFLINE = '1'
    $realLogs = Join-Path $testRoot 'real-server'
    $running = Start-TestLauncher (Get-Command node.exe).Source $realLogs
    $ready = $null
    for ($i = 0; $i -lt 100 -and !$ready; $i++) {
        $eventFile = Join-Path $realLogs 'events.jsonl'
        if (Test-Path $eventFile) { $ready = Get-Content $eventFile | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.event -eq 'service_listening' } }
        if (!$ready) { Start-Sleep -Milliseconds 100 }
    }
    if (!$ready) { throw 'Isolated server never listened.' }
    $childId = $ready.pid
    $response = Invoke-WebRequest -UseBasicParsing -Method Head -Uri ('http://127.0.0.1:' + $ready.address.port + '/data/imagery/ign/18/134265/90098.jpg') -TimeoutSec 5
    if ($response.StatusCode -ne 200) { throw 'Saved tile did not respond.' }
    # Killing the launcher must close its job and end Node too.
    $child = Get-Process -Id $childId
    $running.Kill()
    if (!$running.WaitForExit(5000) -or !$child.WaitForExit(5000)) { throw 'Server was orphaned after launcher termination.' }
    [pscustomobject]@{guiSubsystem='passed';childConsole='none';stdoutAndStderr='preserved';exitCode=23;startupFailure='logged';isolatedHttp=200;childStoppedWithLauncher=$true;artifacts=$testRoot} | ConvertTo-Json -Compress
} finally {
    if ($running -and !$running.HasExited) { $running.Kill(); $running.WaitForExit() }
    $env:IGN_PORT = $previousPort
    $env:IGN_OFFLINE = $previousOffline
}
