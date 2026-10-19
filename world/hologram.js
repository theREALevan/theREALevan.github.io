import * as THREE from './vendor/three.module.min.js';

const WIDTH = 10;
const HEIGHT = WIDTH * 9 / 16;
const CYAN = 0x77f9ee;

/** A single, proximity-loaded research preview shared by every publication flag. */
export function createHologram(scene, world, { onChange } = {}) {
  const panel = new THREE.Group();
  panel.name = 'Publication hologram';
  panel.visible = false;
  scene.add(panel);
  const ownedGeometries = [], ownedMaterials = [];
  const ownGeometry = geometry => (ownedGeometries.push(geometry), geometry);
  const ownMaterial = material => (ownedMaterials.push(material), material);
  const plane = ownGeometry(new THREE.PlaneGeometry(WIDTH, HEIGHT));
  const backingMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0x032526, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, depthTest: false,
  }));
  const backing = new THREE.Mesh(plane, backingMaterial);
  backing.position.z = -0.035;
  panel.add(backing);
  const previewMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  const preview = new THREE.Mesh(plane, previewMaterial);
  preview.name = 'Hologram media';
  preview.visible = false;
  preview.renderOrder = 20;
  panel.add(preview);

  const corners = [], margin = 0.16, cornerLength = 0.75;
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      const px = x * (WIDTH / 2 + margin), py = y * (HEIGHT / 2 + margin);
      corners.push(px, py - y * cornerLength, 0.045, px, py, 0.045,
        px, py, 0.045, px - x * cornerLength, py, 0.045);
    }
  }
  const cornerGeometry = ownGeometry(new THREE.BufferGeometry());
  cornerGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
  const cornerMaterial = ownMaterial(new THREE.LineBasicMaterial({
    color: CYAN, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false,
  }));
  const frame = new THREE.LineSegments(cornerGeometry, cornerMaterial);
  frame.renderOrder = 22;
  panel.add(frame);

  // Keep publication text in the DOM at its final screen size. Rasterizing it
  // into a scene texture makes small captions blurry even on a sharp video.
  const caption = document.createElement('div');
  caption.className = 'hologram-caption';
  caption.hidden = true;
  Object.assign(caption.style, {
    position: 'fixed', boxSizing: 'border-box', height: '34px',
    pointerEvents: 'none', zIndex: '4',
  });
  document.body.append(caption);

  const beamGeometry = ownGeometry(new THREE.BufferGeometry());
  const beamPositions = new Float32Array(18);
  beamGeometry.setAttribute('position', new THREE.BufferAttribute(beamPositions, 3));
  const beamMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: CYAN, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.name = 'Hologram projector light';
  beam.frustumCulled = false;
  beam.visible = false;
  scene.add(beam);
  const rayGeometry = ownGeometry(new THREE.BufferGeometry());
  const rayPositions = new Float32Array(12);
  rayGeometry.setAttribute('position', new THREE.BufferAttribute(rayPositions, 3));
  const rays = new THREE.LineSegments(rayGeometry, ownMaterial(new THREE.LineBasicMaterial({
    color: CYAN, transparent: true, opacity: 0.23, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  rays.frustumCulled = false;
  rays.visible = false;
  scene.add(rays);

  let publication = null, station = null, active = true, disposed = false;
  let video = null, image = null, mediaTexture = null, type = null;
  let generation = 0, playSerial = 0, playPending = false;
  let pausedByUser = false, reducedPaused = false, reducedMotion = false;
  let blocked = false, error = null, ready = false;
  let removeMediaListeners = () => {};
  const cameraPosition = new THREE.Vector3(), cameraUp = new THREE.Vector3();
  const cameraQuaternion = new THREE.Quaternion(), surface = new THREE.Vector3();
  const normal = new THREE.Vector3(), facing = new THREE.Vector3();
  const projector = new THREE.Vector3(), left = new THREE.Vector3(), right = new THREE.Vector3();
  const topLeft = new THREE.Vector3(), topRight = new THREE.Vector3();
  const projectedCenter = new THREE.Vector3(), projectedAnchor = new THREE.Vector3();
  const cameraSpace = new THREE.Vector3();
  let layout = null;

  function getState() {
    return {
      id: publication?.id ?? null,
      type,
      playing: Boolean(video && !video.paused && !video.ended && video.readyState >= 2),
      currentTime: video && Number.isFinite(video.currentTime) ? video.currentTime : 0,
      blocked,
      visible: panel.visible,
      error,
      pausedByUser,
      reducedMotionPaused: reducedPaused,
      ready,
      bounds: panel.visible && layout ? { ...layout } : null,
    };
  }

  function changed() {
    if (!disposed) onChange?.(getState());
  }

  function shouldPlay() {
    return Boolean(!disposed && active && panel.visible && video && !pausedByUser && !reducedPaused && !error);
  }

  function stopPlayback() {
    playSerial++;
    playPending = false;
    video?.pause();
  }

  function playVideo() {
    if (!shouldPlay() || playPending || blocked || !video.paused) return;
    const target = video, token = generation, request = ++playSerial;
    playPending = true;
    let promise;
    try {
      promise = target.play();
    } catch (failure) {
      playPending = false;
      blocked = true;
      if (failure.name !== 'NotAllowedError') error = failure.message || 'The preview could not play.';
      changed();
      return;
    }
    Promise.resolve(promise).then(() => {
      if (token !== generation || target !== video || disposed) { target.pause(); return; }
      if (request !== playSerial) return;
      playPending = false;
      if (!shouldPlay()) { target.pause(); return; }
      blocked = false;
      changed();
    }).catch(failure => {
      if (token !== generation || target !== video || request !== playSerial || disposed) return;
      playPending = false;
      if (!shouldPlay() || failure.name === 'AbortError') return;
      blocked = true;
      if (failure.name !== 'NotAllowedError') error = failure.message || 'The preview could not play.';
      changed();
    });
  }

  function unloadMedia() {
    generation++;
    stopPlayback();
    removeMediaListeners();
    removeMediaListeners = () => {};
    if (video) {
      video.removeAttribute('src');
      video.load();
      video.remove();
      video = null;
    }
    if (image) { image.removeAttribute('src'); image = null; }
    previewMaterial.map = null;
    previewMaterial.needsUpdate = true;
    mediaTexture?.dispose();
    mediaTexture = null;
    ready = false;
    preview.visible = false;
  }

  function fitMedia(width, height) {
    const aspect = width > 0 && height > 0 ? width / height : WIDTH / HEIGHT;
    preview.scale.set(Math.min(1, aspect / (WIDTH / HEIGHT)), Math.min(1, (WIDTH / HEIGHT) / aspect), 1);
  }

  function loadMedia() {
    if (!publication?.media || !active || disposed || mediaTexture) return;
    const token = generation;
    if (type === 'video') {
      const target = document.createElement('video');
      video = target;
      target.muted = true;
      target.defaultMuted = true;
      target.loop = true;
      target.defaultPlaybackRate = Number(publication.playbackRate) || 1;
      target.playbackRate = target.defaultPlaybackRate;
      target.playsInline = true;
      target.preload = 'auto';
      target.crossOrigin = 'anonymous';
      target.disableRemotePlayback = true;
      target.setAttribute('muted', '');
      target.setAttribute('playsinline', '');
      target.setAttribute('webkit-playsinline', '');
      target.setAttribute('aria-hidden', 'true');
      target.tabIndex = -1;
      // A real attached element supports inline video textures on iOS Safari.
      Object.assign(target.style, {
        position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0',
        pointerEvents: 'none', zIndex: '-1',
      });
      document.body.append(target);
      mediaTexture = new THREE.VideoTexture(target);
      const loaded = () => {
        if (token !== generation || target !== video || disposed) return;
        ready = true;
        preview.visible = true;
        fitMedia(target.videoWidth, target.videoHeight);
        playVideo();
        changed();
      };
      const failed = () => {
        if (token !== generation || target !== video || disposed) return;
        error = 'This preview could not load.';
        stopPlayback();
        changed();
      };
      const playbackChanged = () => {
        if (token === generation && target === video) changed();
      };
      target.addEventListener('loadeddata', loaded);
      target.addEventListener('error', failed);
      target.addEventListener('playing', playbackChanged);
      target.addEventListener('pause', playbackChanged);
      removeMediaListeners = () => {
        target.removeEventListener('loadeddata', loaded);
        target.removeEventListener('error', failed);
        target.removeEventListener('playing', playbackChanged);
        target.removeEventListener('pause', playbackChanged);
      };
      target.src = publication.media;
      target.load();
    } else {
      const target = new Image();
      image = target;
      target.crossOrigin = 'anonymous';
      target.decoding = 'async';
      mediaTexture = new THREE.Texture(target);
      const loaded = () => {
        if (token !== generation || target !== image || disposed) return;
        mediaTexture.needsUpdate = true;
        ready = true;
        preview.visible = true;
        fitMedia(target.naturalWidth, target.naturalHeight);
        changed();
      };
      const failed = () => {
        if (token !== generation || target !== image || disposed) return;
        error = 'This preview could not load.';
        changed();
      };
      target.addEventListener('load', loaded);
      target.addEventListener('error', failed);
      removeMediaListeners = () => {
        target.removeEventListener('load', loaded);
        target.removeEventListener('error', failed);
      };
      target.src = publication.media;
    }
    mediaTexture.colorSpace = THREE.SRGBColorSpace;
    mediaTexture.minFilter = THREE.LinearFilter;
    mediaTexture.magFilter = THREE.LinearFilter;
    mediaTexture.generateMipmaps = false;
    previewMaterial.map = mediaTexture;
    previewMaterial.needsUpdate = true;
  }

  function setPublication(next) {
    if (disposed || (publication?.id ?? null) === (next?.id ?? null)) return;
    unloadMedia();
    publication = next;
    station = next ? (typeof world.stationGroups.get === 'function'
      ? world.stationGroups.get(next.id)
      : world.stationGroups.find(group => group.userData.publicationId === next.id)) : null;
    type = next?.media ? (/\.(mp4|webm)(?:[?#]|$)/i.test(next.media) ? 'video' : 'image') : null;
    pausedByUser = false;
    reducedPaused = reducedMotion;
    blocked = false;
    error = null;
    panel.visible = beam.visible = rays.visible = false;
    layout = null;
    caption.hidden = true;
    caption.textContent = next ? `${next.index || ''} · ${next.shortTitle || next.title}`.replace(/^ · /, '') : '';
    if (next) loadMedia();
    changed();
  }

  function setActive(value) {
    if (disposed || active === Boolean(value)) return;
    active = Boolean(value);
    if (!active) {
      panel.visible = beam.visible = rays.visible = false;
      caption.hidden = true;
      stopPlayback();
    } else {
      loadMedia();
      // The next update validates the station's visible hemisphere before play.
    }
    changed();
  }

  function update(camera, time, prefersReducedMotion = false) {
    if (disposed) return;
    if (reducedMotion !== Boolean(prefersReducedMotion)) {
      reducedMotion = Boolean(prefersReducedMotion);
      reducedPaused = reducedMotion;
      if (reducedPaused) stopPlayback();
    }
    if (!active || !publication || !station) { caption.hidden = true; return; }
    normal.copy(station.userData.normal).normalize();
    surface.copy(world.surfacePoint(normal));
    camera.getWorldPosition(cameraPosition);
    const visible = normal.dot(facing.copy(cameraPosition).sub(surface)) > 0;
    if (panel.visible !== visible) {
      panel.visible = beam.visible = rays.visible = visible;
      if (!visible) stopPlayback();
      changed();
    }
    if (!visible) { caption.hidden = true; return; }
    camera.getWorldQuaternion(cameraQuaternion);
    cameraUp.set(0, 1, 0).applyQuaternion(cameraQuaternion);
    panel.position.copy(surface).addScaledVector(normal, 3).addScaledVector(cameraUp, 9);
    panel.quaternion.copy(cameraQuaternion);

    // Retain the station's depth while placing the billboard in a readable,
    // reserved screen region. A world-unit-only panel becomes tiny on phones
    // and moves offscreen when the close-follow camera looks over a flag.
    const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
    const mobile = viewportWidth < 761;
    const pixelWidth = mobile ? Math.min(210, viewportWidth * .56) : Math.min(330, viewportWidth - 48);
    const pixelsPerUnit = pixelWidth / WIDTH;
    cameraSpace.copy(panel.position).applyMatrix4(camera.matrixWorldInverse);
    const naturalPixelWidth = WIDTH * viewportWidth * camera.projectionMatrix.elements[0]
      / (2 * Math.max(0.1, -cameraSpace.z));
    panel.scale.setScalar(pixelWidth / naturalPixelWidth);
    projectedCenter.copy(panel.position).project(camera);
    projectedAnchor.copy(surface).addScaledVector(normal, 6.8).project(camera);
    const anchorX = (projectedAnchor.x + 1) * viewportWidth / 2;
    const anchorY = (1 - projectedAnchor.y) * viewportHeight / 2;
    const halfWidth = pixelWidth / 2 + margin * pixelsPerUnit;
    const captionHeight = 34, captionGap = 7;
    const topExtent = (HEIGHT / 2 + margin) * pixelsPerUnit;
    const bottomExtent = HEIGHT / 2 * pixelsPerUnit + captionGap + captionHeight;
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? (mobile ? 110 : 75);
    const topLimit = headerBottom + 12;
    let bottomLimit = viewportHeight - (mobile ? 200 : 135);
    const nearbyHUD = document.getElementById('nearby');
    if (nearbyHUD && !nearbyHUD.hidden) {
      const hudTop = nearbyHUD.getBoundingClientRect().top;
      if (hudTop > topLimit + topExtent + bottomExtent) bottomLimit = Math.min(bottomLimit, hudTop - 18);
    }
    const minX = halfWidth + 20, maxX = viewportWidth - halfWidth - 20;
    const naturalX = (projectedCenter.x + 1) * viewportWidth / 2;
    const sideOffset = pixelWidth / 2 + 110;
    const roomOnRight = anchorX + sideOffset + halfWidth < viewportWidth - 20;
    const desiredX = mobile ? naturalX : anchorX + (roomOnRight ? sideOffset : -sideOffset);
    const naturalY = (1 - projectedCenter.y) * viewportHeight / 2;
    const desiredY = mobile ? Math.min(naturalY, anchorY - bottomExtent - 10) : naturalY;
    const x = THREE.MathUtils.clamp(desiredX, minX, Math.max(minX, maxX));
    const minY = topLimit + topExtent;
    const maxY = Math.max(minY, bottomLimit - bottomExtent);
    const y = THREE.MathUtils.clamp(desiredY, minY, maxY);
    projectedCenter.x = x / viewportWidth * 2 - 1;
    projectedCenter.y = 1 - y / viewportHeight * 2;
    panel.position.copy(projectedCenter.unproject(camera));
    layout = { left: x - halfWidth, top: y - topExtent, right: x + halfWidth,
      bottom: y + bottomExtent, mediaWidth: pixelWidth, captionHeight, mobile };
    Object.assign(caption.style, {
      left: `${x - pixelWidth / 2}px`, top: `${y + HEIGHT / 2 * pixelsPerUnit + captionGap}px`,
      width: `${pixelWidth}px`, fontSize: mobile ? '14px' : '16px',
    });
    caption.hidden = false;
    panel.updateMatrixWorld(true);
    projector.copy(surface).addScaledVector(normal, 0.65);
    left.set(-WIDTH / 2, -HEIGHT / 2, 0).applyMatrix4(panel.matrixWorld);
    right.set(WIDTH / 2, -HEIGHT / 2, 0).applyMatrix4(panel.matrixWorld);
    topLeft.set(-WIDTH / 2, HEIGHT / 2, 0).applyMatrix4(panel.matrixWorld);
    topRight.set(WIDTH / 2, HEIGHT / 2, 0).applyMatrix4(panel.matrixWorld);
    projector.toArray(beamPositions, 0); left.toArray(beamPositions, 3); right.toArray(beamPositions, 6);
    projector.toArray(beamPositions, 9); topLeft.toArray(beamPositions, 12); topRight.toArray(beamPositions, 15);
    beamGeometry.attributes.position.needsUpdate = true;
    projector.toArray(rayPositions, 0); left.toArray(rayPositions, 3);
    projector.toArray(rayPositions, 6); right.toArray(rayPositions, 9);
    rayGeometry.attributes.position.needsUpdate = true;
    // Cyan framing and projected light provide the hologram treatment without
    // scanlines obscuring text or details inside the actual research preview.
    beamMaterial.opacity = reducedMotion ? 0.045 : 0.045 + 0.008 * Math.sin(time * 1.5);
    if (shouldPlay()) playVideo();
  }

  function toggle() {
    if (disposed || !video) return getState();
    if (!video.paused || playPending) {
      pausedByUser = true;
      stopPlayback();
    } else {
      pausedByUser = false;
      reducedPaused = false;
      blocked = false;
      // A failed media download remains visible as an error; autoplay denial
      // can be recovered directly from this explicit user gesture.
      playVideo();
    }
    changed();
    return getState();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    unloadMedia();
    publication = station = null;
    panel.visible = beam.visible = rays.visible = false;
    panel.removeFromParent();
    beam.removeFromParent();
    rays.removeFromParent();
    caption.remove();
    ownedGeometries.forEach(geometry => geometry.dispose());
    ownedMaterials.forEach(material => material.dispose());
  }

  return { setPublication, setActive, update, toggle, getState, dispose };
}
