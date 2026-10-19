import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as THREE from '../world/vendor/three.module.min.js';
import {
  advanceSurface, createNavigator, surfaceDistance, surfaceQuaternion, tangentTowards,
} from '../world/spherical-motion.js';

const RADIUS = 18;
const vector = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const close = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`,
);
const closeVector = (actual, expected, tolerance = 1e-8) => assert.ok(
  actual.distanceTo(expected) < tolerance,
  `${actual.toArray()} differs from ${expected.toArray()}`,
);
function checkFrame(normal, forward) {
  close(normal.length(), 1);
  close(forward.length(), 1);
  close(normal.dot(forward), 0);
  const quaternion = surfaceQuaternion(normal, forward);
  close(quaternion.length(), 1);
  closeVector(new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion), normal);
  closeVector(new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion), forward);
}

// A full great circle crosses both poles and returns with the original heading.
const start = vector(1, 0, 0), heading = vector(0, 1, 0);
let state = { normal: start.clone(), forward: heading.clone() };
for (let step = 0; step < 4096; step++) {
  state = advanceSurface(state.normal, state.forward, 2 * Math.PI * RADIUS / 4096);
  checkFrame(state.normal, state.forward);
  if (step === 1023) closeVector(state.normal, vector(0, 1, 0));
  if (step === 3071) closeVector(state.normal, vector(0, -1, 0));
}
closeVector(state.normal, start);
closeVector(state.forward, heading);
closeVector(start, vector(1, 0, 0));
closeVector(heading, vector(0, 1, 0));

// Reverse preserves the transported orientation; steering works at either pole.
for (const normal of [vector(0, 1, 0), vector(0, -1, 0), vector(1, 2, 3)]) {
  for (const target of [normal, normal.clone().negate(), vector(-2, 3, 1)]) {
    const forward = tangentTowards(normal, target);
    checkFrame(normal, forward);
    const moved = advanceSurface(normal, forward, 7.3, 0.47);
    checkFrame(moved.normal, moved.forward);
    const reversed = advanceSurface(moved.normal, moved.forward, -7.3);
    closeVector(reversed.normal, normal);
    closeVector(reversed.forward, forward.clone().applyAxisAngle(normal, 0.47));
  }
}
close(surfaceDistance(start, start.clone().negate()), Math.PI * RADIUS);
close(surfaceDistance(start, vector(0, 1, 0)), Math.PI * RADIUS / 2);
const unnormalized = new THREE.Vector3(2, 0, 0);
close(surfaceDistance(unnormalized, vector(0, 1, 0)), Math.PI * RADIUS / 2);
close(unnormalized.length(), 2);

const obstacles = [
  { normal: vector(1, 0, 0), radius: 1.7 },
  { normal: vector(1, 0.15, 0.2), radius: 1.7 },
  { normal: vector(0, 1, 0), radius: 1.7 },
  { normal: vector(-1, 0, 0), radius: 1.7 },
];
const originals = obstacles.map(obstacle => obstacle.normal.clone());
const navigator = createNavigator(RADIUS, obstacles, 0.85);
assert.equal(navigator.isSafe(vector(1, 0, 0)), false);
assert.equal(navigator.isSafe(vector(0, 0, 1)), true);
assert.deepEqual(navigator.route(vector(1, 0, 0), vector(0, 0, 1)), []);

function checkRoute(route, from, to) {
  assert.ok(route.length >= 2, 'A route must reach its destination.');
  closeVector(route[0], from);
  closeVector(route.at(-1), to);
  assert.notEqual(route[0], from);
  assert.notEqual(route.at(-1), to);
  for (let index = 1; index < route.length; index++) {
    const normal = route[index - 1], target = route[index];
    const forward = tangentTowards(normal, target);
    const distance = surfaceDistance(normal, target);
    // Independently sample more densely than the requested 0.6 world units.
    const steps = Math.max(1, Math.ceil(distance / 0.1));
    for (let step = 0; step <= steps; step++) {
      const point = advanceSurface(normal, forward, distance * step / steps).normal;
      assert.ok(navigator.isSafe(point), 'Route intersects an expanded obstacle.');
      for (const obstacle of obstacles) {
        assert.ok(surfaceDistance(point, obstacle.normal) > obstacle.radius + 0.85 - 1e-8);
      }
    }
  }
}

const routes = [
  [vector(1, 0, -0.6), vector(1, 0, 0.6)], // Blocked direct route across a flag.
  [vector(0, 1, -0.6), vector(0, 1, 0.6)], // Detour around the north pole.
  [vector(-1, 0, -0.6), vector(-1, 0, 0.6)], // Detour across the longitude seam.
  [vector(0, 0, -1), vector(0, 0, 1)], // Antipodal endpoints.
  [vector(0, -1, 0), vector(0, -1, 0.5)], // Direct route.
];
const timings = [];
for (const [from, to] of routes) {
  const before = performance.now();
  const route = navigator.route(from, to);
  timings.push(Number((performance.now() - before).toFixed(2)));
  checkRoute(route, from, to);
  assert.deepEqual(navigator.route(from, to).map(point => point.toArray()), route.map(point => point.toArray()));
}
assert.equal(navigator.route(...routes.at(-1)).length, 2);
for (let index = 0; index < obstacles.length; index++) closeVector(obstacles[index].normal, originals[index]);
// The navigator owns its obstacle snapshot and returned route coordinates.
const mutableObstacle = { normal: vector(0, 1, 0), radius: 1.7 };
const snapshot = createNavigator(RADIUS, [mutableObstacle]);
mutableObstacle.normal.set(0, -1, 0);
assert.equal(snapshot.isSafe(vector(0, 1, 0)), false);
assert.equal(snapshot.isSafe(vector(0, -1, 0)), true);

console.log(JSON.stringify({
  passed: true,
  checks: ['circumnavigation', 'poles', 'reverse', 'orthonormal rover frame', 'input immutability',
    'flag avoidance', 'polar route', 'seam route', 'antipodal route', 'deterministic route'],
  routeMilliseconds: timings,
  coldGraphWithin100ms: timings[0] < 100,
}, null, 2));
