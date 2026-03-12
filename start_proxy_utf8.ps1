$ErrorActionPreference = 'Stop'

# Ensure UTF-8 output to avoid Unicode crash on startup banner.
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location $PSScriptRoot

# Load .env values into process environment.
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { return }
        $parts = $line.Split('=', 2)
        [System.Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process')
    }
}

# Client key expected by Claude -> proxy.
$env:ANTHROPIC_API_KEY = 'any-value'

python -X utf8 start_proxy.py
