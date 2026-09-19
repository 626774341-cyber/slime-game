/* ============================================================
   toy-ducks.js — 🦆 鸭子一家组件（独立版）
   鸭妈妈带 3 只小鸭子在水域排队绕圈游，点击会嘎嘎 + 涟漪
   ------------------------------------------------------------
   import { createDucks } from './toy-ducks.js';
   const ducks = createDucks(THREE, scene, camera, { x: 0, z: 5, r: 2.5 });
   // 每帧：ducks.update(dt, t);   t = 累计秒数（可选）
   ============================================================ */
export function createDucks(THREE, scene, camera, opt = {}) {
  const o = Object.assign({ x: 0, z: 5, r: 2.5, groundY: () => 0, silent: false }, opt);
  const rand = (a,b)=>a+Math.random()*(b-a);
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
      quack(){ tone(340,0.12,'sawtooth',0.16,200); setTimeout(()=>tone(300,0.1,'sawtooth',0.13,180),130); } };
  })();

  /* 涟漪 */
  const ripples = (()=>{
    const pool=[], live=[];
    return {
      spawn(x,y,z,scale=0.8){
        let r=pool.pop();
        if(!r) r={ m:new THREE.Mesh(new THREE.RingGeometry(0.4,0.48,26),
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

  /* 建模 */
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
    const eyeMat = new THREE.MeshStandardMaterial({ color:0x2c3038 });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.025,6,6), eyeMat);
    const e2 = e1.clone();
    e1.position.set(-0.08,0.34,0.3); e2.position.set(0.08,0.34,0.3);
    g.add(body, head, beak, e1, e2);
    g.scale.setScalar(scale);
    g.traverse(m=>{ if(m.isMesh) m.castShadow = true; });
    return g;
  }

  const waterY = o.groundY(o.x, o.z) + 0.02;
  const list = [];
  const mom = { group:makeDuckMesh(1,0xf5f0e6), type:'duck', angle:rand(0,6.28),
    rad:o.r*0.5, pos:V3(o.x+o.r*0.5, waterY, o.z), heading:0, quackT:rand(4,9) };
  scene.add(mom.group);
  list.push(mom);
  for(let i=0;i<3;i++){
    const d = { group:makeDuckMesh(0.55,0xffe08a), type:'duckling', leader:mom, idx:i,
      pos:mom.pos.clone(), heading:0 };
    scene.add(d.group);
    list.push(d);
  }

  /* 点击任意鸭子 → 嘎嘎 + 涟漪 */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dom = opt.domElement || document.querySelector('canvas');
  if(dom){
    dom.addEventListener('pointerdown', e=>{
      audio.unlock();
      ndc.x = (e.clientX/innerWidth)*2-1;
      ndc.y = -(e.clientY/innerHeight)*2+1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(list.map(d=>d.group), true);
      if(!hits.length) return;
      audio.quack();
      const d = list.find(d=>{ let f=hits[0].object; while(f){ if(f===d.group) return true; f=f.parent; } return false; });
      if(d) ripples.spawn(d.pos.x, waterY+0.03, d.pos.z, 0.8);
      if(!o.silent) console.log('🦆 嘎嘎！');
    });
  }

  return {
    group: mom.group,
    ducks: list,

    /** 每帧调用（t 为累计秒数，可不传） */
    update(dt, t=0){
      for(const d of list){
        if(d.type==='duck'){
          d.angle += dt*0.3;
          d.pos.set(
            o.x + Math.cos(d.angle)*d.rad,
            waterY,
            o.z + Math.sin(d.angle)*d.rad
          );
          d.heading = -d.angle;
          d.group.position.copy(d.pos);
          d.group.rotation.y = d.heading;
          if(Math.random()<dt*0.1) ripples.spawn(d.pos.x, waterY+0.03, d.pos.z, 0.7);
          d.quackT -= dt;
          if(d.quackT<=0){ d.quackT = rand(6,14); audio.quack(); }
        } else {
          const lead = d.leader;
          const off = 0.5*(d.idx+1);
          const tx = lead.pos.x - Math.sin(lead.heading)*off + Math.sin(t*2+d.idx)*0.08;
          const tz = lead.pos.z - Math.cos(lead.heading)*off;
          d.pos.lerp(V3(tx, waterY, tz), Math.min(1,dt*2.2));
          d.group.position.copy(d.pos);
          d.group.rotation.y = d.heading;
        }
      }
      ripples.update(dt);
    },
  };
}
