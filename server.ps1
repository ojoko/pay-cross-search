$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:${port}/")
$listener.Prefixes.Add("http://192.168.1.10:${port}/")

try {
    $listener.Start()
    Write-Host "PayCross Server active for PC and iPhone on Wi-Fi!"
    Write-Host "Local URL : http://localhost:${port}/"
    Write-Host "iPhone URL: http://192.168.1.10:${port}/"
} catch {
    Write-Host "Failed to bind network prefix, falling back to localhost only: $_"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:${port}/")
    $listener.Start()
}

$baseDir = "C:\Users\echoo\.gemini\antigravity\scratch\pay-cross-search"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }
        
        $filePath = [System.IO.Path]::Combine($baseDir, $path.TrimStart('/'))
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            if ($filePath.EndsWith(".html")) {
                $response.ContentType = "text/html; charset=utf-8"
            } elseif ($filePath.EndsWith(".css")) {
                $response.ContentType = "text/css; charset=utf-8"
            } elseif ($filePath.EndsWith(".js")) {
                $response.ContentType = "application/javascript; charset=utf-8"
            } elseif ($filePath.EndsWith(".json") -or $filePath.EndsWith(".manifest")) {
                $response.ContentType = "application/json; charset=utf-8"
            }
            
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
