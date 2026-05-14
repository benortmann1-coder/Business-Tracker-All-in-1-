# setup-mcp-windows.ps1
# One-shot installer for the Windows-MCP and BigQuery MCP servers in Claude Code.
# Run from PowerShell on the Windows PC where you use Claude Code.
#
# BigQuery: uses LucasHild/mcp-server-bigquery (Python via uvx) — supports
# read AND write (DDL/DML), gated only by the service account's IAM permissions.

$ErrorActionPreference = 'Stop'
$cc      = "$env:USERPROFILE\.claude.json"
$keyFile = "$env:USERPROFILE\bigquery-mcp-sa.json"

if (-not (Test-Path $cc)) {
  throw "Claude config not found at $cc. Make sure Claude Code is installed and has been run at least once."
}

# 1) uv (needed for both servers — uvx runs mcp-server-bigquery and windows-mcp)
if (-not (Get-Command uvx -ErrorAction SilentlyContinue)) {
  Write-Host "Installing uv..." -ForegroundColor Cyan
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  $env:Path += ";$env:USERPROFILE\.local\bin"
}

# 2) Move the BigQuery service account key out of Downloads into a stable spot
if (-not (Test-Path $keyFile)) {
  $found = Get-ChildItem "$env:USERPROFILE\Downloads\*premiercustomstorage*.json" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) {
    Move-Item $found.FullName $keyFile -Force
    Write-Host "Moved BigQuery key to $keyFile" -ForegroundColor Cyan
  } else {
    Write-Warning "BigQuery key not found in Downloads. Place the service-account .json at $keyFile manually before using BigQuery."
  }
}

# 3) Back up the current .claude.json
Copy-Item $cc "$cc.bak" -Force
Write-Host "Backed up $cc to $cc.bak" -ForegroundColor Cyan

# 4) Merge mcpServers into .claude.json
$j   = Get-Content $cc -Raw | ConvertFrom-Json
$mcp = [PSCustomObject]@{}
Add-Member -InputObject $mcp -NotePropertyName 'windows-mcp' -NotePropertyValue ([PSCustomObject]@{
  command = 'uvx'
  args    = ,'windows-mcp'
})
Add-Member -InputObject $mcp -NotePropertyName 'bigquery' -NotePropertyValue ([PSCustomObject]@{
  command = 'uvx'
  args    = @('mcp-server-bigquery','--project','premiercustomstorage','--location','US','--key-file',$keyFile)
})
$j | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue $mcp -Force

# 5) Save without BOM (UTF-8)
[System.IO.File]::WriteAllText($cc, ($j | ConvertTo-Json -Depth 100), [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Done. Quit and reopen Claude Code, then approve both servers on first prompt." -ForegroundColor Green
