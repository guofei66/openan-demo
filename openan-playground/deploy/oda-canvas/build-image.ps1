#!/usr/bin/env pwsh
# 组装构建上下文并构建 OpenAN MockAgent 镜像（用于 ODA-Canvas 部署）
# 用法: pwsh build-image.ps1 [-Image openan/mockagent] [-Tag 1.0.0]
param(
    [string]$Image = "openan-mockagent",
    [string]$Tag = "1.0.0",
    [string]$SdkSrc = "D:\OpenAN-Github\a2a-t-sdk-python\src\a2a_t"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # openan-debug 仓库根
$ctx = Join-Path $env:TEMP ("mockagent-oda-ctx-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $ctx | Out-Null
Write-Host "构建上下文: $ctx"

Copy-Item (Join-Path $repo "server\openan_debug") (Join-Path $ctx "openan_debug") -Recurse
Copy-Item (Join-Path $repo "config") (Join-Path $ctx "config") -Recurse
Copy-Item (Join-Path $SdkSrc) (Join-Path $ctx "a2a_t") -Recurse
# requirements.txt 补充 a2a_t SDK 自身依赖
$req = Get-Content (Join-Path $repo "server\requirements.txt") -Raw
$extra = @"
# --- a2a_t SDK 运行依赖 ---
pydantic>=2.7,<3
"@
# SDK 若带 requirements/pyproject 则一并带上其依赖清单（尽力而为）
$sdkReq = Join-Path (Split-Path -Parent $SdkSrc) "..\requirements.txt"
if (Test-Path $sdkReq) { $extra += "`n" + (Get-Content $sdkReq -Raw) }
Set-Content -Path (Join-Path $ctx "requirements.txt") -Value ($req + "`n" + $extra) -Encoding UTF8

Copy-Item (Join-Path $PSScriptRoot "Dockerfile") (Join-Path $ctx "Dockerfile")
Push-Location $ctx
try {
    docker build -t "${Image}:${Tag}" -t "${Image}:latest" .
    if ($LASTEXITCODE -ne 0) { throw "docker build 失败" }
} finally {
    Pop-Location
    Remove-Item $ctx -Recurse -Force
}
Write-Host "镜像构建完成: ${Image}:${Tag}"
Write-Host "推送: docker tag ${Image}:${Tag} <registry>/<repo>:${Tag}; docker push <registry>/<repo>:${Tag}"
