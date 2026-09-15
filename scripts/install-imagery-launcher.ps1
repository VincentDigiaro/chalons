# Replace only the existing cache task's action, retaining its user, logon
# trigger, restart policy and privileges. Roll back the action on failed health.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $projectRoot 'artifacts/imagery-service/runtime/ChalonsImageryCache.exe'
$logDirectory = Join-Path $projectRoot 'artifacts/imagery-service'
$serverScript = Join-Path $projectRoot 'scripts/serve-imagery.mjs'
$oldScript = Join-Path $projectRoot 'scripts/run-imagery-service.ps1'
$node = (Get-Command node.exe).Source
$task = Get-ScheduledTask -TaskName 'ChalonsImageryCache' -TaskPath '\'
if ($task.Actions.Count -ne 1 -or $task.Actions[0].Arguments -notlike ('*' + $oldScript + '*')) { throw 'The task action has changed; inspect it before proceeding.' }
if (!(Test-Path -LiteralPath $launcher)) { throw 'Build and check the launcher first.' }
$release = Join-Path $projectRoot ('artifacts/imagery-launcher-release/' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
New-Item -ItemType Directory -Path $release -Force | Out-Null
Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath | Set-Content -LiteralPath (Join-Path $release 'task-before.xml') -Encoding Unicode
$oldAction = $task.Actions[0]
$beforeWindows = @(Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Select-Object Id,MainWindowTitle)
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5174 -ErrorAction SilentlyContinue)
$oldNode = $null
if ($listeners.Count) {
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Unexpected port ownership.' }
    $oldNode = Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0].OwningProcess)"
    if ($oldNode.ExecutablePath -ine $node -or $oldNode.CommandLine -notlike ('*"' + $serverScript + '"*')) { throw 'Port 5174 belongs to another program.' }
    $oldNodeHandle = Get-Process -Id $oldNode.ProcessId
}
$newAction = New-ScheduledTaskAction -Execute $launcher -Argument ('"' + $projectRoot + '" "' + $node + '" "' + $logDirectory + '"') -WorkingDirectory $projectRoot
$changed = $false
try {
    # Stop only the known old task and its identified child, never all Node or
    # PowerShell processes. The old wrapper could leave Node detached.
    Stop-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
    if ($oldNode) {
        if (!$oldNodeHandle.WaitForExit(1500)) {
            $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($oldNode.ProcessId)"
            if ($current.CreationDate -ne $oldNode.CreationDate -or $current.CommandLine -ne $oldNode.CommandLine) { throw 'The server process changed.' }
            Stop-Process -InputObject $oldNodeHandle
            if (!$oldNodeHandle.WaitForExit(5000)) { throw 'Old imagery server did not exit.' }
        }
    }
    Set-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -Action $newAction | Out-Null
    $changed = $true
    Start-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
    $response = $null
    for ($i = 0; $i -lt 30 -and !$response; $i++) {
        try { $response = Invoke-WebRequest -UseBasicParsing -Method Head -Uri 'http://127.0.0.1:5174/data/imagery/ign/18/134265/90098.jpg' -TimeoutSec 1 }
        catch { Start-Sleep -Milliseconds 250 }
    }
    if (!$response -or $response.StatusCode -ne 200) { throw 'New launcher failed the HTTP check.' }
    $listener = Get-NetTCPConnection -State Listen -LocalPort 5174
    $child = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($child.ParentProcessId)"
    if ($parent.ExecutablePath -ine $launcher) { throw 'Unexpected server parent after restart.' }
    $installed = Get-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
    if ([string]$installed.State -ne 'Running') { throw 'The task does not track the launcher.' }
    $supervisor = Get-Content (Join-Path $logDirectory 'supervisor.jsonl') -Tail 8 | ForEach-Object { $_ | ConvertFrom-Json }
    if (!($supervisor | Where-Object { $_.event -eq 'process_started' -and $_.childPid -eq $child.ProcessId -and $_.noConsole })) { throw 'New launch was not logged.' }
    $result = [pscustomobject]@{installed=$true;task=$installed.TaskName;state=[string]$installed.State;launcherPid=$parent.ProcessId;nodePid=$child.ProcessId;http=$response.StatusCode;previousTerminalWindows=$beforeWindows;currentTerminalWindows=@(Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Select-Object Id,MainWindowTitle);backup=$release;time=[DateTime]::UtcNow.ToString('o')}
    $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $release 'result.json') -Encoding UTF8
    $result | ConvertTo-Json -Depth 4 -Compress
} catch {
    $failure = $_
    if ($changed) {
        Stop-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
        Set-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -Action $oldAction | Out-Null
    }
    Start-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
    throw $failure
}
