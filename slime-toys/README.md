# 🧸 slime-toys 通用交互玩具组件包

从「箱庭世界 / 湖泊郊游」里抽出的**可复用交互功能**，做成了零依赖的独立组件。
任何一个 three.js 项目，贴一个文件 + 三行代码，就能获得全部功能。

> 包含：🤸 蹦床 · 🦆 鸭子一家（排队跟游）· 🐸 青蛙荷叶（弹弹床）· 🐰 小兔子（喂食后跟随）· 🎈 气球束（放飞/戳破）
> 内置：WebAudio 合成音效（无音频文件）、点击射线拾取、爱心/星星粒子、水面涟漪、提示气泡

---

## 📦 文件

| 文件 | 说明 |
| --- | --- |
| `slime-toys.js` | 组件本体（唯一需要的文件，ES Module，零依赖） |
| `demo.html` | 可直接部署打开的演示页（含自动蹦跳的演示球） |

## 🚀 三步接入

```js
// 1. 引入（把 slime-toys.js 放进你的项目）
import { createToys } from './slime-toys.js';

// 2. 创建（THREE / scene / camera 换成你自己的）
const toys = createToys(THREE, scene, camera, {
  groundY: (x, z) => 0,              // 你的地形高度函数（默认平地 0）
  domElement: renderer.domElement,   // 点击拾取的画布
  pond:  { x: 0, z: 5, r: 2.5 },     // 水域（鸭子/涟漪；不传则不生成鸭子）
  trampoline: { x: 0, z: 1.5 },      // 蹦床（null 关闭）
  rabbit: { x: -2, z: -1 },          // 兔子（null 关闭）
  balloons: { x: 2, z: -2 },         // 气球（null 关闭）
  frogPads: [[-1.4,4.2],[0.6,4.6]],  // 荷叶位置（不传则按水域自动摆）
  onEvent: (type, data) => {},       // 事件回调（可选）
});

// 3. 每帧调用
toys.update(dt, elapsedTime);
```

## 🎮 自带交互一览

| 物件 | 点击效果 | 行为 |
| --- | --- | --- |
| 🤸 蹦床 | — | 物体落在上面会越弹越高（配套物理挂钩） |
| 🦆 鸭子 | 嘎嘎 + 涟漪 | 鸭妈妈带 3 只小鸭子排队绕水域游泳 |
| 🐸 青蛙 | 呱！跳去别的荷叶 | 坐在荷叶上，荷叶是弹弹床 |
| 🐰 兔子 | 喂食 → 变成朋友 | 自己蹦跳觅食；没喂时会躲玩家，喂过会跟着玩家走 |
| 🎈 气球 | 第一次放飞，再点戳破（星星纸屑） | 三个气球随风摇摆，飞远后过一会儿回来 |

## 🔧 物理挂钩（给你的角色用）

```js
// 落地前查询地面类型：'ground' | 'tramp' | 'pad'
const info = toys.getGroundInfo(x, z);   // { h: 高度, kind: 类型 }

// 落地时：传下落速度，落在蹦床/荷叶上会返回弹起速度（普通地面返回 null）
const vy = toys.bounceAt(x, z, fallSpeed);
if(vy !== null) myChar.vy = vy;
```

`demo.html` 里的演示球就是用这两个 API 实现的，可以直接抄。

## 📡 事件回调

`onEvent(type, data)` 会收到：`bounce`（蹦床/荷叶弹起）、`quack`、`feedRabbit`、`frogHop`、`balloonFly`、`balloonPop`、`padClick`——可以接你自己的积分/成就系统。

## 💡 常用自定义

```js
toys.setPlayer(x, z);      // 每帧告诉它玩家位置 → 兔子会躲人/跟人
toys.audio.boing(1.5);     // 手动播音效
toys.fx.hearts(pos, 3);    // 手动冒爱心
toys.fx.sparkles(pos, 8);  // 手动冒星星
toys.ripples.spawn(x,y,z); // 手动水面涟漪
```

## 🌐 运行 demo

```bash
cd slime-toys
python3 -m http.server 8000
# 打开 http://localhost:8000/demo.html
```
（ES Module 限制，直接双击 demo.html 在部分浏览器打不开；部署到任意静态服务器/GitHub Pages 则无问题）
