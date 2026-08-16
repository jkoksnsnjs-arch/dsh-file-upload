param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$App
)

$ErrorActionPreference = 'Stop'
$text = ''

function Write-Utf8([string]$Value) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::Out.Write($Value)
}

try {
    if ($App -eq 'word') {
        $application = New-Object -ComObject Word.Application
        $application.Visible = $false
        $application.DisplayAlerts = 0
        $document = $application.Documents.Open($Path, $false, $true)
        try {
            $text = $document.Content.Text
        } finally {
            $document.Close(0)
        }
    } elseif ($App -eq 'excel') {
        $application = New-Object -ComObject Excel.Application
        $application.Visible = $false
        $application.DisplayAlerts = $false
        $workbook = $application.Workbooks.Open($Path, $null, $true)
        try {
            $lines = New-Object System.Collections.Generic.List[string]
            foreach ($sheet in $workbook.Worksheets) {
                $lines.Add("--- Sheet: $($sheet.Name) ---")
                $used = $sheet.UsedRange
                for ($row = 1; $row -le $used.Rows.Count; $row++) {
                    $cells = @()
                    for ($column = 1; $column -le $used.Columns.Count; $column++) {
                        $cells += [string]$used.Cells.Item($row, $column).Text
                    }
                    if (($cells -join '') -ne '') {
                        $lines.Add(($cells -join "`t"))
                    }
                }
            }
            $text = $lines -join "`n"
        } finally {
            $workbook.Close($false)
        }
    } elseif ($App -eq 'powerpoint') {
        $application = New-Object -ComObject PowerPoint.Application
        $presentation = $application.Presentations.Open($Path, $true, $false, $false)
        try {
            $lines = New-Object System.Collections.Generic.List[string]
            foreach ($slide in $presentation.Slides) {
                $lines.Add("--- Slide $($slide.SlideIndex) ---")
                foreach ($shape in $slide.Shapes) {
                    if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                        $lines.Add([string]$shape.TextFrame.TextRange.Text)
                    }
                }
            }
            $text = $lines -join "`n"
        } finally {
            $presentation.Close()
        }
    } else {
        throw "unsupported Office app: $App"
    }
    Write-Utf8 $text
} catch {
    [Console]::Error.WriteLine("office automation failed: Office application could not be started or the file could not be opened (COM HRESULT $($_.Exception.HResult))")
    exit 2
} finally {
    if ($application) {
        try { $application.Quit() } catch {}
    }
}
