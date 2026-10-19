/** A single-pointer analog stick. Axes are right/down, with a radial dead zone. */
export function createJoystick(element, { onStart, onEnd } = {}) {
  const thumb = element.querySelector('.joystick-thumb');
  const deadZone = 0.13;
  let pointerId = null;
  let centerX = 0, centerY = 0, radius = 1;
  let x = 0, y = 0, magnitude = 0;

  function suppressDefault(event) {
    if (event.cancelable) event.preventDefault();
  }

  function update(event) {
    const dx = event.clientX - centerX, dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    const rawMagnitude = Math.min(1, length / radius);
    const directionX = length > 0 ? dx / length : 0;
    const directionY = length > 0 ? dy / length : 0;
    magnitude = Math.max(0, (rawMagnitude - deadZone) / (1 - deadZone));
    x = directionX * magnitude;
    y = directionY * magnitude;
    // Keep small finger movements visible, even inside the driving dead zone.
    element.style.setProperty('--stick-x', `${directionX * rawMagnitude * radius}px`);
    element.style.setProperty('--stick-y', `${directionY * rawMagnitude * radius}px`);
  }

  function reset() {
    const previousPointer = pointerId;
    // Clear ownership before release: lostpointercapture can also call reset.
    pointerId = null;
    x = 0; y = 0; magnitude = 0;
    element.classList.remove('is-active');
    element.style.setProperty('--stick-x', '0px');
    element.style.setProperty('--stick-y', '0px');
    if (previousPointer !== null) {
      try {
        if (element.hasPointerCapture(previousPointer)) element.releasePointerCapture(previousPointer);
      } catch {
        // The browser may already have discarded an interrupted pointer.
      }
      onEnd?.();
    }
  }

  element.addEventListener('pointerdown', event => {
    suppressDefault(event);
    if (pointerId !== null || event.button !== 0 || element.disabled) return;
    const bounds = element.getBoundingClientRect();
    const thumbWidth = thumb?.getBoundingClientRect().width || 0;
    centerX = bounds.left + bounds.width / 2;
    centerY = bounds.top + bounds.height / 2;
    radius = Math.max(1, (bounds.width - thumbWidth) / 2);
    pointerId = event.pointerId;
    element.classList.add('is-active');
    element.setPointerCapture(pointerId);
    onStart?.();
    if (pointerId === event.pointerId) update(event);
  });

  element.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    suppressDefault(event);
    update(event);
  });

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    element.addEventListener(type, event => {
      if (event.pointerId === pointerId) reset();
    });
  }
  // Scope iOS callout/selection suppression to the stick itself.
  element.addEventListener('touchstart', suppressDefault, { passive: false });
  element.addEventListener('contextmenu', suppressDefault);
  element.addEventListener('selectstart', suppressDefault);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  reset();
  return {
    getState: () => ({ active: pointerId !== null, x, y, magnitude }),
    reset,
  };
}
