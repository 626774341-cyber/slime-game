#!/bin/bash
# ============================================================
# 史莱姆桌宠一键构建（macOS Apple Silicon）
# 自动下载 Electron 预编译包并注入游戏，生成桌面 App
# 用法：bash desktop-pet/build.sh
# ============================================================
set -e
cd "$(dirname "$0")"

V=v33.2.0
APP=~/Desktop/史莱姆桌宠.app

echo "== [1/4] 下载 Electron $V（约 95MB）=="
curl -L --silent --show-error -o electron.zip \
  "https://github.com/electron/electron/releases/download/$V/electron-$V-darwin-arm64.zip"
rm -rf electron-tmp
unzip -q electron.zip -d electron-tmp

echo "== [2/4] 组装 App =="
rm -rf "$APP"
mkdir -p "$(dirname "$APP")"
cp -R electron-tmp/Electron.app "$APP"
mkdir -p "$APP/Contents/Resources/app"
cp -R app/. "$APP/Contents/Resources/app/"

echo "== [3/4] 设置显示名称 =="
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 史莱姆桌宠" "$APP/Contents/Info.plist" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string 史莱姆桌宠" "$APP/Contents/Info.plist"

rm -rf electron-tmp electron.zip

echo "== [4/4] 启动 =="
echo "✅ 构建完成：$APP"
open "$APP"
