$ErrorActionPreference = 'Stop'

$repoBackend = Resolve-Path (Join-Path $PSScriptRoot '..')
$dataPath = Join-Path $repoBackend '.mongo-data'
$logDir = Join-Path $repoBackend '.mongo-log'
$logPath = Join-Path $logDir 'mongod.log'

$mongod = $env:MONGOD_PATH
if (-not $mongod) {
  $candidates = @(
    'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe',
    'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe',
    'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe',
    'mongod.exe'
  )

  foreach ($candidate in $candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      $mongod = $command.Source
      break
    }
  }
}

if (-not $mongod) {
  throw 'MongoDB was not found. Install MongoDB Community Server or set MONGOD_PATH to mongod.exe.'
}

New-Item -ItemType Directory -Force -Path $dataPath, $logDir | Out-Null

Write-Host "Starting MongoDB on 127.0.0.1:27017"
Write-Host "Data: $dataPath"
Write-Host "Log:  $logPath"
Write-Host 'Keep this terminal open while running the backend.'

& $mongod --dbpath "$dataPath" --logpath "$logPath" --bind_ip 127.0.0.1 --port 27017
