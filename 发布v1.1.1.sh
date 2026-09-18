#!/bin/bash
# ============================================================
# v1.1.1 一键发布脚本
# 做 4 件事：提交改动 → 打标签 v1.1.1 → 推送 → 创建 GitHub Release
# 用法：在终端里运行   bash ~/Documents/slime-game/发布v1.1.1.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo "== [1/4] 提交本地改动 =="
# 删掉被否决的 v1.4 眼睛实验页（避免它还挂在公开地址上）
rm -f slime-v1.2.html
git add -A
git commit -m "v1.1.1：回滚眼睛改造，恢复 v1.1 造型 + 修复穿模/卡模型 + 性能优化" || echo "（没有新改动可提交，继续）"

BRANCH=$(git branch --show-current)
echo "== [2/4] 推送分支 $BRANCH =="
git push origin "$BRANCH"

echo "== [3/4] 打标签 v1.1.1 =="
if git rev-parse v1.1.1 >/dev/null 2>&1; then
  echo "标签 v1.1.1 已存在，删除重建"
  git tag -d v1.1.1
fi
git tag -a v1.1.1 -m "v1.1.1 稳定修复版"
git push origin v1.1.1

echo "== [4/4] 创建 GitHub Release =="
cat > /tmp/rel_v111.json <<'JSONEOF'
{
  "tag_name": "v1.1.1",
  "name": "v1.1.1 稳定修复版：回到经典造型 + 全面排卡",
  "body": "## 🔙 回滚\n- 撤销 v1.4 的「眼睛藏进果冻内部」改造，**恢复 v1.1 的经典表面眼睛 + 瞳孔追踪造型**\n\n## 🛠️ 修复（卡模型 / 穿模类）\n- 🏠 **新增障碍物碰撞系统**：树 ×5 与小屋设为圆形禁区，史莱姆、宝宝、玩具球都会被推出禁区，不再穿进树冠 / 小屋里卡住\n- 🎯 **跳跃目标自动避障**：点击地面 / 星星 / 食物时，目标点若落在障碍物内会自动重定向到最近的禁区外\n- 🍎 **掉落物避障**：苹果 / 辣椒 / 星星 / 玩具球的生成点都会避开障碍物\n- ⚽ 玩具球撞到障碍物会反弹；落进池塘不再沉底（漂浮轻晃）\n\n## 🚀 优化（性能）\n- 果冻静止时跳过逐顶点抖动更新与法线重算（原先每帧全量计算）\n- 果冻网格密度 48×32 → 40×28（视觉几乎无差别，顶点数 -22%）\n\n🎮 在线游玩：https://626774341-cyber.github.io/slime-game/"
}
JSONEOF

TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill | grep ^password= | cut -d= -f2-)
HTTP=$(curl -s -o /tmp/relout111.json -w "%{http_code}" -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d @/tmp/rel_v111.json \
  https://api.github.com/repos/626774341-cyber/slime-game/releases)

echo ""
if [ "$HTTP" = "201" ]; then
  echo "✅ v1.1.1 发布成功！"
  grep -o '"html_url": "[^"]*"' /tmp/relout111.json | head -1
  echo ""
  echo "等 1-2 分钟让 GitHub Pages 自动更新，然后打开游戏确认："
  echo "   https://626774341-cyber.github.io/slime-game/"
  echo "（左上角版本徽章应显示 v1.1.1，眼睛回到表面造型）"
else
  echo "⚠️ Release 接口返回 HTTP $HTTP，详情："
  cat /tmp/relout111.json
  echo ""
  echo "（若提示 already_exists，说明 Release 之前已建过，代码推送本身已成功，可忽略）"
fi
