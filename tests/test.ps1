function PrintError ([System.Management.Automation.ErrorRecord]$ErrorRecord) {
    [Console]::Error.WriteLine("ERROR: $($ErrorRecord.Exception.Message)")
    [Console]::Error.WriteLine($ErrorRecord.InvocationInfo.PositionMessage)
}

$InspectorPackage = "@modelcontextprotocol/inspector"

class Test {
    [string]$Name
    [bool]$Passed
    [bool]$Skipped = $true
    [System.Management.Automation.ErrorRecord]$Error

    Test([string]$name) {
        $this.Name = $name
    }

    [void] Pass() {
        $this.Passed = $true
        $this.Skipped = $false
        Write-Host "`e[32m[PASS]`e[0m $($this.Name)"
    }
    [int] Fail([System.Management.Automation.ErrorRecord]$err, [int]$code) {
        $this.Passed = $false
        $this.Skipped = $false
        $this.Error = $err
        Write-Host "`e[31m[FAIL]`e[0m $($this.Name)"
        PrintError($err)
        return $code
    }
    [void] Fail([string]$message) {
        $this.Passed = $false
        $this.Skipped = $false
        Write-Host "`e[31m[FAIL]`e[0m $($this.Name)"
        [System.Console]::Error.WriteLine("ERROR: $message")
    }
}

function RunTestCore {
    param (
        [Test[]]$Tests,
        [string[]]$CommandArgs
    )
    $tmpFile = New-TemporaryFile

    try {
        $raw = npx -y "$InspectorPackage" --cli @CommandArgs --method tools/list 2>$tmpFile
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            $errorContent = Get-Content -Path $tmpFile -Raw
            $Tests[0].Fail("Failed to connect to MCP server with exit code $exitCode. Error output:`n$errorContent")
            return
        } else {
            "" > $tmpFile
            $Tests[0].Pass()
        }

        try {
            $tools = $raw | ConvertFrom-Json
            $Tests[1].Pass()
        } catch {
            $Tests[1].Fail($_, $LASTEXITCODE)
            return
        }

        if (-not $tools.tools) {
            $Tests[2].Fail("No tools found in MCP output.")
            return
        } elseif ($tools.tools.Count -ne 2) {
            $Tests[2].Fail("Unexpected number of tools found in MCP output. Expected 2, found $($tools.tools.Count).")
        } else {
            $Tests[2].Pass()
        }

        try {
            $engineRaw = npx -y "$InspectorPackage" --cli @CommandArgs --method tools/call --tool-name get_engines 2>$tmpFile
            $exitCode = $LASTEXITCODE
            if ($exitCode -ne 0) {
                $errorContent = Get-Content -Path $tmpFile -Raw
                $Tests[3].Fail("Get engines tool failed with exit code $exitCode. Error output:`n$errorContent")
                return
            } else {
                "" > $tmpFile
            }
            $engineResp = $engineRaw | ConvertFrom-Json
            $engineContent = $engineResp.content
            $engineText = $engineContent.text
            if ($engineResp.isError -eq $true) {
                $Tests[3].Fail("Get engines tool returned an error: $($engineText)")
            } else {
                $Tests[3].Pass()
            }
        } catch {
            $Tests[3].Fail($_, $LASTEXITCODE)
        }

        try {
            $searchRaw = npx -y "$InspectorPackage" --cli @CommandArgs --method tools/call --tool-name search --tool-arg query='news' 2>$tmpFile
            $exitCode = $LASTEXITCODE
            if ($exitCode -ne 0) {
                $errorContent = Get-Content -Path $tmpFile -Raw
                $Tests[4].Fail("Search tool failed with exit code $exitCode. Error output:`n$errorContent")
                return
            } else {
                "" > $tmpFile
            }
            $searchResp = $searchRaw | ConvertFrom-Json
            $searchContent = $searchResp.content
            $searchText = $searchContent.text
            if ($searchResp.isError -eq $true) {
                $Tests[4].Fail("Search tool returned an error: $($searchText)")
            } else {
                $Tests[4].Pass()
            }
        } catch {
            $Tests[4].Fail($_, $LASTEXITCODE)
        }
    } finally {
        Remove-Item -Path $tmpFile -ErrorAction SilentlyContinue
    }
}

function RunTest {
    param (
        [string]$Name,
        [Test[]]$Tests,
        [string[]]$Command
    )

    Write-Host "========== Begin $($Name) Tests ==========`n"

    RunTestCore -Tests $Tests -CommandArgs $Command

    $succeededTests = $Tests | Where-Object { $_.Passed -eq $true }
    $failedTests = $Tests | Where-Object { $_.Passed -eq $false -and $_.Skipped -eq $false }
    $skippedTests = $Tests | Where-Object { $_.Skipped -eq $true }
    Write-Host "`n========== $($Name) Test Summary =========="
    Write-Host "Passed: $($succeededTests.Count), Failed: $($failedTests.Count), Skipped: $($skippedTests.Count). Total $($Tests.Count)."
    if ($failedTests.Count -gt 0) {
        Write-Host "`nFailed Tests:"
        for ($i = 0; $i -lt $Tests.Count; $i++) {
            if ($Tests[$i].Passed -eq $false -and $Tests[$i].Skipped -eq $false) {
                Write-Host "`e[31m✘`e[0m [$($i + 1)] $($Tests[$i].Name)"
            }
        }
        return 1
    } else {
        return 0
    }
}
