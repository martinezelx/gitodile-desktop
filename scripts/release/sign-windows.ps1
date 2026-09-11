param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [Parameter(Mandatory = $true)][string]$IdentityOutput
)

$ErrorActionPreference = "Stop"
if (
  -not $env:GITODILE_WINDOWS_CERTIFICATE_BASE64 -or
  -not $env:GITODILE_WINDOWS_CERTIFICATE_PASSWORD -or
  -not $env:GITODILE_WINDOWS_CERTIFICATE_SHA256
) {
  throw "Windows signing credentials are unavailable"
}

$expectedThumbprint = $env:GITODILE_WINDOWS_CERTIFICATE_SHA256.ToLowerInvariant()
if ($expectedThumbprint -notmatch "^[0-9a-f]{64}$") {
  throw "The reviewed Windows certificate SHA-256 identity is invalid"
}

$temporaryPfx = Join-Path ([System.IO.Path]::GetTempPath()) ("gitodile-signing-" + [guid]::NewGuid().ToString("N") + ".pfx")
try {
  [System.IO.File]::WriteAllBytes($temporaryPfx, [Convert]::FromBase64String($env:GITODILE_WINDOWS_CERTIFICATE_BASE64))
  $certificates = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
  $certificates.Import(
    $temporaryPfx,
    $env:GITODILE_WINDOWS_CERTIFICATE_PASSWORD,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
  )
  $codeSigningOid = "1.3.6.1.5.5.7.3.3"
  $signers = @($certificates | Where-Object {
    if (-not $_.HasPrivateKey) { return $false }
    $eku = $_.Extensions | Where-Object {
      $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]
    }
    return $eku.EnhancedKeyUsages.Value -contains $codeSigningOid
  })
  if ($signers.Count -ne 1) {
    throw "The PFX must contain exactly one private Code Signing identity"
  }
  $configuredCertificate = $signers[0]
  $configuredThumbprint = $configuredCertificate.GetCertHashString("SHA256").ToLowerInvariant()
  if ($configuredThumbprint -ne $expectedThumbprint) {
    throw "The PFX does not match the reviewed Windows certificate identity"
  }
  $keyUsage = $configuredCertificate.Extensions | Where-Object {
    $_ -is [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]
  }
  if (-not $keyUsage -or -not $keyUsage.KeyUsages.HasFlag([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature)) {
    throw "The Authenticode certificate does not permit digital signatures"
  }
  if ($configuredCertificate.Subject -eq $configuredCertificate.Issuer) {
    throw "A self-signed certificate is not accepted for public Windows packages"
  }
  $destination = [System.IO.Path]::GetFullPath($OutputFile)
  New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($destination)) | Out-Null
  Copy-Item -LiteralPath $InputFile -Destination $destination

  $signtool = (Get-Command signtool.exe -ErrorAction Stop).Source
  & $signtool sign /fd SHA256 /td SHA256 /tr https://timestamp.digicert.com /f $temporaryPfx /p $env:GITODILE_WINDOWS_CERTIFICATE_PASSWORD $destination
  if ($LASTEXITCODE -ne 0) { throw "Authenticode signing failed" }
  & $signtool verify /pa /all /v /tw $destination
  if ($LASTEXITCODE -ne 0) { throw "Authenticode verification failed" }

  $signature = Get-AuthenticodeSignature -LiteralPath $destination
  if ($signature.Status -ne "Valid" -or -not $signature.SignerCertificate) {
    throw "Authenticode trust verification did not return a valid signer"
  }
  $certificate = $signature.SignerCertificate
  if (-not $signature.TimeStamperCertificate) {
    throw "The Authenticode signature does not contain a trusted timestamp"
  }
  if ($certificate.GetCertHashString("SHA256").ToLowerInvariant() -ne $expectedThumbprint) {
    throw "The signed package does not use the reviewed Windows certificate identity"
  }
  if ($certificate.Subject -eq $certificate.Issuer) {
    throw "A self-signed certificate is not accepted for public Windows packages"
  }
  $enhancedKeyUsage = $certificate.Extensions | Where-Object {
    $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]
  }
  if (-not ($enhancedKeyUsage.EnhancedKeyUsages.Value -contains $codeSigningOid)) {
    throw "The Authenticode signer does not include the Code Signing EKU"
  }
  $now = [DateTimeOffset]::UtcNow
  if ($certificate.NotBefore.ToUniversalTime() -gt $now.UtcDateTime -or $certificate.NotAfter.ToUniversalTime() -le $now.UtcDateTime) {
    throw "The Authenticode certificate is not currently valid"
  }
  $chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  try {
    $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
    $chain.ChainPolicy.RevocationFlag = [System.Security.Cryptography.X509Certificates.X509RevocationFlag]::EntireChain
    $chain.ChainPolicy.VerificationFlags = [System.Security.Cryptography.X509Certificates.X509VerificationFlags]::NoFlag
    $chain.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(30)
    if (-not $chain.Build($certificate) -or $chain.ChainStatus.Count -ne 0 -or $chain.ChainElements.Count -lt 2) {
      throw "The Authenticode certificate chain is not trusted or revocation could not be checked"
    }
  } finally {
    $chain.Dispose()
  }
  $identity = [ordered]@{
    result = "passed"
    subject = $certificate.Subject
    issuer = $certificate.Issuer
    sha256Thumbprint = $certificate.GetCertHashString("SHA256").ToLowerInvariant()
    codeSigningEku = "passed"
    certificateChain = "passed"
    selfSigned = $false
    timestampSubject = $signature.TimeStamperCertificate.Subject
  }
  $identity | ConvertTo-Json | Set-Content -LiteralPath $IdentityOutput -Encoding utf8NoBOM
} finally {
  if (Test-Path -LiteralPath $temporaryPfx) {
    Remove-Item -LiteralPath $temporaryPfx -Force
  }
}
