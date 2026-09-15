param(
    [string]$LogDirectory,
    [string]$NodePath
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (!$LogDirectory) { $LogDirectory = Join-Path $taskRoot 'artifacts/imagery-service' }
$taskLog = Join-Path $LogDirectory 'supervisor.jsonl'
$taskRunId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + $PID
$taskExitCode = 1
function Write-TaskLog([string]$level, [string]$event, [hashtable]$details) {
    $taskRecord = [ordered]@{time=[DateTime]::UtcNow.ToString('o'); level=$level; event=$event; pid=$PID; run=$taskRunId}
    foreach ($taskKey in $details.Keys) { $taskRecord[$taskKey] = $details[$taskKey] }
    $taskLine = ($taskRecord | ConvertTo-Json -Compress -Depth 5) + [Environment]::NewLine
    [IO.File]::AppendAllText($taskLog, $taskLine, (New-Object Text.UTF8Encoding($false)))
}
try {
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    Write-TaskLog 'info' 'supervisor_starting' @{}
    if (!$NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
    $taskScript = Join-Path $PSScriptRoot 'serve-imagery.mjs'
    $taskStdout = Join-Path $LogDirectory ($taskRunId + '.stdout.log')
    $taskStderr = Join-Path $LogDirectory ($taskRunId + '.stderr.log')
    $env:IGN_LOG_DIR = $LogDirectory
    Write-TaskLog 'info' 'process_starting' @{executable=$NodePath; stdout=$taskStdout; stderr=$taskStderr}
    # Direct redirection avoids PowerShell treating a stderr line as a terminating
    # NativeCommandError. Preserve each run's output, including startup failures.
    $taskChild = Start-Process -FilePath $NodePath -ArgumentList ('"' + $taskScript + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput $taskStdout -RedirectStandardError $taskStderr -PassThru
    Write-TaskLog 'info' 'process_started' @{childPid=$taskChild.Id}
    $taskChild.WaitForExit()
    $taskChild.Refresh()
    $taskExitCode = $taskChild.ExitCode
    if ($null -eq $taskExitCode) { $taskExitCode = 1 }
    $taskLevel = if ($taskExitCode -eq 0) { 'info' } else { 'error' }
    Write-TaskLog $taskLevel 'process_exited' @{childPid=$taskChild.Id; exitCode=$taskExitCode; stderr=$taskStderr}
} catch {
    try { Write-TaskLog 'error' 'supervisor_failed' @{error=$_.Exception.Message; stack=$_.ScriptStackTrace} }
    catch { [Console]::Error.WriteLine([DateTime]::UtcNow.ToString('o') + ' Logging failed: ' + $_.Exception.Message) }
    $taskExitCode = 1
}
exit $taskExitCode
