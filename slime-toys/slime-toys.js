/* ================================================================
   slime-toys.js — 通用交互玩具组件包 v1.0
   蹦床 / 鸭子一家 / 青蛙荷叶 / 小兔子 / 气球
   ------------------------------------------------------------
   零依赖、即贴即用：只需要传入 THREE 和 scene，
   WebAudio 音效、点击拾取、粒子特效、提示气泡全部内置。

   ▶ 三步接入：
   1) 把本文件放进项目，然后在你的 module 脚本里：
        import { createToys } from './slime-toys.js';

   2) 创建（THREE、scene、camera 换成你自己的）：
        const toys = createToys(THREE, scene, camera, {
          groundY: (x, z) => 0,               // 你的地形高度函数（默认平地 0）
          domElement: renderer.domElement,     // 点击拾取的画布
          pond:  { x: 0, z: 5, r: 2.5 },       // 水域中心/半径（鸭子 & 涟漪；不传则不生成鸭子）
          trampoline: { x: 0, z: 1.5 },        // 蹦床位置（传 null 关闭）
          rabbit: { x: -2, z: -1 },            // 兔子出生点（传 null 关闭）
          balloons: { x: 2, z: -2 },           // 气球束位置（传 null 关闭）
          frogPads: [[-1.5,4.2],[-0.6,5.0]],   // 荷叶位置（默认按水域自动摆 2 片）
          onEvent: (type, data) => {},         // 事件回调：'bounce'|'quack'|'feedRabbit'|'frogHop'|'balloonFly'|'balloonPop'
        });

   3) 每帧调用一次：
        toys.update(dt, elapsedSeconds);
      可选：toys.setPlayer(x, z)   // 告诉组件玩家位置，兔子会躲着玩家走

   ▶ 物理挂钩（给你的角色/球做蹦床和荷叶弹跳）：
        const info = toys.getGroundInfo(x, z);
        // info = { h: 地面高度, kind: 'ground'|'tramp'|'pad' }
        const vy = toys.bounceAt(x, z, 下落速度);  // 落在蹦床/荷叶上时返回弹起速度，否则返回 null
   ============================================================ */

export function createToys(THREE, scene, camera, userOpt = {}) {

  /* ---------------- 配置 ---------------- */
  const opt = Object.assign({
    groundY: () => 0,
    domElement: null,
    pond: null,
    trampoline: { x: 0, z: 1.8 },
    rabbit: { x: -2, z: -1 },
    balloons: { x: 2, z: -2 },
    frogPads: null,          // 默认根据 pond 自动摆 2 片
    onEvent: () => {},
    toast: null,             // 自定义提示函数；默认用内置气泡
  }, userOpt);

  const V3 = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
  const rand = (a,b)=>a+Math.random()*(b-a);
  const rint = (a,b)=>Math.floor(rand(a,b+1));
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const dist2d = (x1,z1,x2,z2)=>Math.hypot(x1-x2,z1-z2);
  const groundY = (x,z)=>opt.groundY(x,z);

  /* ---------------- 内置提示气泡 ---------------- */
  const toast = opt.toast || (()=>{ let box=null; return (msg,dur=2000)=>{
    if(!box){ box=document.createElement('div');
      box.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;font-family:sans-serif;';
      document.body.appendChild(box); }
    const t=document.createElement('div');
    t.textContent=msg;
    t.style.cssText='background:rgba(50,60,52,.85);color:#fff;font-size:13px;padding:8px 18px;border-radius:999px;transition:opacity .4s;';
    box.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),400); }, dur);
  }; })();

  /* ---------------- 内置音效（WebAudio 合成，无音频文件） ---------------- */
  const audio = (()=>{
    let ctx=null, master=null;
    function ensure(){
      if(ctx) return true;
      const C = window.AudioContext || window.webkitAudioContext;
      if(!C) return false;
      ctx=new C(); master=ctx.createGain(); master.gain.value=0.9; master.connect(ctx.destination);
      return true;
    }
    function tone(f,d=0.2,type='sine',v=0.2,slide=null){
      if(!ensure()) return;
      const t=ctx.currentTime, o=ctx.createOscillator(), g=ctx.createGain();
      o.type=type; o.frequency.setValueAtTime(f,t);
      if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(slide,1),t+d);
      g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+d);
      o.connect(g); g.connect(master); o.start(t); o.stop(t+d+0.05);
    }
    return {
      unlock(){ if(ensure() && ctx.state==='suspended') ctx.resume(); },
      boing(p=1){ tone(180*p,0.28,'sine',0.25,520*p); },
      quack(){ tone(340,0.12,'sawtooth',0.16,200); setTimeout(()=>tone(300,0.1,'sawtooth',0.13,180),130); },
      croak(){ tone(120,0.25,'sawtooth',0.12,80); },
      giggle(){ [660,880,990].forEach((f,i)=>setTimeout(()=>tone(f,0.09,'triangle',0.12),i*90)); },
      pop(){ tone(880,0.08,'square',0.12,220); },
      fly(){ tone(400,0.5,'sine',0.08,1200); },
      chirp(){ const b=1800+Math.random()*800; tone(b,0.07,'sine',0.07,b*1.4); },
    };
  })();

  /* ---------------- 内置粒子（爱心/星星） ---------------- */
  const fx = (()=>{
    const tex = (()=>{
      const c=document.createElement('canvas'); c.width=c.height=64;
      const x=c.getContext('2d');
      const g=x.createRadialGradient(32,32,2,32,32,30);
      g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.4,'rgba(255,255,255,.45)'); g.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=g; x.fillRect(0,0,64,64);
      const t=new THREE.CanvasTexture(c);
      if(THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const pool=[], live=[];
    function spawn(pos,color,vel,life,size,grav=0){
      let p=pool.pop();
      if(!p) p={ s:new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false })), vel:V3(), life:0, max:1, grav:0 };
      p.s.material.color.set(color); p.s.material.opacity=1;
      p.s.position.copy(pos); p.s.scale.setScalar(size);
      p.vel.copy(vel); p.life=0; p.max=life; p.grav=grav;
      scene.add(p.s); live.push(p);
    }
    return {
      update(dt){
        for(let i=live.length-1;i>=0;i--){
          const p=live[i]; p.life+=dt;
          if(p.life>=p.max){ scene.remove(p.s); pool.push(p); live.splice(i,1); continue; }
          p.vel.y+=p.grav*dt; p.s.position.addScaledVector(p.vel,dt);
          p.s.material.opacity=1-p.life/p.max;
        }
      },
      hearts(pos,n=1){
        for(let i=0;i<n;i++) setTimeout(()=>spawn(
          pos.clone().add(V3(rand(-0.3,0.3),rand(0,0.3),0)), 0xff7fa5,
          V3(rand(-0.3,0.3),1.4,rand(-0.2,0.2)), 1, rand(0.2,0.3)), i*140);
      },
      sparkles(pos,n=6,color=0xffe28a){
        for(let i=0;i<n;i++) spawn(pos.clone(), color,
          V3(rand(-2,2),rand(-1.5,2.5),rand(-2,2)), 0.6, rand(0.1,0.2), -2);
      },
    };
  })();

  /* ---------------- 内置涟漪（水面波纹） ---------------- */
  const ripples = (()=>{
    const pool=[], live=[];
    return {
      spawn(x,y,z,scale=1){
        let r=pool.pop();
        if(!r) r={ m:new THREE.Mesh(
          new THREE.RingGeometry(0.4,0.48,26),
          new THREE.MeshBasicMaterial({ color:0xdff4ff, transparent:true, opacity:0.7, side:THREE.DoubleSide, depthWrite:false })) };
        r.m.position.set(x,y,z); r.m.rotation.x=-Math.PI/2; r.m.visible=true;
        r.life=0; r.scale=scale;
        scene.add(r.m); live.push(r);
      },
      update(dt){
        for(let i=live.length-1;i>=0;i--){
          const r=live[i]; r.life+=dt;
          const k=r.life/1.1;
          if(k>=1){ scene.remove(r.m); pool.push(r); live.splice(i,1); continue; }
          r.m.scale.setScalar((0.5+k*2.4)*r.scale);
          r.m.material.opacity=0.7*(1-k);
        }
      }
    };
  })();

  const waterY = opt.pond ? groundY(opt.pond.x, opt.pond.z) + 0.02 : 0;
  const interactives = [];   // 可点击对象注册表

  function shadowify(obj){
    obj.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
  }

  /* ================================================================
     1. 蹦床
  ================================================================ */
  const trampoline = opt.trampoline ? (()=>{
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color:0x3a6ea8, roughness:0.5, metalness:0.3 });
    for(let i=0;i<4;i++){
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.55,8), frameMat);
      const a = (i/4)*Math.PI*2 + Math.PI/4;
      leg.position.set(Math.cos(a)*0.85, 0.27, Math.sin(a)*0.85);
      g.add(leg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0,0.07,8,24), frameMat);
    ring.rotation.x = Math.PI/2; ring.position.y = 0.55;
    const mat = new THREE.Mesh(new THREE.CircleGeometry(0.95,24),
      new THREE.MeshStandardMaterial({ color:0x4a90d9, roughness:0.7 }));
    mat.rotation.x = -Math.PI/2; mat.position.y = 0.55;
    g.add(ring, mat);
    const gy = groundY(opt.trampoline.x, opt.trampoline.z);
    g.position.set(opt.trampoline.x, gy, opt.trampoline.z);
    shadowify(g);
    scene.add(g);
    interactives.push({ obj:g, action:'tramp' });
    return { group:g, mat, x:opt.trampoline.x, z:opt.trampoline.z, y:gy+0.55, dip:0 };
  })() : null;

  /* ================================================================
     2. 鸭子一家（需要 pond）
  ================================================================ */
  const ducks = opt.pond ? (()=>{
    function makeDuckMesh(scale, color){
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color, roughness:0.8 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.26,12,10), bodyMat);
      body.scale.set(1,0.8,1.3);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15,10,9), bodyMat);
      head.position.set(0,0.28,0.22);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05,0.14,7),
        new THREE.MeshStandardMaterial({ color:0xff9f43 }));
      beak.rotation.x = Math.PI/2; beak.position.set(0,0.27,0.4);
      const eyeGeo = new THREE.SphereGeometry(0.025,6,6);
      const eyeMat = new THREE.MeshStandardMaterial({ color:0x2c3038 });
      const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-0.08,0.34,0.3);
      const e2 = e1.clone(); e2.position.set(0.08,0.34,0.3);
      g.add(body, head, beak, e1, e2);
      g.scale.setScalar(scale);
      shadowify(g);
      return g;
    }
    const list = [];
    const mom = { group:makeDuckMesh(1,0xf5f0e6), type:'duck', angle:rand(0,6.28),
      rad:opt.pond.r*0.5, pos:V3(opt.pond.x+opt.pond.r*0.5, waterY, opt.pond.z), heading:0, quackT:rand(4,9) };
    scene.add(mom.group);
    list.push(mom);
    interactives.push({ obj:mom.group, action:'duck' });
    for(let i=0;i<3;i++){
      const d = { group:makeDuckMesh(0.55,0xffe08a), type:'duckling', leader:mom, idx:i,
        pos:mom.pos.clone(), heading:0 };
      scene.add(d.group);
      list.push(d);
      interactives.push({ obj:d.group, action:'duck' });
    }
    return list;
  })() : null;

  /* ================================================================
     3. 荷叶 + 青蛙
  ================================================================ */
  const frogPads = (()=>{
    const pads=[];
    const padMat = new THREE.MeshStandardMaterial({ color:0x3e9e4f, roughness:0.8, side:THREE.DoubleSide });
    let defs = opt.frogPads;
    if(!defs && opt.pond){
      const p=opt.pond;
      defs = [[p.x - p.r*0.85, p.z], [p.x, p.z + p.r*0.85]];
    }
    if(!defs) defs = [[-1.5,1.0],[-0.5,1.8]];
    for(const [px,pz] of defs){
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.045,14), padMat);
      pad.position.set(px, groundY(px,pz)+0.05, pz);
      pad.rotation.y = rand(0,6.28);
      scene.add(pad);
      const entry = { mesh:pad, x:px, z:pz, top:groundY(px,pz)+0.14, phase:rand(0,6.28) };
      pads.push(entry);
      interactives.push({ obj:pad, action:'pad' });
    }
    return pads;
  })();

  const frog = (()=>{
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color:0x66bb55, roughness:0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,9), mat);
    body.scale.y = 0.8;
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.055,7,6), mat);
    const e2 = e1.clone();
    e1.position.set(-0.09,0.12,0.05); e2.position.set(0.09,0.12,0.05);
    const eyeMat = new THREE.MeshStandardMaterial({ color:0x2c3038 });
    const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.022,6,6), eyeMat);
    const p2 = p1.clone();
    p1.position.set(-0.09,0.15,0.09); p2.position.set(0.09,0.15,0.09);
    g.add(body,e1,e2,p1,p2);
    shadowify(g);
    scene.add(g);
    const self = { group:g, pad:frogPads[0] ?? null, state:'sit', hopT:0 };
    interactives.push({ obj:g, action:'frog' });
    return self;
  })();

  /* ================================================================
     4. 小兔子
  ================================================================ */
  const rabbit = opt.rabbit ? (()=>{
    const g = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color:0xf7f2ec, roughness:1 });
    const pinkMat = new THREE.MeshStandardMaterial({ color:0xffc3cf, roughness:1 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24,12,10), furMat);
    body.scale.set(1,0.9,1.25); body.position.y = 0.24;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17,12,10), furMat);
    head.position.set(0,0.5,0.14);
    const earGeo = new THREE.CapsuleGeometry(0.045,0.22,4,8);
    const earL = new THREE.Mesh(earGeo, furMat);
    const earR = new THREE.Mesh(earGeo, furMat);
    earL.position.set(-0.07,0.72,0.08); earR.position.set(0.07,0.72,0.08);
    earL.rotation.z = -0.15; earR.rotation.z = 0.15;
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08,8,7), furMat);
    tail.position.set(0,0.26,-0.3);
    g.add(body, head, earL, earR, tail);
    shadowify(g);
    scene.add(g);
    interactives.push({ obj:g, action:'rabbit' });
    return { group:g, pos:V3(opt.rabbit.x, groundY(opt.rabbit.x,opt.rabbit.z), opt.rabbit.z),
      state:'idle', target:null, fed:false, vy:0, velX:0, velZ:0,
      grounded:true, heading:0, idleT:rand(2,5) };
  })() : null;

  /* ================================================================
     5. 气球束
  ================================================================ */
  const balloons = opt.balloons ? (()=>{
    const anchor = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34,0),
      new THREE.MeshStandardMaterial({ color:0x9aa08e, roughness:1, flatShading:true }));
    anchor.position.set(opt.balloons.x, groundY(opt.balloons.x,opt.balloons.z)+0.12, opt.balloons.z);
    scene.add(anchor);
    const list=[];
    const colors=[0xff6b8f,0x6bc5ff,0xffd36e];
    for(let i=0;i<3;i++){
      const g=new THREE.Group();
      const b=new THREE.Mesh(new THREE.SphereGeometry(0.3,12,10),
        new THREE.MeshPhysicalMaterial({ color:colors[i], roughness:0.15, clearcoat:1, clearcoatRoughness:0.2 }));
      b.scale.y=1.2;
      const string=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.9,4),
        new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.7 }));
      string.position.y=-0.85;
      g.add(b,string);
      g.position.set(opt.balloons.x+(i-1)*0.4, groundY(opt.balloons.x,opt.balloons.z)+1.5, opt.balloons.z);
      g.userData.state='tied'; g.userData.respawn=0; g.userData.phase=rand(0,6.28);
      shadowify(g);
      scene.add(g);
      list.push(g);
      interactives.push({ obj:g, action:'balloon' });
    }
    return list;
  })() : null;

  /* ================================================================
     点击交互（内置射线拾取）
  ================================================================ */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setNdc(e){
    ndc.x = (e.clientX/innerWidth)*2-1;
    ndc.y = -(e.clientY/innerHeight)*2+1;
  }
  const dom = opt.domElement || document.querySelector('canvas');
  if(dom){
    dom.addEventListener('pointerdown', e=>{
      audio.unlock();
      setNdc(e);
      raycaster.setFromCamera(ndc, camera);
      const objs = interactives.map(it=>it.obj);
      const hits = raycaster.intersectObjects(objs, true);
      if(!hits.length) return;
      let o = hits[0].object;
      while(o && !o.userData.__toyAction){ o = o.parent; }
      const it = o ? interactives.find(it=>it.obj===o) : null;
      if(!it) return;
      fire(it.action, it.obj);
    });
  }
  // 给注册对象打上标记（供父链查找）
  for(const it of interactives) it.obj.userData.__toyAction = it.action;
  // 注意：interactives 在下方各玩具里还会追加，故在创建完成后统一补标记
  function sealActions(){ for(const it of interactives) it.obj.userData.__toyAction = it.action; }

  function fire(action, obj){
    if(action==='tramp'){ /* 蹦床是物理交互，无点击行为 */ }
    else if(action==='duck'){
      audio.quack();
      if(opt.pond) ripples.spawn(obj.position.x, waterY+0.03, obj.position.z, 0.8);
      opt.onEvent('quack', obj);
      toast('🦆 嘎嘎！');
    }
    else if(action==='pad'){
      audio.boing(1.4);
      opt.onEvent('padClick', obj);
    }
    else if(action==='frog'){
      audio.croak();
      frog.state='hop'; frog.hopT=0;
      opt.onEvent('frogHop', frog);
      toast('🐸 呱！小青蛙跳去别的荷叶了');
    }
    else if(action==='rabbit' && rabbit){
      if(!rabbit.fed){
        rabbit.fed = true;
        audio.giggle();
        fx.hearts(rabbit.pos.clone().add(V3(0,0.8,0)), 3);
        toast('🐰 你喂了小兔子，它现在跟着你啦！');
        opt.onEvent('feedRabbit', rabbit);
      } else {
        audio.giggle();
        fx.hearts(rabbit.pos.clone().add(V3(0,0.8,0)), 1);
        toast('🐰 小兔子很喜欢你！');
      }
    }
    else if(action==='balloon'){
      const st = obj.userData.state;
      if(st==='tied'){
        obj.userData.state='fly';
        audio.fly();
        toast('🎈 气球飞走啦！再点一下可以戳破');
        opt.onEvent('balloonFly', obj);
      } else if(st==='fly'){
        obj.userData.state='popped'; obj.userData.respawn=12; obj.visible=false;
        audio.pop();
        fx.sparkles(obj.position, 10, 0xff6b8f);
        toast('💥 啪！气球戳破了');
        opt.onEvent('balloonPop', obj);
      }
    }
  }

  /* ================================================================
     对外 API
  ================================================================ */
  const api = {
    /** 每帧调用 */
    update(dt, t=0){ updateAll(dt, t); },

    /** 告诉组件"玩家"在哪里：兔子没喂过时会躲着玩家走 */
    setPlayer(x, z){ playerPos.set(x, 0, z); hasPlayer = true; },

    /**
     * 地面查询：kind = 'ground' | 'tramp' | 'pad'
     * 你的角色落地前查它，就能站在蹦床/荷叶上
     */
    getGroundInfo(x, z){
      if(trampoline && dist2d(x,z,trampoline.x,trampoline.z) < 1.15)
        return { h:trampoline.y, kind:'tramp' };
      for(const p of frogPads){
        if(dist2d(x,z,p.x,p.z) < 0.7)
          return { h:p.top, kind:'pad' };
      }
      return { h:groundY(x,z), kind:'ground' };
    },

    /**
     * 落地弹跳：把角色落地时的下落速度传进来。
     * 落在蹦床/荷叶上时返回弹起的向上速度，普通地面返回 null。
     * 典型用法（角色落地时）：
     *   const vy = toys.bounceAt(x, z, fallSpeed);
     *   if(vy !== null){ myChar.vy = vy; }
     */
    bounceAt(x, z, fallSpeed){
      const info = api.getGroundInfo(x,z);
      if(info.kind==='tramp' && fallSpeed > 1){
        const vy = clamp(fallSpeed*0.82+4.5, 9, 15.5);
        trampoline.dip = 0.25;
        audio.boing(1+bouncePitch++*0.0); audio.boing(rand(1,1.3));
        fx.sparkles(V3(x, trampoline.y+0.3, z), 5, 0x9fd8ff);
        opt.onEvent('bounce', { x, z, vy });
        toast('🤸 蹦床弹飞！', 800);
        return vy;
      }
      if(info.kind==='pad' && fallSpeed > 1){
        audio.boing(1.6);
        if(opt.pond) ripples.spawn(x, waterY+0.03, z, 1.4);
        if(frog.pad && dist2d(x,z,frog.pad.x,frog.pad.z)<0.8){ frog.state='hop'; frog.hopT=0; audio.croak(); }
        opt.onEvent('bounce', { x, z, vy:10.5, pad:true });
        toast('🪷 荷叶弹弹床！', 800);
        return 10.5;
      }
      return null;
    },

    trampoline, frogPads, rabbit, ducks, balloons,
    interactives,
    sealActions,
    audio, fx, ripples,
  };
  let bouncePitch = 1;

  /* ================================================================
     逐帧更新
  ================================================================ */
  const playerPos = V3(999,0,999);
  let hasPlayer = false;
  const waterPts = { x:0, z:0, y:0 };

  function updateAll(dt, t){
    /* 蹦床下陷回弹 */
    if(trampoline){
      if(trampoline.dip>0) trampoline.dip = Math.max(0, trampoline.dip-dt*1.4);
      trampoline.mat.position.y = 0.55 - Math.sin(trampoline.dip*12)*trampoline.dip*0.3;
    }

    /* 鸭子一家 */
    if(ducks){
      for(const d of ducks){
        if(d.type==='duck'){
          d.angle += dt*0.3;
          d.pos.set(
            opt.pond.x + Math.cos(d.angle)*d.rad,
            waterY,
            opt.pond.z + Math.sin(d.angle)*d.rad
          );
          d.heading = -d.angle;
          d.group.position.copy(d.pos);
          d.group.rotation.y = d.heading;
          if(Math.random()<dt*0.1) ripples.spawn(d.pos.x, waterY+0.03, d.pos.z, 0.7);
          d.quackT -= dt;
          if(d.quackT<=0){ d.quackT = rand(6,14); if(Math.random()<0.5) audio.chirp(); }
        } else {
          const lead = d.leader;
          const off = 0.5*(d.idx+1);
          const tx = lead.pos.x - Math.sin(lead.heading)*off + Math.sin(t*2+d.idx)*0.08;
          const tz = lead.pos.z - Math.cos(lead.heading)*off;
          d.pos.lerp(V3(tx, waterY, tz), Math.min(1,dt*2.2));
          d.group.position.copy(d.pos);
          d.group.rotation.y = lead.heading;
        }
      }
    }

    /* 荷叶浮动 + 青蛙 */
    for(const p of frogPads){
      p.mesh.position.y = p.top - 0.09 + Math.sin(t*1.8+p.phase)*0.025;
      p.mesh.rotation.z = Math.sin(t*1.3+p.phase)*0.04;
    }
    if(frog.state==='sit' && frog.pad){
      frog.group.position.set(frog.pad.x, frog.pad.top+0.03, frog.pad.z);
      frog.group.rotation.y = Math.sin(t*0.4)*0.6;
    } else if(frog.state==='hop'){
      frog.hopT += dt*3.2;
      if(frog.hopT>=1){
        frog.hopT=0; frog.state='sit';
        frog.pad = frogPads[rint(0,frogPads.length-1)];
      } else if(frog.pad){
        const to = V3(frog.pad.x, frog.pad.top+0.03, frog.pad.z);
        frog.group.position.lerp(to, dt*3);
        frog.group.position.y += Math.sin(frog.hopT*Math.PI)*0.4;
      }
    }

    /* 小兔子 */
    if(rabbit){
      const r = rabbit;
      const ds = hasPlayer ? dist2d(r.pos.x,r.pos.z,playerPos.x,playerPos.z) : 999;
      if(!r.fed && ds<2.2 && r.grounded && r.state==='idle'){
        const a = Math.atan2(r.pos.z-playerPos.z, r.pos.x-playerPos.x);
        r.target = { x:clamp(r.pos.x+Math.cos(a)*2.5,-30,30), z:clamp(r.pos.z+Math.sin(a)*2.5,-30,30) };
        r.state = 'hop';
      }
      if(r.fed && ds>3 && r.grounded && r.state==='idle' && hasPlayer){
        r.target = { x:playerPos.x+rand(-2,2), z:playerPos.z+rand(-2,2) };
        r.state = 'hop';
      }
      if(r.state==='hop'){
        if(r.grounded && r.target){
          const dx = r.target.x-r.pos.x, dz = r.target.z-r.pos.z;
          const d = Math.hypot(dx,dz);
          if(d<0.4){ r.state='idle'; r.idleT=rand(2,6); r.target=null; }
          else {
            const step = Math.min(d,2);
            r.vy = 3.4;
            r.velX = dx/d*step/0.55; r.velZ = dz/d*step/0.55;
            r.grounded = false;
            r.heading = Math.atan2(dx,dz);
          }
        }
      } else {
        r.idleT -= dt;
        if(r.idleT<=0 && r.grounded){
          r.idleT = rand(3,7);
          const a = rand(0,6.28), rr = rand(0.8,1.8);
          r.target = { x:r.pos.x+Math.cos(a)*rr, z:r.pos.z+Math.sin(a)*rr };
          r.state = 'hop';
        }
      }
      if(!r.grounded){
        r.vy -= 12*dt;
        r.pos.x += r.velX*dt; r.pos.z += r.velZ*dt; r.pos.y += r.vy*dt;
        const gh = groundY(r.pos.x, r.pos.z);
        if(r.pos.y<=gh){ r.pos.y=gh; r.grounded=true; }
      }
      r.group.position.copy(r.pos);
      r.group.rotation.y = r.heading;
      r.group.rotation.x = r.grounded?0:-0.15;
    }

    /* 气球 */
    if(balloons){
      for(const bl of balloons){
        if(bl.userData.state==='tied'){
          bl.position.y = groundY(bl.position.x,bl.position.z) + 1.5 + Math.sin(t*1.4+bl.userData.phase)*0.1;
          bl.rotation.z = Math.sin(t*1.1+bl.userData.phase)*0.08;
        } else if(bl.userData.state==='fly'){
          bl.position.y += dt*1.1;
          bl.position.x += Math.sin(t*0.8+bl.userData.phase)*dt*0.8;
          bl.position.z += Math.cos(t*0.7+bl.userData.phase)*dt*0.6;
          bl.rotation.z = Math.sin(t*1.5)*0.15;
          if(bl.position.y > groundY(bl.position.x,bl.position.z)+10){
            bl.userData.state='gone'; bl.userData.respawn=8; bl.visible=false;
          }
        } else {
          bl.userData.respawn -= dt;
          if(bl.userData.respawn<=0){
            bl.userData.state='tied'; bl.visible=true;
            bl.position.set(opt.balloons.x+rand(-0.4,0.4), groundY(opt.balloons.x,opt.balloons.z)+1.5, opt.balloons.z+rand(-0.3,0.3));
            fx.sparkles(bl.position, 5);
          }
        }
      }
    }

    fx.update(dt);
    ripples.update(dt);
  }

  sealActions();
  return api;
}
