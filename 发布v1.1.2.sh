#!/bin/bash
# ============================================================
# v1.1.2 一键发布脚本
# 提交 → 推送 → 打标签 v1.1.2 → 创建 v1.1.2 Release → 补建上次漏发的 v1.1.1 Release
# 用法：在终端里运行   bash ~/Documents/slime-game/发布v1.1.2.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo "== [1/5] 提交本地改动 =="
git add -A
git commit -m "v1.1.2：树移出小屋 + 跳跃撞墙即停（消除闪现）+ 贴地沿墙滑动" || echo "（没有新改动可提交，继续）"

BRANCH=$(git branch --show-current)
echo "== [2/5] 推送分支 $BRANCH =="
git push origin "$BRANCH"

echo "== [3/5] 打标签 v1.1.2 =="
if git rev-parse v1.1.2 >/dev/null 2>&1; then
  echo "标签 v1.1.2 已存在，删除重建"
  git tag -d v1.1.2
fi
git tag -a v1.1.2 -m "v1.1.2 场景穿模修正 + 更自然的碰撞"
git push origin v1.1.2

echo "== [4/5] 准备 Release 说明 =="
cat > /tmp/rel_v112.json <<'JSONEOF'
{
  "tag_name": "v1.1.2",
  "name": "v1.1.2 场景穿模修正 + 更自然的碰撞",
  "body": "## 🛠️ 本版修复\n- 🏠 **场景穿模修正**：把「长在小屋里」的第 1 棵树移到屋前空地，树和房子彻底分开（该重叠自 v1.1 起一直存在）\n- ⚡ **消除闪现穿墙**：跳跃路径新增障碍物检测（线段-圆求交），跳向树 / 房子时每段跳在禁区边缘截短、稳稳停住（贴得近时原地小磕一下就停），不再穿进树冠后被硬推到另一侧\n- 🧊 **贴地碰撞改为沿墙滑动**：被推出禁区时去掉撞进障碍物的速度分量、只保留切向速度，从「位置瞬移」变成顺着树边滑过\n\n## 📦 本版同时包含 v1.1.1 的全部内容\n- 回滚 v1.4 眼睛内部化实验，恢复 v1.1 经典表面眼睛 + 瞳孔追踪造型\n- 障碍物碰撞禁区系统（树 ×5 + 小屋）：史莱姆 / 宝宝 / 玩具球 / 掉落物不再卡进模型\n- 跳跃目标 / 掉落物生成点自动避障；球撞树反弹、池塘漂浮不沉底\n- 性能优化：果冻静止时跳过逐顶点更新、网格 48×32 → 40×28\n\n🎮 在线游玩：https://626774341-cyber.github.io/slime-game/"
}
JSONEOF
cat > /tmp/rel_v111.json <<'JSONEOF'
{
  "tag_name": "v1.1.1",
  "name": "v1.1.1 稳定修复版：回到经典造型 + 全面排卡",
  "body": "## 🔙 回滚\n- 撤销 v1.4 的「眼睛藏进果冻内部」改造，**恢复 v1.1 的经典表面眼睛 + 瞳孔追踪造型**\n\n## 🛠️ 修复（卡模型 / 穿模类）\n- 🏠 **新增障碍物碰撞系统**：树 ×5 与小屋设为圆形禁区，史莱姆、宝宝、玩具球都会被推出禁区，不再穿进树冠 / 小屋里卡住\n- 🎯 **跳跃目标自动避障**：点击地面 / 星星 / 食物时，目标点若落在障碍物内会自动重定向到最近的禁区外\n- 🍎 **掉落物避障**：苹果 / 辣椒 / 星星 / 玩具球的生成点都会避开障碍物\n- ⚽ 玩具球撞到障碍物会反弹；落进池塘不再沉底（漂浮轻晃）\n\n## 🚀 优化（性能）\n- 果冻静止时跳过逐顶点抖动更新与法线重算（原先每帧全量计算）\n- 果冻网格密度 48×32 → 40×28（视觉几乎无差别，顶点数 -22%）\n\n🎮 在线游玩：https://626774341-cyber.github.io/slime-game/"
}
JSONEOF

echo "== [5/5] 创建 Release =="
TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill | grep ^password= | cut -d= -f2-)

HTTP=$(curl -s -o /tmp/relout112.json -w "%{http_code}" -X POST \
  -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
  -d @/tmp/rel_v112.json https://api.github.com/repos/626774341-cyber/slime-game/releases)
echo "v1.1.2 Release HTTP $HTTP"

# 上次发布只完成了推送和打标签，Release 页没建成，这里一并补上
HTTP1=$(curl -s -o /tmp/relout111.json -w "%{http_code}" -X POST \
  -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
  -d @/tmp/rel_v111.json https://api.github.com/repos/626774341-cyber/slime-game/releases)
echo "v1.1.1 Release HTTP $HTTP1（201 = 补建成功，422 = 之前已建过，均可忽略）"

echo ""
if [ "$HTTP" = "201" ]; then
  echo "✅ v1.1.2 发布成功！"
  grep -o '"html_url": "[^"]*"' /tmp/relout112.json | head -1
  echo ""
  echo "等 1-2 分钟 GitHub Pages 自动更新后打开游戏确认："
  echo "   https://626774341-cyber.github.io/slime-game/"
  echo "（左上角徽章 v1.1.2；树已搬出小屋；跳向树会在树边稳稳停住）"
else
  echo "⚠️ v1.1.2 Release 返回 HTTP $HTTP，详情："
  cat /tmp/relout112.json
fi
