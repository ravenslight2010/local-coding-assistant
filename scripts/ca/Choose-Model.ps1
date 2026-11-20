function Get-HardwareSummary {
  $ramGB = 0
  try {
    $bytes = [int64](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
    $ramGB = [math]::Round($bytes / 1GB, 1)
  } catch {}

  $gpu = "none"
  $vramGB = 0
  $hasNvidia = $false
  try {
    $gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue)
    foreach ($g in $gpus) {
      if ($g.Name) { $gpu = $g.Name }
      if ($g.Name -match "NVIDIA") { $hasNvidia = $true }
      if ($g.AdapterRAM -and $g.AdapterRAM -gt 0 -and $g.AdapterRAM -lt 200GB) {
        $gb = [math]::Round($g.AdapterRAM / 1GB, 1)
        if ($gb -gt $vramGB) { $vramGB = $gb }
      }
    }
  } catch {}
  try {
    if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
      $hasNvidia = $true
      $line = & nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1
      if ($line) {
        $mb = 0
        [void][int]::TryParse(($line -replace "\s",""), [ref]$mb)
        if ($mb -gt 0) { $vramGB = [math]::Round($mb / 1024, 1) }
      }
    }
  } catch {}

  [pscustomobject]@{ RamGB = $ramGB; Gpu = $gpu; VramGB = $vramGB; HasNvidia = $hasNvidia }
}

function Get-ModelOptions([object]$Hw) {
  $opts = @(
    [pscustomobject]@{ Id = "qwen2.5-coder:1.5b"; Label = "1.5B fastest, weakest"; MinRam = 4; Recommend = $false },
    [pscustomobject]@{ Id = "qwen2.5-coder:3b"; Label = "3B fast, small machines"; MinRam = 8; Recommend = $false },
    [pscustomobject]@{ Id = "qwen2.5-coder:7b"; Label = "7B solid small coder"; MinRam = 12; Recommend = $false },
    [pscustomobject]@{ Id = "qwen3.5:9b"; Label = "Qwen3.5 9B better tools"; MinRam = 16; Recommend = $false },
    [pscustomobject]@{ Id = "gpt-oss:20b"; Label = "gpt-oss 20B fast agent"; MinRam = 16; Recommend = $false },
    [pscustomobject]@{ Id = "qwen2.5-coder:14b"; Label = "14B stronger Qwen2.5"; MinRam = 24; Recommend = $false },
    [pscustomobject]@{ Id = "qwen3.8:27b"; Label = "Qwen3.8 27B best all-round"; MinRam = 24; Recommend = $false },
    [pscustomobject]@{ Id = "devstral-small-2:24b"; Label = "Devstral 24B multi-file agent"; MinRam = 24; Recommend = $false },
    [pscustomobject]@{ Id = "qwen3-coder:30b"; Label = "Qwen3-Coder 30B fast MoE"; MinRam = 24; Recommend = $false }
  )
  $rec = "qwen2.5-coder:3b"
  if ($Hw.HasNvidia -and $Hw.VramGB -ge 16 -and $Hw.RamGB -ge 24) { $rec = "qwen3.8:27b" }
  elseif ($Hw.HasNvidia -and $Hw.VramGB -ge 8 -and $Hw.RamGB -ge 16) { $rec = "qwen3.5:9b" }
  elseif ($Hw.RamGB -ge 32) { $rec = "qwen3.8:27b" }
  elseif ($Hw.RamGB -ge 16) { $rec = "qwen2.5-coder:7b" }
  elseif ($Hw.RamGB -lt 8) { $rec = "qwen2.5-coder:1.5b" }
  foreach ($o in $opts) { if ($o.Id -eq $rec) { $o.Recommend = $true } }
  return $opts
}

function Choose-Model {
  $hw = Get-HardwareSummary
  Write-Host ""
  Write-Host "Hardware" -ForegroundColor Cyan
  Write-Host ("  RAM:  {0} GB" -f $hw.RamGB)
  Write-Host ("  GPU:  {0}" -f $hw.Gpu)
  if ($hw.VramGB -gt 0) { Write-Host ("  VRAM: {0} GB" -f $hw.VramGB) }
  Write-Host ""
  Write-Host "Models" -ForegroundColor Cyan
  $opts = Get-ModelOptions $hw
  for ($i = 0; $i -lt $opts.Count; $i++) {
    $mark = ""
    if ($opts[$i].Recommend) { $mark = "  <-- recommended" }
    $fit = ""
    if ($hw.RamGB -lt $opts[$i].MinRam) { $fit = "  (tight on this machine)" }
    Write-Host ("  [{0}] {1}{2}{3}" -f ($i + 1), $opts[$i].Label, $mark, $fit)
  }
  Write-Host ""
  $default = 1
  for ($i = 0; $i -lt $opts.Count; $i++) { if ($opts[$i].Recommend) { $default = $i + 1 } }
  $answer = Read-Host "Pick a model [$default]"
  if (-not $answer) { $answer = "$default" }
  $n = 0
  if (-not [int]::TryParse($answer, [ref]$n) -or $n -lt 1 -or $n -gt $opts.Count) { $n = $default }
  return $opts[$n - 1].Id
}
