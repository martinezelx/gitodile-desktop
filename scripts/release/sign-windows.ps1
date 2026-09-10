param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [Parameter(Mandatory = $true)][string]$IdentityOutput
)

$ErrorActionPreference = "Stop"
if (-not $env:GITODILE_WINDOWS_CERTIFICATE_BASE64 -or -not $env:GITODILE_WINDOWS_CERTIFICATE_PASSWORD) {
  throw "Windows signing credentials are unavailable"
}

$temporaryPfx = Join-Path ([System.IO.Path]::GetTempPath()) ("gitodile-signing-" + [guid]::NewGuid().ToString("N") + ".pfx")
try {
  [System.IO.File]::WriteAllBytes($temporaryPfx, [Convert]::FromBase64String($env:GITODILE_WINDOWS_CERTIFICATE_BASE64))
  $destination = [System.IO.Path]::GetFullPath($OutputFile)
  New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($destination)) | Out-Null
  Copy-Item -LiteralPath $InputFile -Destination $destination

  $signtool = (Get-Command signtool.exe -ErrorAction Stop).Source
  & $signtool sign /fd SHA256 /td SHA256 /tr https://timestamp.digicert.com /f $temporaryPfx /p $env:GITODILE_WINDOWS_CERTIFICATE_PASSWORD $destination
  if ($LASTEXITCODE -ne 0) { throw "Authenticode signing failed" }
  & $signtool verify /pa /all $destination
  if ($LASTEXITCODE -ne 0) { throw "Authenticode verification failed" }

  $signature = Get-AuthenticodeSignature -LiteralPath $destination
  if ($signature.Status -ne "Valid" -or -not $signature.SignerCertificate) {
    throw "Authenticode trust verification did not return a valid signer"
  }
  $identity = [ordered]@{
    result = "passed"
    subject = $signature.SignerCertificate.Subject
    sha256Thumbprint = $signature.SignerCertificate.GetCertHashString("SHA256").ToLowerInvariant()
  }
  $identity | ConvertTo-Json | Set-Content -LiteralPath $IdentityOutput -Encoding utf8NoBOM
} finally {
  if (Test-Path -LiteralPath $temporaryPfx) {
    Remove-Item -LiteralPath $temporaryPfx -Force
  }
}
