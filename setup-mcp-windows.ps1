# setup-mcp-windows.ps1
# One-shot installer for the Windows-MCP and BigQuery MCP servers in Claude Code.
# Run from PowerShell on the Windows PC where you use Claude Code.

$ErrorActionPreference = 'Stop'
$cc      = "$env:USERPROFILE\.claude.json"
$keyFile = "$env:USERPROFILE\bigquery-mcp-sa.json"

if (-not (Test-Path $cc)) {
  throw "Claude config not found at $cc. Make sure Claude Code is installed and has been run at least once."
}

# 1) Node.js (needed for the BigQuery server's npx command)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Node.js LTS..." -ForegroundColor Cyan
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 2) uv (needed for the Windows-MCP server's uvx command)
if (-not (Get-Command uvx -ErrorAction SilentlyContinue)) {
  Write-Host "Installing uv..." -ForegroundColor Cyan
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  $env:Path += ";$env:USERPROFILE\.local\bin"
}

# 3) Move the BigQuery service account key out of Downloads into a stable spot
if (-not (Test-Path $keyFile)) {
  $found = Get-ChildItem "$env:USERPROFILE\Downloads\*premiercustomstorage*.json" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) {
    Move-Item $found.FullName $keyFile -Force
    Write-Host "Moved BigQuery key to $keyFile" -ForegroundColor Cyan
  } else {
    Write-Warning "BigQuery key not found in Downloads. Place the service-account .json at $keyFile manually before using BigQuery."
  }
}

# 4) Back up the current .claude.json
Copy-Item $cc "$cc.bak" -Force
Write-Host "Backed up $cc to $cc.bak" -ForegroundColor Cyan

# 5) Merge mcpServers into .claude.json
$j   = Get-Content $cc -Raw | ConvertFrom-Json
$mcp = [PSCustomObject]@{}
Add-Member -InputObject $mcp -NotePropertyName 'windows-mcp' -NotePropertyValue ([PSCustomObject]@{
  command = 'uvx'
  args    = ,'windows-mcp'
})
Add-Member -InputObject $mcp -NotePropertyName 'bigquery' -NotePropertyValue ([PSCustomObject]@{
  command = 'npx'
  args    = @('-y','@ergut/mcp-bigquery-server','--project-id','premiercustomstorage','--key-file',$keyFile)
})
$j | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue $mcp -Force

# 6) Save without BOM (UTF-8)
[System.IO.File]::WriteAllText($cc, ($j | ConvertTo-Json -Depth 100), [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Done. Quit and reopen Claude Code, then approve both servers on first prompt." -ForegroundColor Green
