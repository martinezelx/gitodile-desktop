$all = Get-CimInstance Win32_Process | ForEach-Object {
  [pscustomobject]@{ Pid = [int]$_.ProcessId; Parent = [int]$_.ParentProcessId; Name = [string]$_.Name }
}
$tree = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($p in $all) { if ($p.Name -eq 'gitodile.exe') { [void]$tree.Add($p.Pid) } }
for ($i = 0; $i -lt 8; $i++) {
  foreach ($p in $all) { if ($tree.Contains($p.Parent)) { [void]$tree.Add($p.Pid) } }
}
$out = @()
foreach ($p in $all) {
  if (-not $tree.Contains($p.Pid)) { continue }
  $proc = Get-Process -Id $p.Pid -ErrorAction SilentlyContinue
  if ($proc) { $out += [pscustomobject]@{ pid = $p.Pid; name = $p.Name; ws = $proc.WorkingSet64; pv = $proc.PrivateMemorySize64 } }
}
if ($out.Count -eq 0) { "[]" } else { ConvertTo-Json -InputObject @($out) -Compress }
