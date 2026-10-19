import * as THREE from './vendor/three.module.min.js';

const EPSILON = 1e-10;
const GRAPH_SAMPLES = 500;
const GRAPH_NEIGHBORS = 8;
const ENDPOINT_NEIGHBORS = 16;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const clampDot = value => Math.max(-1, Math.min(1, value));

function unitNormal(value) {
  const result = value.clone();
  if (result.lengthSq() < EPSILON * EPSILON) {
    throw new RangeError('A surface normal must have nonzero length.');
  }
  return result.normalize();
}

function anyTangent(normal) {
  // Use the least-aligned axis, so the fallback is stable even at the poles.
  const x = Math.abs(normal.x), y = Math.abs(normal.y), z = Math.abs(normal.z);
  const axis = x <= y && x <= z ? new THREE.Vector3(1, 0, 0)
    : y <= z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  return axis.addScaledVector(normal, -axis.dot(normal)).normalize();
}

function unitTangent(normal, direction) {
  const tangent = direction.clone().addScaledVector(normal, -direction.dot(normal));
  return tangent.lengthSq() > EPSILON * EPSILON ? tangent.normalize() : anyTangent(normal);
}

function validRadius(radius) {
  if (!(radius > 0) || !Number.isFinite(radius)) {
    throw new RangeError('The planet radius must be positive and finite.');
  }
  return radius;
}

/** Shortest surface distance, measured in the same world units as radius. */
export function surfaceDistance(a, b, radius = 18) {
  validRadius(radius);
  return Math.acos(clampDot(unitNormal(a).dot(unitNormal(b)))) * radius;
}

/** Unit heading in from's tangent plane; antipodal/equal points have a stable fallback. */
export function tangentTowards(from, to) {
  return unitTangent(unitNormal(from), unitNormal(to));
}

/** The rover's local +Y points out of the planet and its local -Z points forward. */
export function surfaceQuaternion(normal, forward) {
  const up = unitNormal(normal);
  const heading = unitTangent(up, forward);
  const right = new THREE.Vector3().crossVectors(heading, up).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, heading.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(basis).normalize();
}

/**
 * Steer about the local surface normal, then parallel-transport the rover along
 * a great circle. Distance is in world units, steering is in radians. Inputs
 * are never mutated; reverse motion and crossings of either pole are supported.
 */
export function advanceSurface(normal, forward, distance, steering = 0, radius = 18) {
  validRadius(radius);
  const nextNormal = unitNormal(normal);
  const nextForward = unitTangent(nextNormal, forward).applyAxisAngle(nextNormal, steering);
  const axis = new THREE.Vector3().crossVectors(nextNormal, nextForward).normalize();
  const angle = distance / radius;
  nextNormal.applyAxisAngle(axis, angle).normalize();
  nextForward.applyAxisAngle(axis, angle);
  return { normal: nextNormal, forward: unitTangent(nextNormal, nextForward) };
}

/**
 * Spherical-cap obstacle navigation. Obstacles use { normal, radius } with
 * radius in world units. route() returns cloned unit waypoints including start
 * and end, or [] if either endpoint is blocked or no route can be found.
 * The deterministic Fibonacci graph is created only when a direct path fails.
 */
export function createNavigator(radius, obstacles, clearance = 0.85) {
  validRadius(radius);
  const caps = obstacles.map(obstacle => ({
    normal: unitNormal(obstacle.normal),
    cosine: Math.cos(Math.min(Math.PI, Math.max(0, obstacle.radius + clearance) / radius)),
  }));
  let graph;

  function isSafeUnit(normal) {
    return caps.every(cap => normal.dot(cap.normal) < cap.cosine - EPSILON);
  }

  function isSafe(normal) {
    return isSafeUnit(unitNormal(normal));
  }

  function segmentIsSafe(a, b) {
    if (!isSafeUnit(a) || !isSafeUnit(b)) return false;
    const angle = Math.acos(clampDot(a.dot(b)));
    if (angle < EPSILON) return true;
    const tangent = unitTangent(a, b);
    // p(t) = a cos(t) + tangent sin(t). Find each cap center's maximum
    // dot product over the entire arc, not just samples that could miss a cap.
    for (const cap of caps) {
      const alongStart = cap.normal.dot(a);
      const alongTangent = cap.normal.dot(tangent);
      let closestAngle = Math.atan2(alongTangent, alongStart);
      if (closestAngle < 0) closestAngle += Math.PI * 2;
      const maximum = closestAngle <= angle
        ? Math.max(alongStart, cap.normal.dot(b), Math.hypot(alongStart, alongTangent))
        : Math.max(alongStart, cap.normal.dot(b));
      if (maximum >= cap.cosine - EPSILON) return false;
    }
    return true;
  }

  function buildGraph() {
    const nodes = [];
    for (let i = 0; i < GRAPH_SAMPLES; i++) {
      const y = 1 - 2 * (i + 0.5) / GRAPH_SAMPLES;
      const width = Math.sqrt(1 - y * y), longitude = i * GOLDEN_ANGLE;
      const normal = new THREE.Vector3(Math.cos(longitude) * width, y, Math.sin(longitude) * width);
      if (isSafeUnit(normal)) nodes.push(normal);
    }
    const nearest = nodes.map(() => []);
    function offer(list, index, dot) {
      if (list.length === GRAPH_NEIGHBORS && dot <= list[list.length - 1].dot) return;
      let insertion = 0;
      while (insertion < list.length && list[insertion].dot > dot) insertion++;
      list.splice(insertion, 0, { index, dot });
      if (list.length > GRAPH_NEIGHBORS) list.pop();
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dot = nodes[i].dot(nodes[j]);
        offer(nearest[i], j, dot);
        offer(nearest[j], i, dot);
      }
    }
    const edges = nodes.map(() => []), visited = new Set();
    for (let i = 0; i < nodes.length; i++) {
      for (const { index: j, dot } of nearest[i]) {
        const key = Math.min(i, j) * GRAPH_SAMPLES + Math.max(i, j);
        if (visited.has(key)) continue;
        visited.add(key);
        if (!segmentIsSafe(nodes[i], nodes[j])) continue;
        const distance = Math.acos(clampDot(dot)) * radius;
        edges[i].push({ index: j, distance });
        edges[j].push({ index: i, distance });
      }
    }
    return { nodes, edges };
  }

  function route(start, end) {
    const first = unitNormal(start), last = unitNormal(end);
    if (!isSafeUnit(first) || !isSafeUnit(last)) return [];
    if (segmentIsSafe(first, last)) return [first, last];
    graph ??= buildGraph();
    const nodes = [...graph.nodes, first, last];
    const edges = graph.edges.map(neighbors => neighbors.slice());
    const startIndex = graph.nodes.length, endIndex = startIndex + 1;
    edges.push([], []);
    for (const endpoint of [startIndex, endIndex]) {
      const candidates = graph.nodes.map((normal, index) => ({
        index, dot: normal.dot(nodes[endpoint]),
      })).sort((a, b) => b.dot - a.dot);
      let connections = 0;
      for (const { index, dot } of candidates) {
        if (!segmentIsSafe(nodes[endpoint], nodes[index])) continue;
        const distance = Math.acos(clampDot(dot)) * radius;
        edges[endpoint].push({ index, distance });
        edges[index].push({ index: endpoint, distance });
        if (++connections === ENDPOINT_NEIGHBORS) break;
      }
      if (!connections) return [];
    }

    const costs = new Float64Array(nodes.length).fill(Infinity);
    const estimates = new Float64Array(nodes.length).fill(Infinity);
    const parents = new Int32Array(nodes.length).fill(-1);
    const states = new Uint8Array(nodes.length);
    const open = [startIndex];
    costs[startIndex] = 0;
    estimates[startIndex] = surfaceDistance(first, last, radius);
    states[startIndex] = 1;
    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if (estimates[open[i]] < estimates[open[best]]) best = i;
      }
      const current = open.splice(best, 1)[0];
      if (current === endIndex) {
        const path = [];
        for (let index = current; index !== -1; index = parents[index]) path.push(nodes[index]);
        path.reverse();
        // Shortcut only along verified arcs. Every retained leg stays outside
        // the rover-expanded station/rock caps, including across the seam.
        const simplified = [path[0].clone()];
        for (let index = 0; index < path.length - 1;) {
          let next = path.length - 1;
          while (next > index + 1 && !segmentIsSafe(path[index], path[next])) next--;
          simplified.push(path[next].clone());
          index = next;
        }
        return simplified;
      }
      states[current] = 2;
      for (const neighbor of edges[current]) {
        if (states[neighbor.index] === 2) continue;
        const candidate = costs[current] + neighbor.distance;
        if (candidate >= costs[neighbor.index]) continue;
        costs[neighbor.index] = candidate;
        parents[neighbor.index] = current;
        estimates[neighbor.index] = candidate + surfaceDistance(nodes[neighbor.index], last, radius);
        if (states[neighbor.index] !== 1) {
          states[neighbor.index] = 1;
          open.push(neighbor.index);
        }
      }
    }
    return [];
  }

  return { isSafe, route };
}
