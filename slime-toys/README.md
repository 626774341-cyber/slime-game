# 🧸 四个小玩具组件

从「箱庭世界 / 湖泊郊游」里抽出的交互功能，拆成了 **4 个完全独立的小文件**。
每个组件 = 一个文件 + 一行创建 + 一次 update，其他（音效/点击/特效/提示）全部内置。

> 🤸 `toy-trampoline.js` 蹦床　🦆 `toy-ducks.js` 鸭子一家
> 🐸 `toy-frog.js` 青蛙荷叶　🐰 `toy-rabbit.js` 小兔子

四个文件互不依赖，**用哪个拷哪个**。

---

## 🤸 蹦床

```js
import { createTrampoline } from './toy-trampoline.js';
const tramp = createTrampoline(THREE, scene, camera, { x: 0, z: 2 });

// 每帧
tramp.update(dt);

// 角色落地时（让角色被弹飞）：
const vy = tramp.getBounce(x, z, 下落速度);
if(vy !== null) 角色.vy = vy;
```

## 🦆 鸭子一家

```js
import { createDucks } from './toy-ducks.js';
const ducks = createDucks(THREE, scene, camera, { x: 0, z: 5, r: 2.5 });

// 每帧
ducks.update(dt, t);
```
自带：鸭妈妈带 3 只小鸭排队绕圈游泳、点击嘎嘎+涟漪。

## 🐸 青蛙荷叶

```js
import { createFrog } from './toy-frog.js';
const frog = createFrog(THREE, scene, camera, { pads: [[-1.4,4.2],[0.6,4.6]] });

// 每帧
frog.update(dt, t);

// 角色落在荷叶上被弹起：
const vy = frog.getBounce(x, z, 下落速度);
```
自带：荷叶摇摆、青蛙呱呱叫并在荷叶间跳、点击青蛙会吓跑它。

## 🐰 小兔子

```js
import { createRabbit } from './toy-rabbit.js';
const rabbit = createRabbit(THREE, scene, camera, { x: -2, z: -1 });

// 每帧
rabbit.update(dt);

// 可选：告诉它玩家位置 → 玩家靠近会躲，点击喂一次后会跟着玩家走
rabbit.setPlayer(玩家x, 玩家z);
```

## 🌐 运行 demo

```bash
cd slime-toys
python3 -m http.server 8000
# 打开 http://localhost:8000/demo.html
```

## 💡 所有组件通用的可选配置

```js
{
  groundY: (x, z) => 0,      // 你的地形高度函数（默认平地 0）
  domElement: renderer.domElement,  // 点击拾取的画布（默认自动找 canvas）
  silent: true,              // 关闭 console 提示
}
```
