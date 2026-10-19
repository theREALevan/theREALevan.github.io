import { publications } from './publications.js?v=20261019-mobile-joystick';

const $ = (selector) => document.querySelector(selector);
const dialogs = [...document.querySelectorAll('dialog')];
const keys = new Set();
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reducedQuery.matches;
$('#reduce-motion').checked = reducedMotion;
$('#reduce-motion').addEventListener('change', e => { reducedMotion = e.target.checked; });
reducedQuery.addEventListener('change', e => { reducedMotion = e.matches; $('#reduce-motion').checked = reducedMotion; });
let visited = new Set();
try { visited = new Set(JSON.parse(localStorage.getItem('evan-lunar-visited') || '[]').filter(id => publications.some(p => p.id === id))); } catch {}
let worldAPI = null;
let returnFocus = null;
const modalOpen = () => dialogs.some(d => d.open);
const escapeHTML = value => String(value).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
function updateVisited() {
  $('#discovered-count').textContent = `${String(visited.size).padStart(2,'0')} / 04`;
  try { localStorage.setItem('evan-lunar-visited', JSON.stringify([...visited])); } catch {}
}
function openDialog(dialog) {
  if (!document.activeElement.closest("dialog")) returnFocus = document.activeElement;
  for (const other of dialogs) if(other.open) other.close();
  keys.clear();
  worldAPI?.pause();
  dialog.showModal();
  dialog.querySelector('.close-dialog').focus({preventScroll:true});
}
for (const dialog of dialogs) {
  dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    const box = dialog.getBoundingClientRect();
    if(e.target === dialog && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.querySelectorAll('video').forEach(video => video.pause());
    keys.clear();
    if(returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  });
}
function openPaper(p) {
  visited.add(p.id); updateVisited();
  const media = p.media.endsWith('.mp4')
    ? `<video class="paper-media" src="${p.media}" aria-label="${escapeHTML(p.shortTitle)} research teaser" controls playsinline muted loop preload="metadata"></video>`
    : `<img class="paper-media" src="${p.media}" alt="${escapeHTML(p.title)} teaser">`;
  $('#paper-content').innerHTML = `<div class="paper-meta"><span class="paper-number" style="background:${p.color}">${p.index}</span><span>${p.category}</span><span> / ${p.venue}</span></div><h2 id="paper-title">${escapeHTML(p.title)}</h2><p class="paper-authors">${escapeHTML(p.authors)}</p>${media}<div class="paper-links">${Object.entries(p.links).map(([name,url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>`).join('')}</div>`;
  const video = $('#paper-content video');
  if (video) {
    video.defaultPlaybackRate = Number(p.playbackRate) || 1;
    video.playbackRate = video.defaultPlaybackRate;
  }
  openDialog($('#paper-dialog'));
}
function renderIndex(query='') {
  const results = publications.filter(p => `${p.title} ${p.category} ${p.venue} ${p.authors}`.toLowerCase().includes(query.toLowerCase()));
  $('#publication-list').replaceChildren();
  for(const p of results) {
    const row = document.createElement('article'); row.className='publication-row';
    row.innerHTML=`<span class="row-number" style="background:${p.color}66">${p.index}</span><div><h3>${p.shortTitle}</h3><p>${p.category} · ${p.venue}</p></div><div class="row-actions"><button class="row-read" aria-label="Read ${p.shortTitle}">Read paper</button><button class="row-visit" aria-label="Travel to ${p.shortTitle}" title="Travel to this outpost">↗</button></div>`;
    row.querySelector('.row-read').addEventListener('click',()=>openPaper(p));
    row.querySelector('.row-visit').addEventListener('click',()=>{ if(worldAPI) {$('#index-dialog').close();worldAPI.travel(p);} else openPaper(p); });
    $('#publication-list').append(row);
  }
  $('#no-results').hidden=results.length>0;
}
function openIndex(){ renderIndex(); $('#paper-search').value='';openDialog($('#index-dialog')); }
$('#papers-button').addEventListener('click',openIndex);
$('#fallback-papers').addEventListener('click',openIndex);
$('#paper-search').addEventListener('input',e=>renderIndex(e.target.value));
$('#about-button').addEventListener('click',()=>openDialog($('#about-dialog')));
$('#credits-button').addEventListener('click',()=>openDialog($('#credits-dialog')));
$('#preview-button').addEventListener('click',()=>worldAPI?.togglePreview());
$('#help-button').addEventListener('click',()=>openDialog($('#help-dialog')));
$('#overview-button').addEventListener('click',()=>worldAPI?.reset());
$('#interact-button').addEventListener('click',()=>worldAPI?.interact());
updateVisited();

const labels = new Map();
for (const p of publications) {
  const label = document.createElement('button');
  label.className='station-label';label.style.setProperty('--station',p.color);
  label.setAttribute('aria-label',`Travel to ${p.shortTitle}`);
  label.innerHTML=`<span>${p.index}</span><span>${p.shortTitle}<small>${p.venue.toUpperCase()}</small></span><span class="label-arrow">↗</span>`;
  label.style.visibility='hidden';label.addEventListener('click',()=>worldAPI?.travel(p));
  $('#station-labels').append(label);labels.set(p.id,label);
  const marker=document.createElement('button');marker.className='map-marker';marker.style.setProperty('--station',p.color);
  marker.style.left=`${50+p.x/60*100}%`;marker.style.top=`${50+p.z/60*100}%`;
  marker.setAttribute('aria-label',`Travel to ${p.shortTitle}`);marker.title=p.shortTitle;
  marker.addEventListener('click',()=>worldAPI ? worldAPI.travel(p) : openPaper(p));$('#map-surface').append(marker);
}
window.__lunarUIReady = true;
function failure(error) {
  window.dispatchEvent(new Event('lunar:failed'));
  console.error('Lunar world could not start:',error);
  $('#loading').hidden=true;$('#fallback').hidden=false;
  document.body.classList.add('world-unavailable');
  $('#touch-controls').inert=true;
  for(const label of labels.values())label.style.visibility='hidden';
  $('#nearby').hidden=true;worldAPI=null;
}
async function boot() {
  const [THREE, { createWorld }, motion, { createHologram }, { createJoystick }] = await Promise.all([
    import('./vendor/three.module.min.js'), import('./scene.js?v=20261019-mobile-joystick'),
    import('./spherical-motion.js?v=20261019-mobile-joystick'), import('./hologram.js?v=20261019-mobile-joystick'),
    import('./joystick.js?v=20261019-mobile-joystick'),
  ]);
  const {advanceSurface, surfaceDistance, tangentTowards, surfaceQuaternion, createNavigator}=motion;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  renderer.domElement.setAttribute('aria-label','A tiny research planet. Use W A S D or arrow keys to drive around it; approach a flag for a holographic preview, E to read.');renderer.domElement.tabIndex=0;
  $('#world').append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#121c26');
  scene.add(new THREE.HemisphereLight('#e9f4ff','#778e91',1.35));
  const sun=new THREE.DirectionalLight('#ffe6c3',2.8);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-32,right:32,top:32,bottom:-32,near:1,far:160});
  sun.shadow.normalBias=.07;sun.shadow.bias=-.0002;scene.add(sun);
  const fill=new THREE.DirectionalLight('#a7d8fa',.65);scene.add(fill);
  const world=createWorld(scene,publications), {rover,radius}=world;
  const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,700);
  const stations=new Map(world.stationGroups.map(g=>[g.userData.publicationId,g]));
  const navigator=createNavigator(radius,world.obstacles,2.45);
  const collision=createNavigator(radius,world.obstacles,2.05);
  const hologram=createHologram(scene,world);
  const normal=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,-1);
  const origin=new THREE.Vector3(), cameraRotation=new THREE.Quaternion(), wantedRotation=new THREE.Quaternion();
  const viewMatrix=new THREE.Matrix4(), cameraDirection=new THREE.Vector3(), orbitRotation=new THREE.Quaternion();
  const inverseCamera=new THREE.Quaternion(),projected=new THREE.Vector3(),pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();
  let speed=0, zoom=1, distance=100, yaw=0, pitch=0, nearby=null, route=[],destination=null,statusTimer=0,hidden=document.hidden;
  let joystick=null;
  const stickForward=new THREE.Vector3(),stickNormal=new THREE.Vector3();
  const stickRight=new THREE.Vector3(),stickDesired=new THREE.Vector3(),stickCross=new THREE.Vector3();
  const stickTransport=new THREE.Quaternion();
  let elapsed=0,animationFrame,previous=performance.now();
  const mapMarkers=[...$('#map-surface').querySelectorAll('.map-marker')];
  const starGeometry=new THREE.BufferGeometry(),starPositions=[];
  let seed=93;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<850;i++){
    const y=random()*2-1,a=random()*Math.PI*2,r=300+random()*100,w=Math.sqrt(1-y*y);
    starPositions.push(Math.cos(a)*w*r,y*r,Math.sin(a)*w*r);
  }
  starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  scene.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({color:'#d7e6ef',size:.55,transparent:true,opacity:.7})));
  // A fixed pool of prints follows the spherical surface without growing memory.
  const tracks=new THREE.InstancedMesh(new THREE.PlaneGeometry(.34,.6),new THREE.MeshBasicMaterial({color:'#5a686a',transparent:true,opacity:.2,depthWrite:false}),280);
  tracks.count=0;scene.add(tracks);const trackDummy=new THREE.Object3D();let trackIndex=0,trackDistance=0;
  function addTracks(){
    const right=new THREE.Vector3().crossVectors(forward,normal).normalize();
    for(const side of [-1,1]){
      const n=normal.clone().addScaledVector(right,side*1.56/radius).normalize();
      const f=forward.clone().addScaledVector(n,-forward.dot(n)).normalize();
      const r=new THREE.Vector3().crossVectors(f,n).normalize();
      trackDummy.position.copy(world.surfacePoint(n,.035));
      trackDummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r,f,n));trackDummy.updateMatrix();
      tracks.setMatrixAt(trackIndex,trackDummy.matrix);trackIndex=(trackIndex+1)%280;tracks.count=Math.min(280,tracks.count+1);
    }
    tracks.instanceMatrix.needsUpdate=true;
  }
  function poseRover(){rover.position.copy(world.surfacePoint(normal));rover.quaternion.copy(surfaceQuaternion(normal,forward));}
  function status(text,seconds=4){$('#drive-status').textContent=text;statusTimer=seconds;}
  function explore(){renderer.domElement.focus({preventScroll:true});}
  function pause(){joystick?.reset();keys.clear();speed=0;route=[];destination=null;status('');hologram.setActive(false);}
  function reset(){
    pause();normal.set(0,1,0);forward.set(0,0,-1);poseRover();yaw=0;pitch=0;zoom=1;
    nearby=null;hologram.setPublication(null);$('#nearby').hidden=true;tracks.count=0;trackIndex=0;trackDistance=0;
    updateCamera(0,true);explore();
  }
  function travel(p){
    joystick?.reset();keys.clear();explore();const station=stations.get(p.id).userData.normal;
    if(surfaceDistance(normal,station,radius)<8.2){route=[];destination=null;speed=0;nearby=p;hologram.setPublication(p);status(`AT ${p.shortTitle} · Press E to read`,5);return;}
    // Stop outside the enlarged flag's footprint, on the side facing the rover.
    const tangent=tangentTowards(station,normal),angle=6.4/radius;
    const end=station.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent,Math.sin(angle)).normalize();
    route=navigator.route(normal,end).slice(1);speed=0;
    if(!route.length){destination=null;status('No clear route from here. Steer away from the display and try again.');return;}
    destination=p;status(`AUTOPILOT → ${p.shortTitle} · WASD to take over`,60);
  }
  function interact(){if(nearby)openPaper(nearby);}
  worldAPI={explore,reset,travel,interact,pause,togglePreview:()=>hologram.toggle()};
  const drivingKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
  function manual(){if(destination){route=[];destination=null;status('Manual control');}}
  joystick=createJoystick($('#drive-joystick'),{onStart(){
    manual();keys.clear();
    // Snapshot screen-up once per gesture, then transport it around the sphere.
    // Using the moving follow camera every frame would make a held stick spiral.
    stickNormal.copy(normal);
    stickForward.set(0,1,0).applyQuaternion(camera.quaternion);
    stickForward.addScaledVector(normal,-stickForward.dot(normal));
    if(stickForward.lengthSq()<1e-6)stickForward.copy(forward);
    stickForward.normalize();
  }});
  window.addEventListener('keydown',e=>{
    if(modalOpen()||e.ctrlKey||e.altKey||e.metaKey||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(e.target.closest('button,a')&&(e.code==='Enter'||e.code==='Space'))return;
    if(drivingKeys.has(e.code)){e.preventDefault();joystick.reset();explore();keys.add(e.code);manual();}
    if((e.code==='KeyE'||e.code==='Enter')&&!e.repeat){e.preventDefault();interact();}
    if(e.code==='KeyR'&&!e.repeat)reset();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();speed=0;});
  document.addEventListener('visibilitychange',()=>{hidden=document.hidden;keys.clear();speed=0;if(hidden)hologram.setActive(false);});
  let drag=null;
  renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};renderer.domElement.setPointerCapture(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;
    if(drag.moved){yaw-=dx*.005;pitch=THREE.MathUtils.clamp(pitch+dy*.004,-1.15,1.15);}
    drag.x=e.clientX;drag.y=e.clientY;
  });
  renderer.domElement.addEventListener('pointerup',e=>{
    if(drag&&!drag.moved){
      pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);
      const hit=raycaster.intersectObjects(world.pickables,false).find(hit=>{
        const p=stations.get(hit.object.userData.publicationId);return p&&frontFacing(p.userData.normal);
      });
      if(hit){const p=publications.find(p=>p.id===hit.object.userData.publicationId);if(nearby?.id===p.id)openPaper(p);else travel(p);}
    }
    drag=null;
  });
  for(const event of ['pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,()=>drag=null);
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.0007,.83,1.3);},{passive:false});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(animationFrame);hologram.dispose();failure(new Error('Graphics context lost. Reload to try the 3D world again.'));});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));});
  function updateCamera(dt,instant=false){
    const moving=Math.abs(speed)>.05||keys.size>0||route.length>0;
    if(moving&&!drag){const recenter=1-Math.exp(-dt*2.8);yaw=THREE.MathUtils.lerp(yaw,0,recenter);pitch=THREE.MathUtils.lerp(pitch,0,recenter);}
    const viewTilt=innerWidth<761&&nearby ? .24 : .32;
    cameraDirection.copy(normal).multiplyScalar(Math.cos(viewTilt)).addScaledVector(forward,-Math.sin(viewTilt));
    viewMatrix.lookAt(cameraDirection,origin,forward);wantedRotation.setFromRotationMatrix(viewMatrix);
    orbitRotation.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));wantedRotation.multiply(orbitRotation);
    // Frame-rate-independent camera damping: the globe stays centered while
    // the view takes a fraction of a second to catch up with the little rover.
    const damping=instant||reducedMotion?1:1-Math.exp(-dt*4.1);
    cameraRotation.slerp(wantedRotation,damping);
    const fraction=(innerWidth<761?.80:.69)*Math.min(1,camera.aspect);
    const fitted=radius/Math.sin(Math.atan(fraction*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))));
    distance=THREE.MathUtils.lerp(distance,fitted*zoom,instant?1:1-Math.exp(-dt*5));
    camera.position.set(0,0,distance).applyQuaternion(cameraRotation);camera.quaternion.copy(cameraRotation);camera.updateMatrixWorld();
    // Keep both hemispheres readable as the visitor drives around the globe.
    sun.position.set(-38,46,60).applyQuaternion(cameraRotation);fill.position.set(35,-12,20).applyQuaternion(cameraRotation);
  }
  function frontFacing(n){return n.dot(camera.position.clone().sub(world.surfacePoint(n)))>0;}
  function updateLabels(){
    const placed=[], headerBottom=$('.site-header').getBoundingClientRect().bottom;
    const previewBounds=hologram.getState().bounds;
    const nearbyBounds=$('#nearby').hidden?null:$('#nearby').getBoundingClientRect();
    inverseCamera.copy(camera.quaternion).invert();
    for(let i=0;i<publications.length;i++){
      const p=publications[i],group=stations.get(p.id),label=labels.get(p.id),n=group.userData.normal;
      group.localToWorld(projected.set(0,6.8,0));projected.project(camera);
      const x=(projected.x+1)*innerWidth/2,y=(1-projected.y)*innerHeight/2;
      let inView=frontFacing(n)&&projected.z<1&&x>-20&&x<innerWidth+20&&y>-40&&y<innerHeight-115&&nearby?.id!==p.id;
      const half=label.offsetWidth/2+8, left=THREE.MathUtils.clamp(x,half,innerWidth-half);let top=Math.max(y,headerBottom+label.offsetHeight+16);
      // Keep the compact research labels from covering one another on phones.
      for(const other of placed)if(Math.abs(left-other.x)<half+other.half&&Math.abs(top-other.y)<label.offsetHeight+12)top=other.y+label.offsetHeight+12;
      const labelBox={left:left-half+8,right:left+half-8,top:top-label.offsetHeight,bottom:top};
      const overlaps=box=>box&&labelBox.left<box.right+8&&labelBox.right>box.left-8&&labelBox.top<box.bottom+8&&labelBox.bottom>box.top-8;
      if(overlaps(previewBounds)||overlaps(nearbyBounds))inView=false;
      if(inView)placed.push({x:left,y:top,half});
      label.style.visibility=inView?'visible':'hidden';label.style.left=`${left}px`;label.style.top=`${top}px`;
      label.classList.toggle('near',nearby?.id===p.id);
      const m=n.clone().applyQuaternion(inverseCamera);mapMarkers[i].style.left=`${50+m.x*40}%`;mapMarkers[i].style.top=`${50-m.y*40}%`;mapMarkers[i].classList.toggle('far-side',m.z<0);
    }
    const m=normal.clone().applyQuaternion(inverseCamera);$('#map-rover').style.left=`${50+m.x*40}%`;$('#map-rover').style.top=`${50-m.y*40}%`;
    const f=forward.clone().applyQuaternion(inverseCamera);$('#map-rover').style.transform=`translate(-50%,-50%) rotate(${Math.atan2(f.x,f.y)*180/Math.PI}deg)`;
  }
  function updateNearby(){
    let nearest=null,best=Infinity;
    for(const p of publications){const d=surfaceDistance(normal,stations.get(p.id).userData.normal,radius);if(d<best){best=d;nearest=p;}}
    // A small hysteresis band prevents flicker, while allowing a closer flag
    // to take over where two preview zones overlap.
    const previousDistance=nearby?surfaceDistance(normal,stations.get(nearby.id).userData.normal,radius):Infinity;
    if(nearby&&previousDistance<9.3&&(best>8.2||previousDistance<best+.75))nearest=nearby;
    else if(best>8.2)nearest=null;
    if(nearest?.id!==nearby?.id){nearby=nearest;hologram.setPublication(nearby);}
    $('#nearby').hidden=!nearby;
    if(nearby){$('#nearby-title').textContent=nearby.shortTitle;$('#nearby-category').textContent=`HOLOGRAM ${nearby.index} / ${nearby.category}`;}
    const preview=hologram.getState();
    $('#preview-button').hidden=!nearby||preview.type!=='video';
    $('#preview-button').textContent=preview.error?'Preview unavailable':preview.playing?'Ⅱ Pause preview':'▷ Play preview';
    $('#preview-button').disabled=!!preview.error;
  }
  function tick(now){
    animationFrame=requestAnimationFrame(tick);const dt=Math.min((now-previous)/1000,.05);previous=now;
    if(hidden)return;const active=!modalOpen();elapsed+=dt;
    const stick=joystick.getState();
    if(active){
      if(statusTimer>0){statusTimer-=dt;if(statusTimer<=0)$('#drive-status').textContent='';}
      let throttle=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
      let steering=(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0);
      let targetSpeed=throttle*(throttle>0?6.8:3.3),turn=steering*dt*1.65*(speed<-.1?-1:1);
      if(route.length){
        const remaining=surfaceDistance(normal,route[0],radius);
        if(remaining<.3){
          route.shift();speed=0;
          if(!route.length){status(`ARRIVED AT ${destination.shortTitle} · Press E to read`,7);destination=null;}
        }
        if(route.length){
          const desired=tangentTowards(normal,route[0]);
          const difference=Math.atan2(normal.dot(new THREE.Vector3().crossVectors(forward,desired)),forward.dot(desired));
          turn=THREE.MathUtils.clamp(difference,-dt*2.4,dt*2.4);
          targetSpeed=Math.abs(difference)<.23?Math.min(6.2,surfaceDistance(normal,route[0],radius)*2.2):0;
          if(Math.abs(difference)>.23)speed=0;
        }
      }
      if(stick.active&&stick.magnitude>0){
        stickTransport.setFromUnitVectors(stickNormal,normal);
        stickForward.applyQuaternion(stickTransport).addScaledVector(normal,-stickForward.dot(normal)).normalize();
        stickNormal.copy(normal);
        stickRight.crossVectors(stickForward,normal).normalize();
        stickDesired.copy(stickForward).multiplyScalar(-stick.y).addScaledVector(stickRight,stick.x).normalize();
        const alignment=THREE.MathUtils.clamp(forward.dot(stickDesired),-1,1);
        const difference=Math.atan2(normal.dot(stickCross.crossVectors(forward,stickDesired)),alignment);
        turn=THREE.MathUtils.clamp(difference,-dt*3.4,dt*3.4);
        targetSpeed=6.8*stick.magnitude*Math.max(0,alignment)**2;
      }
      if(keys.has('Space'))targetSpeed=0;
      speed=THREE.MathUtils.lerp(speed,targetSpeed,1-Math.exp(-dt*(keys.has('Space')?14:5)));
      if(Math.abs(speed)<.02)speed=0;
      const next=advanceSurface(normal,forward,speed*dt,turn,radius);
      if(collision.isSafe(next.normal)){normal.copy(next.normal);forward.copy(next.forward);}
      else{
        forward.applyAxisAngle(normal,turn).normalize();speed=0;
        if(destination){const retry=destination;route=[];destination=null;travel(retry);}
        else if(throttle||stick.magnitude>0)status('A little room for the flag · steer around it',2);
      }
      poseRover();trackDistance+=Math.abs(speed)*dt;if(trackDistance>.65){addTracks();trackDistance=0;}
      updateNearby();
    }
    world.animate(elapsed,dt,active&&Math.abs(speed)>.05,reducedMotion||!active,camera);
    updateCamera(dt);hologram.setActive(active);hologram.update(camera,elapsed,reducedMotion);document.body.classList.toggle('has-hologram',hologram.getState().visible);updateLabels();renderer.render(scene,camera);
  }
  poseRover();updateCamera(0,true);renderer.render(scene,camera);$('#loading').hidden=true;
  animationFrame=requestAnimationFrame(tick);
  // Diagnostics deliberately expose no controls or mutable scene objects.
  window.__lunar={getState:()=>({ready:true,exploring:true,followRover:true,
    rover:{x:rover.position.x,y:rover.position.y,z:rover.position.z},normal:normal.toArray(),forward:forward.toArray(),
    surfaceError:Math.abs(rover.position.length()-world.surfaceRadius(normal)),orientationError:1-new THREE.Vector3(0,1,0).applyQuaternion(rover.quaternion).dot(normal),
    radius,roverScale:rover.scale.x,stationScale:world.stationGroups[0].scale.x,speed,joystick:joystick.getState(),
    cameraLag:cameraRotation.angleTo(wantedRotation),planetScreen:origin.clone().project(camera).toArray(),
    nearby:nearby?.id??null,destination:destination?.id??null,routePoints:route.length,preview:hologram.getState(),
    visited:[...visited],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,reducedMotion})};
  window.dispatchEvent(new Event('lunar:ready'));
}
boot().catch(failure);
