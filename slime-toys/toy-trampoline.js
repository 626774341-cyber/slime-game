/* ============================================================
   toy-trampoline.js — 🤸 蹦床组件（独立版）
   ------------------------------------------------------------
   import { createTrampoline } from './toy-trampoline.js';
   const tramp = createTrampoline(THREE, scene, camera, { x: 0, z: 2 });
   // 每帧：tramp.update(dt);

   角色落地时问一句（放在你的落地逻辑里）：
     const vy = tramp.getBounce(x, z, 下落速度);
     if(vy !== null) 角色.vy = vy;   // 落在蹦床上会返回弹起速度
   ============================================================ */
export function createTrampoline(THREE, scene, camera, opt = {}) {
  const o = Object.assign({ x: 0, z: 2, groundY: () => 0, silent: false }, opt);
  const rand = (a,b)=>a+Math.random()*(b-a);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const dist2d = (a,b,c,d)=>Math.hypot(a-c,b-d);
  const V3 = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

  /* 音效（WebAudio 合成） */
  const audio = (()=>{
    let ctx=null, master=null;
    const ensure=()=>{ if(ctx) return true;
      const C=window.AudioContext||window.webkitAudioContext; if(!C) return false;
      ctx=new C(); master=ctx.createGain(); master.gain.value=0.9; master.connect(ctx.destination); return true; };
    const tone=(f,d,type,v,slide)=>{ if(!ensure())return; const t=ctx.currentTime,
      osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type=type; osc.frequency.setValueAtTime(f,t);
      if(slide) osc.frequency.exponentialRampToValueAtTime(Math.max(slide,1),t+d);
      g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+d);
      osc.connect(g); g.connect(master); osc.start(t); osc.stop(t+d+0.05); };
    return { unlock(){ if(ensure()&&ctx.state==='suspended') ctx.resume(); },
      boing(p=1){ tone(180*p,0.28,'sine',0.25,520*p); } };
  })();

  /* 星星粒子 */
  const fx = (()=>{
    const tex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=64;
      const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,2,32,32,30);
      g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.4,'rgba(255,255,255,.45)'); g.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=g; x.fillRect(0,0,64,64);
      const t=new THREE.CanvasTexture(c);
      if(THREE.SRGBColorSpace) t.colorSpace=THREE.SRGBColorSpace; return t; })();
    const pool=[], live=[];
    return {
      burst(pos,n=5){
        for(let i=0;i<n;i++){
          let p=pool.pop();
          if(!p) p={ s:new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false })), vel:new THREE.Vector3(), life:0 };
          p.s.material.color.set(0x9fd8ff); p.s.material.opacity=1;
          p.s.position.copy(pos); p.s.scale.setScalar(0.15);
          p.vel.set(rand(-2,2),rand(-1,2.5),rand(-2,2)); p.life=0;
          scene.add(p.s); live.push({ p, max:0.6 });
        }
      },
      update(dt){
        for(let i=live.length-1;i>=0;i--){
          const it=live[i]; it.p.life+=dt;
          if(it.p.life>=it.max){ scene.remove(it.p.s); pool.push(it.p); live.splice(i,1); continue; }
          it.p.vel.y-=2*dt; it.p.s.position.addScaledVector(it.p.vel,dt);
          it.p.s.material.opacity=1-it.p.life/it.max;
        }
      }
    };
  })();

  /* 建模 */
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
  const gy = o.groundY(o.x, o.z);
  g.position.set(o.x, gy, o.z);
  g.traverse(m=>{ if(m.isMesh) m.castShadow = true; });
  scene.add(g);

  let dip = 0;

  return {
    group: g,
    x: o.x, z: o.z,
    /** 蹦床面高度（你的角色可以站上来） */
    top: gy + 0.55,

    /** 每帧调用 */
    update(dt){
      if(dip>0) dip = Math.max(0, dip-dt*1.4);
      mat.position.y = 0.55 - Math.sin(dip*12)*dip*0.3;
      fx.update(dt);
    },

    /**
     * 角色落地时调用：落在蹦床上返回弹起速度（普通地面返回 null）
     * fallSpeed = 落地那一刻的下落速度（正数）
     */
    getBounce(x, z, fallSpeed){
      if(dist2d(x,z,o.x,o.z) >= 1.15 || fallSpeed <= 1) return null;
      const vy = clamp(fallSpeed*0.82+4.5, 9, 15.5);
      dip = 0.25;
      audio.unlock(); audio.boing(rand(1,1.3));
      fx.burst(V3(x, gy+0.9, z));
      return vy;
    },
  };
}
