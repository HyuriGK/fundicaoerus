# start-sync-dashboard.ps1
# This script launches sync-forever.js, optionally moving it to Virtual Desktop 2

$workDir = "C:\Users\brasi\Desktop\server"
$scriptPath = "scripts\sync-forever.js"
$logFile = "$workDir\startup-log.txt"

function Write-Log($message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] $message" | Out-File -FilePath $logFile -Append -Encoding UTF8
    Write-Host "$message"
}

Write-Log "--- STARTUP PROCESS INITIATED ---"
Set-Location $workDir

# 1. Network Check
Write-Log "Checking network connection..."
$maxRetries = 20
$retryCount = 0
$hasNetwork = $false

while ($retryCount -lt $maxRetries) {
    if (Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet) {
        Write-Log "Network detected!"
        $hasNetwork = $true
        break
    }
    Write-Log "Network not detected. Waiting... ($($retryCount + 1)/$maxRetries)"
    Start-Sleep -Seconds 5
    $retryCount++
}

if (-not $hasNetwork) {
    Write-Log "Warning: No network connection detected. Proceeding anyway."
}

# 2. Virtual Desktop Handling
Write-Log "Checking Virtual Desktops..."

try {
    # Check if VirtualDesktop module is available
    if (Get-Module -ListAvailable -Name VirtualDesktop) {
        Import-Module VirtualDesktop -ErrorAction Stop
        $desktops = Get-DesktopCount
        if ($desktops -lt 2) {
            Write-Log "Creating second Virtual Desktop..."
            New-Desktop | Out-Null
        }
        
        Write-Log "Starting sync monitor on Desktop 2..."
        # Start Node in a new window
        $proc = Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd $workDir; node $scriptPath" -WindowStyle Normal -PassThru
        Start-Sleep -Seconds 5
        Move-WindowToDesktop -ProcessId $proc.Id -DesktopIndex 1
        Write-Log "Process moved to Desktop 2 successfully."
    } else {
        Write-Log "VirtualDesktop module not found. Proceeding on main desktop."
        Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd $workDir; node $scriptPath"
    }
}
catch {
    Write-Log "Error during Virtual Desktop handling ($($_.Exception.Message)). Falling back to main desktop."
    Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd $workDir; node $scriptPath"
}

Write-Log "--- STARTUP PROCESS COMPLETE ---"
