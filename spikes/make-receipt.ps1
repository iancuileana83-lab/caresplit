# Draws a FICTIONAL pharmacy receipt as a PNG (invented shop, invented items).
# Usage: powershell -File spikes\make-receipt.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot 'receipts'
New-Item -ItemType Directory -Force $out | Out-Null

$lines = @(
  @{t='GREEN LEAF PHARMACY'; s=20; b=$true; c=$true},
  @{t='12 Maple Street, Springfield'; s=11; c=$true},
  @{t='Tel 555-0142   (fictional)'; s=11; c=$true},
  @{t=''; s=8},
  @{t='Date: 10/02/2026   Time: 14:37'; s=12},
  @{t='Receipt #A-004217   Cashier: 03'; s=12},
  @{t='------------------------------------'; s=12},
  @{t='Pain relief tablets 24ct        7.49'; s=12},
  @{t='Vitamin D3 60ct                12.99'; s=12},
  @{t='Adhesive bandages 30ct          4.25'; s=12},
  @{t='Cough lozenges  2 x 3.50        7.00'; s=12},
  @{t='Hand cream 75ml                 5.80'; s=12},
  @{t='------------------------------------'; s=12},
  @{t='SUBTOTAL                       37.53'; s=12},
  @{t='TAX 6.0%                        2.25'; s=12},
  @{t='TOTAL                    USD   39.78'; s=14; b=$true},
  @{t=''; s=8},
  @{t='PAID  VISA ****1111'; s=12},
  @{t='Thank you for shopping with us!'; s=11; c=$true}
)

$w = 420; $h = 80 + ($lines.Count * 28)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(250,248,240))
$g.TextRenderingHint = 'AntiAlias'
$brush = [System.Drawing.Brushes]::Black
$y = 30
foreach ($l in $lines) {
  $style = if ($l.b) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  $f = New-Object System.Drawing.Font('Consolas', [single]$l.s, $style)
  $size = $g.MeasureString($l.t, $f)
  $x = if ($l.c) { ($w - $size.Width) / 2 } else { 20 }
  $g.DrawString($l.t, $f, $brush, [single]$x, [single]$y)
  $y += [int]($l.s * 2.0)
  $f.Dispose()
}
$path = Join-Path $out 'receipt-01.png'
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"saved $path"
