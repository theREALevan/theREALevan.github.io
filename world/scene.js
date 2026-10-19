import * as THREE from './vendor/three.module.min.js';

// Everything in this landscape is built from geometry; no models or texture downloads.
export function createWorld(scene, publications) {
  const root = new THREE.Group();
  root.name = 'Lunar research reserve';
  scene.add(root);
  const cream = new THREE.MeshStandardMaterial({ color: '#ece7d9', roughness: .86 });
  const white = new THREE.MeshStandardMaterial({ color: '#fff5df', roughness: .62 });
  const dark = new THREE.MeshStandardMaterial({ color: '#424748', roughness: .82 });
  const metal = new THREE.MeshStandardMaterial({ color: '#8a9393', metalness: .35, roughness: .52 });
  const orange = new THREE.MeshStandardMaterial({ color: '#e89467', roughness: .65 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#343b3f', roughness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: '#7caaae', metalness: .24, roughness: .16, transparent: true, opacity: .8 });
  const glow = new THREE.MeshStandardMaterial({ color: '#fbebbc', emissive: '#ffe1a0', emissiveIntensity: .65, roughness: .35 });
  const panel = new THREE.MeshStandardMaterial({ color: '#425b70', roughness: .37, metalness: .35 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
  const unitSphere = new THREE.SphereGeometry(1, 20, 14);
  const pickables = [], stationGroups = [], wheels = [], animated = [], flags = [], obstacles = [];
  let randomState = 7631;
  const random = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; };
  const radius = 18;
  const up = new THREE.Vector3(0,1,0);
  // The map is an exponential map around the north pole, in surface-distance units.
  function normalFromMap(x,z) {
    const r=Math.hypot(x,z);
    if(r<1e-9)return new THREE.Vector3(0,1,0);
    const angle=r/radius, scale=Math.sin(angle)/r;
    return new THREE.Vector3(x*scale,Math.cos(angle),z*scale);
  }
  function normalToMap(normal) {
    const n=normal.clone().normalize(), horizontal=Math.hypot(n.x,n.z);
    if(horizontal<1e-9)return n.y>=0?{x:0,z:0}:{x:Math.PI*radius,z:0};
    const distance=Math.atan2(horizontal,n.y)*radius;
    return {x:n.x/horizontal*distance,z:n.z/horizontal*distance};
  }
  const craters = [
    [1,-6,3.7,.15],[23,14,5.2,.23],[-25,-23,4.7,.22],[2,32,3.4,.19],
    [31,-15,4.1,.22],[-33,16,4.3,.23],[-10,23,2.3,.12],[14,-35,4.6,.2],
    [-4,-35,2.8,.15],[37,1,2.6,.15],[46,14,3.5,.19],[-36,-33,3.4,.18],
    [-5,47,4.1,.22],[18,-49,3.1,.17],[-46,3,2.6,.16],
  ].map(([x,z,r,d])=>({normal:normalFromMap(x,z),angularRadius:r/radius,depth:d*2.2}));
  function surfaceRadius(normal) {
    const length=normal.length()||1,nx=normal.x/length,ny=normal.y/length,nz=normal.z/length;
    let height=.035*Math.sin(nx*13+ny*5)*Math.cos(nz*11)+.018*Math.sin(nz*22+nx*8);
    for(const crater of craters) {
      const dot=THREE.MathUtils.clamp(nx*crater.normal.x+ny*crater.normal.y+nz*crater.normal.z,-1,1);
      const r=Math.acos(dot)/crater.angularRadius;
      if(r>2)continue;
      height-=crater.depth*Math.exp(-r*r*2.4);
      height+=crater.depth*.34*Math.exp(-Math.pow((r-1.02)/.2,2));
    }
    return radius+height;
  }
  function surfacePoint(normal,offset=0) {
    const n=normal.clone().normalize();
    return n.multiplyScalar(surfaceRadius(n)+offset);
  }
  function placeOnSphere(group,normal,scale=1,twist=0) {
    group.position.copy(surfacePoint(normal));
    group.quaternion.setFromUnitVectors(up,normal);
    group.rotateY(twist);group.scale.setScalar(scale);
    group.userData.normal=normal.clone();group.userData.surfaceScale=scale;
    return group;
  }
  function mesh(geometry, material, parent, x=0, y=0, z=0, scale) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const box = (parent, material, x,y,z,sx,sy,sz) => mesh(unitBox,material,parent,x,y,z,[sx,sy,sz]);
  const cylinder = (parent, material,x,y,z,r,h) => mesh(unitCylinder,material,parent,x,y,z,[r,h,r]);
  function rod(parent, material, a, b, radius=.05) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const m = mesh(unitCylinder,material,parent);
    m.position.copy(start).add(end).multiplyScalar(.5);
    m.scale.set(radius,start.distanceTo(end),radius);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
    return m;
  }
  function ring(parent,material,radius,tube,x=0,y=0,z=0) {
    const m = mesh(new THREE.TorusGeometry(radius,tube,8,64),material,parent,x,y,z);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  function textTexture(text, subtext, color='#e89467', variant='flag') {
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = variant === 'flag' ? 448 : 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#263638';
    ctx.font = '600 28px monospace'; ctx.fillText('LUNAR RESEARCH / E.Z.',42,57);
    ctx.fillRect(42,80,684,3);
    ctx.font = variant === 'flag' ? '600 230px Arial' : '600 84px Arial';
    ctx.fillText(text,35,variant === 'flag' ? 325 : 174);
    ctx.font = '500 23px monospace'; ctx.fillText(subtext.toUpperCase(),44,variant === 'flag' ? 404 : 222);
    ctx.lineWidth = 3; ctx.strokeStyle = '#263638';
    ctx.beginPath(); ctx.arc(676,variant === 'flag' ? 259 : 150,30,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(662,variant === 'flag' ? 259 : 150); ctx.lineTo(690,variant === 'flag' ? 259 : 150); ctx.moveTo(676,variant === 'flag' ? 245 : 136); ctx.lineTo(676,variant === 'flag' ? 273 : 164); ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  // A closed, gently cratered globe: the same surface continues beneath every hemisphere.
  const terrainGeometry=new THREE.IcosahedronGeometry(radius,18);
  const terrainPositions=terrainGeometry.attributes.position;
  const colors=[],n=new THREE.Vector3(),baseColor=new THREE.Color('#d8d3c7');
  for(let i=0;i<terrainPositions.count;i++) {
    n.fromBufferAttribute(terrainPositions,i).normalize();
    let shade=.99+.018*Math.sin(n.x*73+n.z*41)*Math.sin(n.y*39-n.x*17);
    for(const crater of craters) {
      const r=Math.acos(THREE.MathUtils.clamp(n.dot(crater.normal),-1,1))/crater.angularRadius;
      if(r<1.7)shade-=.30*Math.exp(-r*r*2)+.045*Math.exp(-Math.pow((r-.82)/.18,2));
    }
    const c=baseColor.clone().multiplyScalar(shade);colors.push(c.r,c.g,c.b);
    n.multiplyScalar(surfaceRadius(n));terrainPositions.setXYZ(i,n.x,n.y,n.z);
  }
  terrainGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  terrainGeometry.computeVertexNormals();terrainGeometry.computeBoundingSphere();
  const planet=mesh(terrainGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}),root);
  planet.name='Small spherical moon';

  // Uniform spherical sampling keeps the far side as detailed as the landing hemisphere.
  function randomNormal() {
    const y=random()*2-1,angle=random()*Math.PI*2,r=Math.sqrt(1-y*y);
    return new THREE.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r);
  }
  const stationNormals=publications.map(p=>normalFromMap(p.x,p.z));
  const habitatNormal=normalFromMap(-17,-7), startNormal=normalFromMap(2,17);
  const clearOfStations=normal=>stationNormals.every(n=>normal.angleTo(n)*radius>3.3)&&normal.angleTo(habitatNormal)*radius>5.5&&normal.angleTo(startNormal)*radius>3;
  const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#aeb1a5',roughness:1,flatShading:true}),145);
  const dummy=new THREE.Object3D();let rockCount=0;
  for(let i=0;i<600&&rockCount<145;i++) {
    const normal=randomNormal();if(!clearOfStations(normal))continue;
    const size=.13+Math.pow(random(),2)*.66;
    dummy.position.copy(surfacePoint(normal,size*.21));dummy.quaternion.setFromUnitVectors(up,normal);dummy.rotateY(random()*Math.PI*2);
    dummy.scale.set(size*(.8+random()*.6),size*.62,size);dummy.updateMatrix();rocks.setMatrixAt(rockCount++,dummy.matrix);
  }
  rocks.count=rockCount;rocks.castShadow=true;rocks.receiveShadow=true;root.add(rocks);
  const gravel=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#bcbeb2',roughness:1}),210);
  for(let i=0;i<210;i++) {
    const normal=randomNormal(),size=.025+random()*.075;
    dummy.position.copy(surfacePoint(normal,size*.15));dummy.quaternion.setFromUnitVectors(up,normal);dummy.rotateY(random()*Math.PI*2);
    dummy.scale.set(size,size*.4,size*1.7);dummy.updateMatrix();gravel.setMatrixAt(i,dummy.matrix);
  }
  gravel.receiveShadow=true;root.add(gravel);
  const route=new THREE.CatmullRomCurve3([
    new THREE.Vector3(2,0,17),new THREE.Vector3(11,0,9),new THREE.Vector3(20,0,-11),
    new THREE.Vector3(10,0,-24),new THREE.Vector3(-5,0,-20),new THREE.Vector3(-16,0,-14),
    new THREE.Vector3(-25,0,1),new THREE.Vector3(-16,0,12),
  ],true,'catmullrom',.35);
  const routeDots=new THREE.InstancedMesh(new THREE.CylinderGeometry(.06,.06,.028,8),new THREE.MeshStandardMaterial({color:'#dfaa7d',roughness:.9}),110);
  for(let i=0;i<110;i++) {
    const p=route.getPointAt(i/110),normal=normalFromMap(p.x,p.z);
    dummy.position.copy(surfacePoint(normal,.025));dummy.quaternion.setFromUnitVectors(up,normal);dummy.scale.set(1,1,1);dummy.updateMatrix();routeDots.setMatrixAt(i,dummy.matrix);
  }
  root.add(routeDots);
  for(const [x,z] of [[-7,15],[23,-4],[-12,-26],[31,24],[-35,-9],[4,48]]) {
    const g=placeOnSphere(new THREE.Group(),normalFromMap(x,z),.75);root.add(g);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod(g,metal,[0,.65,0],[Math.cos(a)*.5,.06,Math.sin(a)*.5],.025);}
    cylinder(g,cream,0,.8,0,.15,.45);mesh(unitSphere,orange,g,0,1.08,0,[.12,.12,.12]);
  }

  // A small six-wheel survey rover, with visible rocker arms and an open instrument rack.
  const rover = new THREE.Group(); rover.name='Survey rover'; root.add(rover);
  placeOnSphere(rover,startNormal,1.5);
  box(rover,dark,0,.86,0,1.65,.3,2.5);
  box(rover,cream,0,1.13,0,1.78,.48,2.72);
  box(rover,orange,0,1.36,.13,1.82,.12,2.36);
  box(rover,cream,0,1.72,-.45,1.55,.7,1.42);
  const windscreen=box(rover,glass,0,1.92,-1.165,1.34,.51,.04); windscreen.rotation.x=-.1;
  box(rover,glass,-.782,1.92,-.44,.035,.5,1.05); box(rover,glass,.782,1.92,-.44,.035,.5,1.05);
  box(rover,white,0,2.15,-.44,1.68,.12,1.58);
  for(const x of [-.78,.78]) {
    rod(rover,white,[x,1.45,-1.15],[x,2.14,-1.1],.045);
    rod(rover,white,[x,1.45,.22],[x,2.14,.22],.045);
    box(rover,orange,x,1.52,-.44,.065,.12,1.42);
    rod(rover,metal,[x*.75,1.13,-.5],[x*1.35,.62,-1.03],.075);
    rod(rover,metal,[x*.75,1.13,-.5],[x*1.35,.62,.22],.075);
    rod(rover,metal,[x*.75,1.13,.5],[x*1.35,.62,1.16],.075);
    for(const z of [-1.02,.14,1.22]) {
      const wheel = new THREE.Group(); wheel.position.set(x<0?-1.06:1.06,.55,z); rover.add(wheel); wheels.push(wheel);
      const tire=mesh(new THREE.CylinderGeometry(.47,.47,.34,20),rubber,wheel); tire.rotation.z=Math.PI/2;
      for(const side of [-1,1]) {
        const hub=mesh(new THREE.CylinderGeometry(.24,.24,.025,12),cream,wheel,side*.18,0,0); hub.rotation.z=Math.PI/2;
        const cap=mesh(new THREE.CylinderGeometry(.09,.09,.035,12),orange,wheel,side*.2,0,0); cap.rotation.z=Math.PI/2;
      }
      for(let j=0;j<12;j++) {
        const a=j/12*Math.PI*2;
        const tread=box(wheel,dark,0,Math.cos(a)*.455,Math.sin(a)*.455,.36,.065,.1); tread.rotation.x=-a;
      }
    }
  }
  box(rover,dark,0,.99,-1.5,1.98,.11,.18);
  for(const x of [-.62,.62]){box(rover,dark,x,1.39,-1.385,.37,.22,.08);box(rover,glow,x,1.39,-1.435,.27,.12,.035);}
  box(rover,cream,0,1.6,.82,1.4,.38,.8);
  const roverSolar=new THREE.Group(); roverSolar.position.set(0,1.88,.83); roverSolar.rotation.x=.13; rover.add(roverSolar);
  box(roverSolar,white,0,0,0,1.66,.08,1.05);box(roverSolar,panel,0,.05,0,1.56,.03,.95);
  for(let x=-.6;x<=.61;x+=.3)box(roverSolar,metal,x,.07,0,.012,.012,.95);
  for(const z of [-.23,.23])box(roverSolar,metal,0,.07,z,1.56,.012,.012);
  rod(rover,metal,[.62,1.43,.9],[.62,3.12,.9],.025);mesh(unitSphere,orange,rover,.62,3.13,.9,[.085,.085,.085]);
  rod(rover,white,[-.65,1.5,.45],[-.65,2.73,.45],.055);
  box(rover,dark,-.65,2.78,.37,.32,.19,.25);mesh(unitSphere,glass,rover,-.65,2.78,.22,[.08,.08,.035]);
  const roverMark=new THREE.Mesh(new THREE.PlaneGeometry(.72,.26),new THREE.MeshBasicMaterial({map:textTexture('EZ–01','FIELD NOTES','#e9e6d7','badge')}));
  roverMark.position.set(0,1.72,-1.201);roverMark.rotation.y=Math.PI;rover.add(roverMark);

  // Seat the oversized toy rover on the curved surface rather than above it.
  for(const component of rover.children)component.position.y-=.12;

  // The research stations are the publications: every visible component shares a pick ID.
  const fallbackColors=['#e9a382','#a8c9b4','#bdb0d2','#9bbfc7'];
  publications.forEach((publication,i)=>{
    const color=publication.color || fallbackColors[i%4];
    const accent=new THREE.MeshStandardMaterial({color,roughness:.54});
    const accentLight=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.3,roughness:.45});
    const group=placeOnSphere(new THREE.Group(),stationNormals[i],1.22);
    group.name=publication.shortTitle;group.userData.publicationId=publication.id;root.add(group);stationGroups.push(group);
    obstacles.push({normal:stationNormals[i].clone(),radius:2.65});
    cylinder(group,cream,0,-.005,0,2.15,.28); cylinder(group,white,0,.15,0,1.92,.12);
    ring(group,accentLight,2.02,.048,0,.24,0);
    for(let j=0;j<4;j++) {const a=j*Math.PI/2+.4;box(group,accent,Math.sin(a)*1.8,.24,Math.cos(a)*1.8,.17,.04,.17);}
    cylinder(group,dark,0,.31,0,.96,.28); cylinder(group,cream,0,.51,0,.88,.16);
    const sculpture = new THREE.Group();sculpture.position.y=.72;group.add(sculpture);
    if(i%4===0) {
      // A spatial memory, with retrieved fragments hovering above the archive.
      for(let row=0;row<3;row++)for(let col=0;col<3;col++) {
        const tile=box(sculpture,(row+col)%3===0?accent:cream,(col-1)*.51,.3+row*.52,0,.43,.43,.17);
        tile.rotation.y=(col-1)*.12;
      }
      for(let j=0;j<4;j++){
        const tile=box(sculpture,j%2?accent:glass,Math.cos(j*1.7)*.9,1.85+Math.sin(j)*.25,Math.sin(j*1.7)*.6,.34,.34,.13);tile.rotation.set(.1,j*.3,.12);
      }
      rod(sculpture,metal,[-.8,.05,0],[-.8,1.48,0],.018);
      rod(sculpture,metal,[.8,.05,0],[.8,1.48,0],.018);
    } else if(i%4===1) {
      mesh(new THREE.IcosahedronGeometry(.42,1),white,sculpture,0,1.05,0);
      for(let j=0;j<3;j++){
        const orbit=new THREE.Group();orbit.position.y=1.05;orbit.rotation.set(j*.8,.4+j*.85,j*.7);sculpture.add(orbit);
        ring(orbit,j===1?white:accent,.82+j*.1,.035);
        mesh(unitSphere,accent,orbit,.82+j*.1,0,0,[.13,.13,.13]);
      }
    } else if(i%4===2) {
      // Interlocking architectural vaults, a miniature world in a miniature world.
      for(let j=0;j<3;j++){
        const arch=new THREE.Group();arch.position.set((j-1)*.55,.35,(j-1)*.28);arch.rotation.y=.3;sculpture.add(arch);
        const archTop=mesh(new THREE.TorusGeometry(.42,.105,8,24,Math.PI),j===1?accent:cream,arch,0,.57,0);
        for(const x of [-.42,.42])box(arch,j===1?accent:cream,x,.24,0,.21,.65,.21);
      }
      box(sculpture,accent,0,.05,0,1.7,.1,1.28);
      mesh(new THREE.IcosahedronGeometry(.2,0),accent,sculpture,.65,1.6,-.2);
    } else {
      const core=mesh(new THREE.IcosahedronGeometry(.43,0),white,sculpture,0,.9,0);core.rotation.z=.3;
      for(let j=0;j<3;j++){
        const a=j*Math.PI*2/3+.5, x=Math.cos(a)*1.1,z=Math.sin(a)*1.1;
        box(sculpture,accent,x,.9,z,.26,.22,.3);
        for(const [dx,dy] of [[-.42,-.42],[-.42,.42],[.42,-.42],[.42,.42]])rod(sculpture,accent,[x,.9,z],[dx,.9+dy,0],.012);
      }
      ring(sculpture,accent,1.15,.025,0,.15,0);
    }
    animated.push({object:sculpture,baseY:.72,phase:i*.8});
    // Tall, pleasantly oversized survey flags remain recognizable in the overview.
    cylinder(group,metal,-1.55,2.65,-.45,.048,5.25);
    cylinder(group,white,-1.55,.42,-.45,.18,.65);
    mesh(unitSphere,accent,group,-1.55,5.33,-.45,[.095,.095,.095]);
    const flagGeometry=new THREE.PlaneGeometry(2.85,1.66,18,8);
    const flagMaterial=new THREE.MeshStandardMaterial({map:textTexture(String(i+1).padStart(2,'0'),publication.shortTitle.slice(0,28),color),roughness:.9,side:THREE.DoubleSide});
    const flagPivot=new THREE.Group();flagPivot.position.set(-1.55,0,-.45);group.add(flagPivot);
    const flag=mesh(flagGeometry,flagMaterial,flagPivot,1.435,4.32,0);
    flags.push({object:flag,pivot:flagPivot,station:group,original:Float32Array.from(flagGeometry.attributes.position.array),phase:i*.7});
    rod(flagPivot,metal,[0,5.16,0],[1.5,5.16,0],.025);
    // White threshold and a lit interaction marker at the approach.
    box(group,cream,0,.16,2.3,1.24,.14,.56);box(group,accentLight,0,.25,2.3,.52,.025,.12);
    group.traverse(object=>{object.userData.publicationId=publication.id;if(object.isMesh)pickables.push(object);});
  });

  // Home base: a low observatory, with an airlock, a communications dish, and solar arrays.
  const habitat=placeOnSphere(new THREE.Group(),habitatNormal,.72,-.28);root.add(habitat);
  cylinder(habitat,dark,0,.07,0,3.18,.66);cylinder(habitat,cream,0,.62,0,3,.66);
  const dome=mesh(new THREE.SphereGeometry(2.94,32,16,0,Math.PI*2,0,Math.PI/2),white,habitat,0,.92,0);dome.scale.y=.78;
  const domeRibs=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(2.97,12,5,0,Math.PI*2,0,Math.PI/2),18),new THREE.LineBasicMaterial({color:'#c1c5b9',transparent:true,opacity:.8}));
  domeRibs.position.y=.93;domeRibs.scale.y=.78;habitat.add(domeRibs);
  ring(habitat,orange,2.97,.055,0,.95,0);
  const windowGeometry=new THREE.SphereGeometry(2.963,16,8,.45,1.1,.68,.4);
  const habitatWindow=mesh(windowGeometry,glass,habitat,0,.93,0);habitatWindow.scale.y=.78;
  box(habitat,cream,0,.78,2.82,1.75,1.55,2.12);box(habitat,dark,0,.85,3.9,1.26,1.4,.08);
  box(habitat,glass,0,1.13,3.96,.88,.65,.05);box(habitat,orange,0,.36,3.96,.88,.28,.05);
  box(habitat,white,0,1.63,3.85,1.84,.12,.48);box(habitat,glow,0,1.55,4.05,.85,.045,.04);
  for(let j=0;j<3;j++)box(habitat,cream,0,.1+j*.09,4.65-j*.23,1.7,.15,.42);
  // Panel grids catch light differently to the matt moon dust.
  for(const sx of [-1,1]) {
    const array=new THREE.Group();array.position.set(sx*5,.91,-.9);array.rotation.z=sx*.17;habitat.add(array);
    for(const px of [-1,1])rod(array,metal,[px,-.8,0],[px,0,0],.05);
    box(array,white,0,0,0,3.25,.1,2.8);box(array,panel,0,.065,0,3.1,.04,2.65);
    for(let k=-1.25;k<1.26;k+=.5)box(array,metal,k,.09,0,.022,.012,2.64);
    for(let k=-1;k<1.01;k+=.5)box(array,metal,0,.09,k,3.1,.012,.022);
  }
  const dish=new THREE.Group();dish.position.set(3.55,0,-3);habitat.add(dish);
  cylinder(dish,cream,0,.15,0,.7,.3);
  rod(dish,metal,[0,.2,0],[0,2.8,0],.07);
  const dishHead=new THREE.Group();dishHead.position.y=2.65;dishHead.rotation.set(-.45,0,-.22);dish.add(dishHead);
  const bowl=mesh(new THREE.SphereGeometry(1.2,24,8,0,Math.PI*2,0,Math.PI*.34),white,dishHead,0,.18,0);bowl.scale.y=-.42;
  ring(dishHead,metal,1.05,.025,0,-.07,0);
  for(let j=0;j<3;j++){const a=j*Math.PI*2/3;rod(dishHead,metal,[Math.cos(a)*.98,-.05,Math.sin(a)*.98],[0,.95,0],.018);}
  mesh(unitSphere,orange,dishHead,0,.96,0,[.13,.16,.13]);
  for(const x of [-2,2]){cylinder(habitat,metal,x,.72,4.6,.035,1.4);mesh(unitSphere,glow,habitat,x,1.46,4.6,[.09,.09,.09]);}
  obstacles.push({normal:habitatNormal.clone(),radius:2.75});

  // Reflectors around the entire planet make a full circumnavigation feel inhabited.
  for(let i=0;i<18;i++) {
    const y=1-2*(i+.5)/18,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y);
    const normal=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
    if(!clearOfStations(normal))continue;
    const g=placeOnSphere(new THREE.Group(),normal,.7,a);root.add(g);
    cylinder(g,metal,0,.3,0,.035,.6);box(g,i%3===0?orange:cream,0,.58,0,.23,.13,.05);
  }
  // Bake repeated static shapes into instance batches, retaining moving and pickable groups.
  function instanceRepeated(parent, excluded=new Set()) {
    parent.updateWorldMatrix(true,true);
    const inverse=new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const batches=new Map();
    function collect(object) {
      if(excluded.has(object))return;
      if(object.isMesh && !object.isInstancedMesh && !Array.isArray(object.material)) {
        const key=object.geometry.uuid+object.material.uuid;
        if(!batches.has(key))batches.set(key,[]);
        batches.get(key).push(object);
      }
      for(const child of object.children)collect(child);
    }
    for(const child of parent.children)collect(child);
    for(const objects of batches.values()) {
      if(objects.length<3)continue;
      const instances=new THREE.InstancedMesh(objects[0].geometry,objects[0].material,objects.length);
      objects.forEach((object,index)=>{instances.setMatrixAt(index,new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld));object.removeFromParent();});
      instances.castShadow=true;instances.receiveShadow=true;parent.add(instances);
    }
  }
  instanceRepeated(root,new Set([rover,...stationGroups]));
  for(const wheel of wheels)instanceRepeated(wheel);
  const flagViewPoint=new THREE.Vector3();
  function animate(time,dt,moving,reducedMotion=false,camera=null) {
    if(moving)for(const wheel of wheels)wheel.rotation.x -= dt*6.5;
    // Swivel around the radial pole so the front of the cloth remains legible.
    // This follows deliberate camera movement, including with ambient motion disabled.
    if(camera)for(const item of flags) {
      camera.getWorldPosition(flagViewPoint);
      item.station.worldToLocal(flagViewPoint);flagViewPoint.sub(item.pivot.position);
      if(Math.hypot(flagViewPoint.x,flagViewPoint.z)>1e-6)item.pivot.rotation.y=Math.atan2(flagViewPoint.x,flagViewPoint.z);
    }
    if(reducedMotion)return;
    for(const item of animated){item.object.rotation.y=time*.16+item.phase;item.object.position.y=item.baseY+Math.sin(time*.8+item.phase)*.07;}
    for(const item of flags){
      const position=item.object.geometry.attributes.position;
      for(let i=0;i<position.count;i++){
        const x=item.original[i*3],y=item.original[i*3+1],t=(x+1.425)/2.85;
        position.setZ(i,Math.sin(t*4.1-time*1.3+item.phase+y*.7)*.13*t+Math.sin(t*8.5-time*1.7)*.035*t);
      }
      position.needsUpdate=true;item.object.geometry.computeVertexNormals();
    }
  }
  return {radius,root,rover,wheels,stationGroups,pickables,surfacePoint,surfaceRadius,normalFromMap,normalToMap,animate,obstacles};
}
