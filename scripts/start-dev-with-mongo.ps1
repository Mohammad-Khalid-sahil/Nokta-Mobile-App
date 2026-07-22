$ErrorActionPreference = 'Stop'

$backendRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$dataPath = Join-Path $backendRoot '.mongo-data'
$logDir = Join-Path $backendRoot '.mongo-log'
$logPath = Join-Path $logDir 'mongod.log'

function Test-PortOpen {
  param(
    [string]$HostName,
    [int]$Port
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(500)) {
      return $false
    }

    $client.EndConnect($connect)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-MongodPath {
  if ($env:MONGOD_PATH) {
    return $env:MONGOD_PATH
  }

  $candidates = @(
    'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe',
    'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe',
    'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe',
    'mongod.exe'
  )

  foreach ($candidate in $candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw 'MongoDB was not found. Install MongoDB Community Server or set MONGOD_PATH to mongod.exe.'
}

if (-not (Test-PortOpen -HostName '127.0.0.1' -Port 27017)) {
  $mongod = Get-MongodPath
  New-Item -ItemType Directory -Force -Path $dataPath, $logDir | Out-Null

  Write-Host 'Starting local MongoDB on 127.0.0.1:27017...'
  Start-Process `
    -FilePath $mongod `
    -ArgumentList "--dbpath `"$dataPath`" --logpath `"$logPath`" --bind_ip 127.0.0.1 --port 27017" `
    -WindowStyle Hidden | Out-Null

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-PortOpen -HostName '127.0.0.1' -Port 27017) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "MongoDB did not start on 127.0.0.1:27017. Check the log at $logPath"
  }
}

Write-Host 'MongoDB is ready on 127.0.0.1:27017.'
Set-Location $backendRoot
& npm.cmd run dev
