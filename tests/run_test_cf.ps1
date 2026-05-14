. ./tests/test.ps1

$tests = @(
    [Test]::new("Inspector initialized, MCP server connected."),
    [Test]::new("MCP server returns valid JSON."),
    [Test]::new("MCP server lists tools correctly."),
    [Test]::new("'get_engines' tool works."),
    [Test]::new("'search' tool works.")
)

$url = "$env:CF_WORKER_URL/mcp"
$commandArgs = "$url --transport http".Split(" ")
if ($env:CF_ACCESS_CLIENT_ID -and $env:CF_ACCESS_CLIENT_SECRET) {
    $commandArgs += "--header"
    $commandArgs += "CF-Access-Client-Id: $env:CF_ACCESS_CLIENT_ID"
    $commandArgs += "--header"
    $commandArgs += "CF-Access-Client-Secret: $env:CF_ACCESS_CLIENT_SECRET"
}
$code = RunTest -Name "Cloudflare Worker" -Tests $tests -Command $commandArgs

exit $code
