# Draws FICTIONAL pharmacy receipts (invented shops, invented products, USD) and writes
# demo/receipts/expected.json with the exact values printed on them (ground truth for tests).
# Usage: powershell -NoProfile -File demo\make-demo-receipts.ps1
Add-Type -AssemblyName System.Drawing
$ci = [System.Globalization.CultureInfo]::InvariantCulture
$out = Join-Path $PSScriptRoot 'receipts'
New-Item -ItemType Directory -Force $out | Out-Null

function M([decimal]$v) { $v.ToString('0.00', $ci) }
function Row([string]$left, [string]$right, [int]$width) {
  $pad = [Math]::Max(1, $width - $left.Length - $right.Length)
  return $left + (' ' * $pad) + $right
}

# items: name, qty, unit price. discounts: label, amount (positive). tax: rate or 0.
$receipts = @(
  @{ file='01-simple.png'; shop='CORNER CARE PHARMACY'; addr='48 Elm Avenue, Fairview'; date='09/14/2026'; iso='2026-09-14'; time='10:12'
     font='Consolas'; cur='USD'; rate=0; taxLabel=''; note='Have a healthy day!'
     items=@( @('Pain relief tabs 24ct',1,6.49), @('Herbal tea 20 bags',1,3.25) ); discounts=@() },

  @{ file='02-many-items.png'; shop='MAPLE HEALTH MART'; addr='900 Market Road, Brookdale'; date='Sep 21, 2026'; iso='2026-09-21'; time='16:48'
     font='Courier New'; cur='USD'; rate=0; taxLabel=''; note='Thank you - come again!'
     items=@( @('Pain relief tabs 24ct',1,6.99), @('Cold relief syrup 8oz',1,9.49), @('Digital thermometer',1,12.99),
              @('Elastic bandage',1,4.75), @('Gauze pads 50ct',1,5.25), @('First aid tape',1,2.99),
              @('Antacid chews 60ct',1,8.49), @('Eye drops 0.5oz',1,10.25), @('Sunscreen SPF30',1,11.50),
              @('Lip balm',2,1.99), @('Tissues 3-pack',1,4.20), @('Weekly pill organizer',1,5.99) ); discounts=@() },

  @{ file='03-discount.png'; shop='SUNRISE DRUGSTORE'; addr='7 Harbor Lane, Westport'; date='2026-09-25'; iso='2026-09-25'; time='09:03'
     font='Lucida Console'; cur='USD'; rate=0; taxLabel=''; note='You saved today!'
     items=@( @('Allergy relief 30ct',1,14.99), @('Vitamin C 100ct',1,9.50), @('Hand sanitizer 8oz',2,3.75), @('Cough drops honey',1,2.89) )
     discounts=@( @('Member discount',3.50), @('Coupon SAVE5',5.00) ) },

  @{ file='04-tax.png'; shop='RIVERSIDE PHARMACY'; addr='215 Water Street, Lakeview'; date='09/28/2026'; iso='2026-09-28'; time='13:27'
     font='Consolas'; cur='USD'; rate=0.0825; taxLabel='SALES TAX 8.25%'; note='Prices include no bag fee.'
     items=@( @('Multivitamin 90ct',1,18.40), @('Fiber supplement',1,13.95), @('Bandage variety pack',1,5.60), @('Cotton swabs 300ct',1,3.15) )
     discounts=@() },

  @{ file='05-phone-photo.png'; shop='HILLCREST FAMILY PHARMACY'; addr='33 Orchard Way, Greenfield'; date='10/01/26'; iso='2026-10-01'; time='18:41'
     font='Courier New'; cur='USD'; rate=0.06; taxLabel='TAX 6%'; note='Thank you!'; photo=$true
     items=@( @('Pain relief tabs 24ct',1,7.29), @('Digestive enzymes 30ct',1,16.80), @('Compression socks',1,19.95) )
     discounts=@() },

  @{ file='06-non-drug.png'; shop='PINEWOOD PHARMACY & GIFTS'; addr='5 Cedar Court, Oakmont'; date='Oct 2, 2026'; iso='2026-10-02'; time='11:55'
     font='Lucida Console'; cur='USD'; rate=0; taxLabel=''; note='Gift wrap is free.'
     items=@( @('Pain relief tabs 24ct',1,6.99), @('Birthday card',1,4.50), @('Reusable water bottle',1,14.00), @('Chocolate box',1,8.25) )
     discounts=@() }
)

$expected = @()
foreach ($r in $receipts) {
  $width = 34
  $sub = [decimal]0
  $itemExp = @()
  $rows = @()
  foreach ($it in $r.items) {
    $name = [string]$it[0]; $qty = [int]$it[1]; $unit = [decimal]$it[2]
    $line = $qty * $unit; $sub += $line
    $label = if ($qty -gt 1) { "$name $qty x $(M $unit)" } else { $name }
    $rows += (Row $label (M $line) $width)
    $itemExp += [ordered]@{ name=$name; quantity=$(if ($qty -gt 1) { $qty } else { $null }); lineTotal=[double]$line }
  }
  $disc = [decimal]0
  foreach ($d in $r.discounts) { $disc += [decimal]$d[1] }
  $taxable = $sub - $disc
  $tax = [Math]::Round($taxable * [decimal]$r.rate, 2, [MidpointRounding]::AwayFromZero)
  $total = $taxable + $tax

  $lines = @()
  $lines += @{t=$r.shop; s=16; b=$true; c=$true}
  $lines += @{t=$r.addr; s=10; c=$true}
  $lines += @{t='Tel 555-0100 (fictional)'; s=10; c=$true}
  $lines += @{t=''; s=6}
  $lines += @{t="Date: $($r.date)  $($r.time)"; s=11}
  $lines += @{t='-' * $width; s=11}
  foreach ($row in $rows) { $lines += @{t=$row; s=11} }
  $lines += @{t='-' * $width; s=11}
  $lines += @{t=(Row 'SUBTOTAL' (M $sub) $width); s=11}
  foreach ($d in $r.discounts) { $lines += @{t=(Row ([string]$d[0]) ('-' + (M ([decimal]$d[1]))) $width); s=11} }
  if ($r.rate -gt 0) { $lines += @{t=(Row $r.taxLabel (M $tax) $width); s=11} }
  $totalText = if ($r.cur -eq 'USD' -and $r.file -ne '03-discount.png') { 'TOTAL  USD ' + (M $total) } else { 'TOTAL  $' + (M $total) }
  $lines += @{t=(Row 'TOTAL' ($totalText.Substring(6)) $width); s=13; b=$true}
  $lines += @{t=''; s=6}
  $lines += @{t='PAID  CARD ****0000'; s=11}
  $lines += @{t=$r.note; s=10; c=$true}

  $w = 420
  $h = 70
  foreach ($l in $lines) { $h += [int]($l.s * 2.0) }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(250,248,240))
  $g.TextRenderingHint = 'AntiAlias'
  $y = 28
  foreach ($l in $lines) {
    $style = if ($l.b) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $f = New-Object System.Drawing.Font($r.font, [single]$l.s, $style)
    $size = $g.MeasureString($l.t, $f)
    $x = if ($l.c) { ($w - $size.Width) / 2 } else { 20 }
    $g.DrawString($l.t, $f, [System.Drawing.Brushes]::Black, [single]$x, [single]$y)
    $y += [int]($l.s * 2.0)
    $f.Dispose()
  }
  $g.Dispose()

  if ($r.photo) {
    # Make it look like a quick phone photo: soft focus, tilt, uneven light, dark table, grain.
    $sw = [int]($w * 0.55); $sh = [int]($h * 0.55)
    $small = New-Object System.Drawing.Bitmap $sw, $sh
    $gs = [System.Drawing.Graphics]::FromImage($small)
    $gs.InterpolationMode = 'HighQualityBilinear'; $gs.DrawImage($bmp, 0, 0, $sw, $sh); $gs.Dispose()
    $cw = $w + 220; $ch = $h + 220
    $canvas = New-Object System.Drawing.Bitmap $cw, $ch
    $gc = [System.Drawing.Graphics]::FromImage($canvas)
    $gc.Clear([System.Drawing.Color]::FromArgb(74,61,48))
    $gc.InterpolationMode = 'HighQualityBicubic'
    $gc.TranslateTransform($cw / 2, $ch / 2); $gc.RotateTransform(-5); $gc.TranslateTransform(-$w / 2, -$h / 2)
    $gc.DrawImage($small, 0, 0, $w, $h)
    $gc.ResetTransform()
    $rect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(0,0,0,0)), ([System.Drawing.Color]::FromArgb(120,0,0,0)), 20.0
    $gc.FillRectangle($grad, $rect)
    $rnd = New-Object System.Random 7
    for ($i = 0; $i -lt 5000; $i++) {
      $c = $rnd.Next(0, 90)
      $br = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, $c, $c, $c))
      $gc.FillRectangle($br, $rnd.Next(0, $cw), $rnd.Next(0, $ch), 2, 2); $br.Dispose()
    }
    $gc.Dispose(); $small.Dispose(); $bmp.Dispose()
    $bmp = $canvas
  }
  $bmp.Save((Join-Path $out $r.file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()

  $expected += [ordered]@{
    file = $r.file; merchant = $r.shop; date = $r.iso; currency = 'USD'
    items = $itemExp
    subtotal = [double]$sub
    discount = $(if ($disc -gt 0) { [double]$disc } else { $null })
    tax = $(if ($r.rate -gt 0) { [double]$tax } else { $null })
    total = [double]$total
  }
  "{0}  subtotal {1}  discount {2}  tax {3}  total {4}" -f $r.file, (M $sub), (M $disc), (M $tax), (M $total)
}
ConvertTo-Json -InputObject $expected -Depth 6 | Set-Content -Encoding utf8 (Join-Path $out 'expected.json')

# The web app serves the same images as built-in samples.
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot '..\web\public\demo-receipts') | Out-Null
Copy-Item (Join-Path $out '*.png') (Join-Path $PSScriptRoot '..\web\public\demo-receipts')
