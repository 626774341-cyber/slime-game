/* ============================================================
   toy-rabbit.js — 🐰 小兔子组件（独立版）
   自己蹦跳觅食；玩家靠近会躲；点击喂一次后变成朋友跟着玩家走。
   ------------------------------------------------------------
   import { createRabbit } from './toy-rabbit.js';
   const rabbit = createRabbit(THREE, scene, camera, { x: -2, z: -1 });
   // 每帧：rabbit.update(dt);
   // 可选：rabbit.setPlayer(玩家x, 玩家z);  ← 每帧更新玩家位置
   ============================================================ */
export function createRabbit(THREE, scene, camera, opt = {}) {
  const o = Object.assign({ x: -2, z: -1, groundY: () => 0, silent: false }, opt);
  const rand = (a,b)=>a+Math.random()*(b-a);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const dist2d = (a,b,c,d)=>Math.hypot(a-c,b-d);
  const V3 = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

  /* 音效 */
  const audio = (()=>{
    let ctx=null, master=null;
    const ensure=()=>{ if(ctx) return true;
      const C=window.AudioContext||window.webkitAudioContext; if(!C) return false;
      ctx=new C(); master=ctx.createGain(); master.gain.value=0.9; master.connect(ctx.destination); return true; };
    const tone=(f,d,type,v)=>{ if(!ensure())return; const t=ctx.currentTime,
      osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type=type; osc.frequency.setValueAtTime(f,t);
      g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+d);
      osc.connect(g); g.connect(master); osc.start(t); osc.stop(t+d+0.05); };
    return { unlock(){ if(ensure()&&ctx.state==='suspended') ctx.resume(); },
      giggle(){ [660,880,990].forEach((f,i)=>setTimeout(()=>tone(f,0.09,'triangle',0.12),i*90)); } };
  })();

  /* 爱心粒子 */
  const fx = (()=>{
    const tex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=64;
      const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,2,32,32,30);
      g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.4,'rgba(255,255,255,.45)'); g.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=g; x.fillRect(0,0,64,64);
      const t=new THREE.CanvasTexture(c);
      if(THREE.SRGBColorSpace) t.colorSpace=THREE.SRGBColorSpace; return t; })();
    const pool=[], live=[];
    return {
      hearts(pos,n=1){
        for(let i=0;i<n;i++) setTimeout(()=>{
          let p=pool.pop();
          if(!p) p={ s:new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false })), vel:new THREE.Vector3(), life:0 };
          p.s.material.color.set(0xff7fa5); p.s.material.opacity=1;
          p.s.position.copy(pos).add(V3(rand(-0.3,0.3),rand(0,0.3),0));
          p.s.scale.setScalar(rand(0.2,0.3));
          p.vel.set(rand(-0.3,0.3),1.4,rand(-0.2,0.2)); p.life=0;
          scene.add(p.s); live.push({ p, max:1 });
        }, i*140);
      },
      update(dt){
        for(let i=live.length-1;i>=0;i--){
          const it=live[i]; it.p.life+=dt;
          if(it.p.life>=it.max){ scene.remove(it.p.s); pool.push(it.p); live.splice(i,1); continue; }
          it.p.s.position.addScaledVector(it.p.vel,dt);
          it.p.s.material.opacity=1-it.p.life/it.max;
        }
      }
    };
  })();

  /* 建模 */
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
  const earInL = new THREE.Mesh(new THREE.CapsuleGeometry(0.022,0.14,3,6), pinkMat);
  const earInR = earInL.clone();
  earInL.position.set(-0.07,0.72,0.13); earInR.position.set(0.07,0.72,0.13);
  earInL.rotation.z = -0.15; earInR.rotation.z = 0.15;
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08,8,7), furMat);
  tail.position.set(0,0.26,-0.3);
  g.add(body, head, earL, earR, earInL, earInR, tail);
  g.traverse(m=>{ if(m.isMesh) m.castShadow = true; });
  scene.add(g);

  const self = {
    pos: V3(o.x, o.groundY(o.x,o.z), o.z),
    state:'idle', target:null, fed:false,
    vy:0, velX:0, velZ:0, grounded:true, heading:0, idleT:rand(2,5),
  };

  /* 点击 → 喂食（成为朋友） */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dom = opt.domElement || document.querySelector('canvas');
  if(dom){
    dom.addEventListener('pointerdown', e=>{
      audio.unlock();
      ndc.x = (e.clientX/innerWidth)*2-1;
      ndc.y = -(e.clientY/innerHeight)*2+1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects([g], true);
      if(!hits.length) return;
      audio.giggle();
      if(!self.fed){
        self.fed = true;
        fx.hearts(self.pos.clone().add(V3(0,0.8,0)), 3);
        if(!o.silent) console.log('🐰 你喂了小兔子，它现在跟着你走！');
      } else {
        fx.hearts(self.pos.clone().add(V3(0,0.8,0)), 1);
      }
    });
  }

  const playerPos = V3(999,0,999);

  return {
    group: g,
    pos: self.pos,
    /** 是否已被喂食（朋友状态） */
    get fed(){ return self.fed; },

    /** 每帧告诉它玩家位置（可选） */
    setPlayer(x, z){ playerPos.set(x, 0, z); },

    /** 每帧调用 */
    update(dt){
      const r = self;
      const ds = dist2d(r.pos.x,r.pos.z,playerPos.x,playerPos.z);

      // 没喂过：玩家靠近就跑开
      if(!r.fed && ds<2.2 && r.grounded && r.state==='idle'){
        const a = Math.atan2(r.pos.z-playerPos.z, r.pos.x-playerPos.x);
        r.target = { x:clamp(r.pos.x+Math.cos(a)*2.5,-30,30), z:clamp(r.pos.z+Math.sin(a)*2.5,-30,30) };
        r.state = 'hop';
      }
      // 喂过：离玩家远就跟上来
      if(r.fed && ds>3 && r.grounded && r.state==='idle'){
        r.target = { x:playerPos.x+rand(-2,2), z:playerPos.z+rand(-2,2) };
        r.state = 'hop';
      }
      // 跳跃移动
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
      // 空中物理
      if(!r.grounded){
        r.vy -= 12*dt;
        r.pos.x += r.velX*dt; r.pos.z += r.velZ*dt; r.pos.y += r.vy*dt;
        const gh = o.groundY(r.pos.x, r.pos.z);
        if(r.pos.y<=gh){ r.pos.y=gh; r.grounded=true; }
      }
      g.position.copy(r.pos);
      g.rotation.y = r.heading;
      g.rotation.x = r.grounded?0:-0.15;
      fx.update(dt);
    },
  };
}
