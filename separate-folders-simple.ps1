# PowerShell script to separate monorepo into two folders
# Run this from the project root directory

Write-Host "Starting folder separation..." -ForegroundColor Green

# Step 1: Create Backend Folder
Write-Host ""
Write-Host "Creating LearnBot-Backend folder..." -ForegroundColor Cyan
if (Test-Path "LearnBot-Backend") {
    Write-Host "LearnBot-Backend folder already exists. Skipping..." -ForegroundColor Yellow
} else {
    New-Item -ItemType Directory -Path "LearnBot-Backend" | Out-Null
    Write-Host "Created LearnBot-Backend folder" -ForegroundColor Green
}

# Copy flask-backend contents
Write-Host "Copying backend files..." -ForegroundColor Cyan
if (Test-Path "flask-backend") {
    Copy-Item -Path "flask-backend\*" -Destination "LearnBot-Backend\" -Recurse -Force
    Write-Host "Backend files copied" -ForegroundColor Green
} else {
    Write-Host "ERROR: flask-backend folder not found!" -ForegroundColor Red
    exit 1
}

# Step 2: Create Frontend Folder
Write-Host ""
Write-Host "Creating LearnBot-Frontend folder..." -ForegroundColor Cyan
if (Test-Path "LearnBot-Frontend") {
    Write-Host "LearnBot-Frontend folder already exists. Skipping..." -ForegroundColor Yellow
} else {
    New-Item -ItemType Directory -Path "LearnBot-Frontend" | Out-Null
    Write-Host "Created LearnBot-Frontend folder" -ForegroundColor Green
}

# Copy frontend files
Write-Host "Copying frontend files..." -ForegroundColor Cyan

# Copy folders
$frontendFolders = @("app", "components", "lib", "public", "styles")
foreach ($folder in $frontendFolders) {
    if (Test-Path $folder) {
        Copy-Item -Path "$folder" -Destination "LearnBot-Frontend\" -Recurse -Force
        Write-Host "  Copied $folder/" -ForegroundColor Gray
    }
}

# Copy files
$frontendFiles = @(
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "next.config.mjs",
    "postcss.config.mjs",
    "components.json",
    ".gitignore",
    "env.local.example"
)

foreach ($file in $frontendFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination "LearnBot-Frontend\" -Force
        Write-Host "  Copied $file" -ForegroundColor Gray
    }
}

# Remove backend files from frontend folder
Write-Host ""
Write-Host "Cleaning up frontend folder..." -ForegroundColor Cyan
if (Test-Path "LearnBot-Frontend\flask-backend") {
    Remove-Item -Path "LearnBot-Frontend\flask-backend" -Recurse -Force
    Write-Host "  Removed flask-backend/" -ForegroundColor Gray
}

if (Test-Path "LearnBot-Frontend\app\api") {
    Remove-Item -Path "LearnBot-Frontend\app\api" -Recurse -Force
    Write-Host "  Removed app/api/" -ForegroundColor Gray
}

if (Test-Path "LearnBot-Frontend\requirements.txt") {
    Remove-Item -Path "LearnBot-Frontend\requirements.txt" -Force
    Write-Host "  Removed requirements.txt" -ForegroundColor Gray
}

if (Test-Path "LearnBot-Frontend\init-schema.sql") {
    Remove-Item -Path "LearnBot-Frontend\init-schema.sql" -Force
    Write-Host "  Removed init-schema.sql" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Folder separation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Update LearnBot-Backend/app.py CORS configuration"
Write-Host "  2. Update LearnBot-Frontend/.env.local with backend URL"
Write-Host "  3. Test both folders independently"
