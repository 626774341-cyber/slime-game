/* ============================================================
   toy-frog.js — 🐸 青蛙荷叶组件（独立版）
   几片荷叶 + 一只坐在上面呱呱叫的小青蛙。
   荷叶是弹弹床：角色落上去会被弹起，青蛙也会被吓跑。
   ------------------------------------------------------------
   import { createFrog } from './toy-frog.js';
   const frog = createFrog(THREE, scene, camera, { pads: [[-1.4,4.2],[0.6,4.6]] });
   // 每帧：frog.update(dt, t);

   角色落地时：const vy = frog.getBounce(x, z, 下落速度);  // 落荷叶返回弹起速度
   ============================================================ */
export function createFrog(THREE, scene, camera, opt = {}) {
  const o = Object.assign({
    pads: [[-1.4, 1.5], [-0.4, 2.2]],   // 荷叶位置
    groundY: () => 0,
    silent: false,
  }, opt);
  const rand = (a,b)=>a+Math.random()*(b-a);
  const rint = (a,b)=>Math.floor(rand(a,b+1));
  const dist2d = (a,b,c,d)=>Math.hypot(a-c,b-d);
  const V3 = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

  /* 音效 */
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
      boing(p=1){ tone(180*p,0.28,'sine',0.25,520*p); },
      croak(){ tone(120,0.25,'sawtooth',0.12,80); } };
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
      burst(pos,n=6,color=0xffe28a){
        for(let i=0;i<n;i++){
          let p=pool.pop();
          if(!p) p={ s:new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false })), vel:new THREE.Vector3(), life:0 };
          p.s.material.color.set(color); p.s.material.opacity=1;
          p.s.position.copy(pos); p.s.scale.setScalar(0.16);
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

  /* 荷叶 */
  const pads = [];
  const padMat = new THREE.MeshStandardMaterial({ color:0x3e9e4f, roughness:0.8, side:THREE.DoubleSide });
  for(const [px,pz] of o.pads){
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.045,14), padMat);
    pad.position.set(px, o.groundY(px,pz)+0.05, pz);
    pad.rotation.y = rand(0,6.28);
    pad.castShadow = true;
    scene.add(pad);
    pads.push({ mesh:pad, x:px, z:pz, top:o.groundY(px,pz)+0.14, phase:rand(0,6.28) });
  }

  /* 青蛙 */
  const g = new THREE.Group();
  const frogMat = new THREE.MeshStandardMaterial({ color:0x66bb55, roughness:0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,9), frogMat);
  body.scale.y = 0.8;
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.055,7,6), frogMat);
  const e2 = e1.clone();
  e1.position.set(-0.09,0.12,0.05); e2.position.set(0.09,0.12,0.05);
  const eyeMat = new THREE.MeshStandardMaterial({ color:0x2c3038 });
  const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.022,6,6), eyeMat);
  const p2 = p1.clone();
  p1.position.set(-0.09,0.15,0.09); p2.position.set(0.09,0.15,0.09);
  g.add(body,e1,e2,p1,p2);
  g.traverse(m=>{ if(m.isMesh) m.castShadow = true; });
  scene.add(g);

  const self = { pad:pads[0], state:'sit', hopT:0 };

  /* 点击青蛙 → 呱！跳走 */
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
      audio.croak();
      self.state = 'hop'; self.hopT = 0;
      if(!o.silent) console.log('🐸 呱！');
    });
  }

  return {
    group: g,
    pads,

    /** 每帧调用 */
    update(dt, t=0){
      for(const p of pads){
        p.mesh.position.y = p.top - 0.09 + Math.sin(t*1.8+p.phase)*0.025;
        p.mesh.rotation.z = Math.sin(t*1.3+p.phase)*0.04;
      }
      if(self.state==='sit' && self.pad){
        g.position.set(self.pad.x, self.pad.top+0.03, self.pad.z);
        g.rotation.y = Math.sin(t*0.4)*0.6;
      } else if(self.state==='hop'){
        self.hopT += dt*3.2;
        if(self.hopT>=1){
          self.hopT=0; self.state='sit';
          self.pad = pads[rint(0,pads.length-1)];
        } else if(self.pad){
          const to = V3(self.pad.x, self.pad.top+0.03, self.pad.z);
          g.position.lerp(to, dt*3);
          g.position.y += Math.sin(self.hopT*Math.PI)*0.4;
        }
      }
      fx.update(dt);
    },

    /**
     * 角色落地时调用：落在荷叶上返回弹起速度（否则 null）
     * 会把青蛙吓跑到别的荷叶
     */
    getBounce(x, z, fallSpeed){
      for(const p of pads){
        if(dist2d(x,z,p.x,p.z) < 0.7 && fallSpeed > 1){
          audio.unlock(); audio.boing(1.6);
          fx.burst(V3(x, p.top+0.3, z));
          if(self.pad===p){ self.state='hop'; self.hopT=0; audio.croak(); }
          if(!o.silent) console.log('🪷 荷叶弹弹床！');
          return 10.5;
        }
      }
      return null;
    },
  };
}
