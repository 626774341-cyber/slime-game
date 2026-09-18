#!/bin/bash
# ============================================================
# v2.0 一键发布脚本
# 提交 → 推送 → 打标签 v2.0 → 创建 GitHub Release
# 用法：在终端里运行   bash ~/Documents/slime-game/发布v2.0.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo "== [1/4] 提交本地改动 =="
git add -A
git commit -m "v2.0：智能绕路寻路——碰撞从「会挡路」进化为「会绕路」" || echo "（没有新改动可提交，继续）"

BRANCH=$(git branch --show-current)
echo "== [2/4] 推送分支 $BRANCH =="
git push origin "$BRANCH"

echo "== [3/4] 打标签 v2.0 =="
if git rev-parse v2.0 >/dev/null 2>&1; then
  echo "标签 v2.0 已存在，删除重建"
  git tag -d v2.0
fi
git tag -a v2.0 -m "v2.0 智能绕路寻路"
git push origin v2.0

echo "== [4/4] 创建 GitHub Release =="
cat > /tmp/rel_v200.json <<'JSONEOF'
{
  "tag_name": "v2.0",
  "name": "v2.0 智能绕路寻路：碰撞从「会挡路」进化为「会绕路」",
  "body": "## 🧭 本次核心：寻路系统正式版\n- 🧭 **切线绕行寻路**：跳跃路径被树 / 小屋挡住时，自动计算障碍物的切线绕行点，优先从离目标近的一侧绕过去，落地后继续朝目标走——**点树后面的位置也能绕过去到达**\n- 🧠 **防绕反 / 防打转**：绕行点必须「一路畅通且更接近目标」才生效；两侧都绕不开的夹缝才会贴边小磕一下停住\n- 🚶 **自动行为同样会绕路**：觅食 / 摘星 / 追球被挡住时不再放弃目标，而是绕过去继续——星星刷在树后面也照样摘得到\n\n## 🚀 优化\n- 单次跳跃链步数上限 4 → 12，长距离绕路能完整走完\n- 摘星星星生成点离障碍物更远，不再刷在贴树死角\n\n## 📦 建立在 v1.1.2 之上（全部包含）\n- 场景穿模修正（树已移出小屋）、跳跃撞墙即停、贴地沿墙滑动\n- v1.1.1：回滚眼睛内部化实验、恢复经典表面眼睛、障碍物碰撞禁区系统、性能优化\n\n🎮 在线游玩：https://626774341-cyber.github.io/slime-game/"
}
JSONEOF

TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill | grep ^password= | cut -d= -f2-)
HTTP=$(curl -s -o /tmp/relout200.json -w "%{http_code}" -X POST \
  -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
  -d @/tmp/rel_v200.json https://api.github.com/repos/626774341-cyber/slime-game/releases)

echo ""
if [ "$HTTP" = "201" ]; then
  echo "✅ v2.0 发布成功！"
  grep -o '"html_url": "[^"]*"' /tmp/relout200.json | head -1
  echo ""
  echo "等 1-2 分钟 GitHub Pages 自动更新后打开游戏确认："
  echo "   https://626774341-cyber.github.io/slime-game/"
  echo "（左上角徽章应显示 v2.0；试试点树后方的位置，史莱姆会绕过去）"
else
  echo "⚠️ Release 接口返回 HTTP $HTTP，详情："
  cat /tmp/relout200.json
  echo ""
  echo "（422 already_exists = Release 已建过，代码推送本身已成功，可忽略）"
fi
