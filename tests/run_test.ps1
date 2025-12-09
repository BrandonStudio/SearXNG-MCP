. ./tests/test.ps1

$stdioTests = @(
    [Test]::new("Inspector initialized, MCP server runs on stdio."),
    [Test]::new("MCP server returns valid JSON."),
    [Test]::new("MCP server lists tools correctly."),
    [Test]::new("'get_engines' tool works."),
    [Test]::new("'search' tool works.")
)

$httpTests = @(
    [Test]::new("Inspector initialized, MCP server runs on http."),
    [Test]::new("MCP server returns valid JSON."),
    [Test]::new("MCP server lists tools correctly."),
    [Test]::new("'get_engines' tool works."),
    [Test]::new("'search' tool works.")
)

$env:TRANSPORT_MODE = "stdio"
$stdioResult = RunTest -Name "stdio" -Tests $stdioTests -Command "pnpm run start"

$env:TRANSPORT_MODE = "http"
pnpm run start &
Start-Sleep -Seconds 15
$httpResult = RunTest -Name "http" -Tests $httpTests -Command "--transport http http://localhost:3000/mcp"

if ($stdioResult -eq 0 -and $httpResult -eq 0) {
    Write-Host "`n`e[32mAll tests passed.`e[0m"
    exit 0
} else {
    Write-Host "`n`e[31mSome tests failed.`e[0m"
    exit 1
}
