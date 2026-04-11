param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [Parameter(Mandatory = $false)]
  [string]$AdminEmail = 'vanessapringle@westlandhigh.school.nz'
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')

$body = @{ recipes = $true; add_recipes = $true; inventory = $true; shopping = $true; booking = $true; admin = $false } | ConvertTo-Json -Compress

$tests = @(
  @{ Name = 'GET /api/recipes'; Method = 'GET'; Url = "$base/api/recipes"; Headers = @{}; Body = $null; Expected = 200 },
  @{ Name = 'GET /api/permissions/all'; Method = 'GET'; Url = "$base/api/permissions/all"; Headers = @{}; Body = $null; Expected = 200 },
  @{ Name = 'PUT /api/permissions/teacher no header'; Method = 'PUT'; Url = "$base/api/permissions/teacher"; Headers = @{}; Body = $body; Expected = 401 },
  @{ Name = 'PUT /api/permissions/teacher non-admin'; Method = 'PUT'; Url = "$base/api/permissions/teacher"; Headers = @{ 'x-user-email' = 'notadmin@example.com' }; Body = $body; Expected = 403 },
  @{ Name = 'PUT /api/permissions/teacher admin'; Method = 'PUT'; Url = "$base/api/permissions/teacher"; Headers = @{ 'x-user-email' = $AdminEmail }; Body = $body; Expected = 200 }
)

$results = @()

foreach ($t in $tests) {
  $status = $null
  try {
    if ($null -ne $t.Body) {
      $resp = Invoke-WebRequest -Method $t.Method -Uri $t.Url -Headers $t.Headers -ContentType 'application/json' -Body $t.Body -UseBasicParsing
    } else {
      $resp = Invoke-WebRequest -Method $t.Method -Uri $t.Url -Headers $t.Headers -UseBasicParsing
    }
    $status = [int]$resp.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode.value__
    } else {
      $status = -1
    }
  }

  $ok = ($status -eq $t.Expected)
  $results += [pscustomobject]@{
    Check = $t.Name
    Expected = $t.Expected
    Actual = $status
    Pass = $ok
  }
}

$results | Format-Table -AutoSize

if ($results.Pass -contains $false) {
  Write-Host "\nSmoke test failed." -ForegroundColor Red
  exit 1
}

Write-Host "\nSmoke test passed." -ForegroundColor Green
exit 0
