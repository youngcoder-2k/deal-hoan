import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = 'lib/ui/home-motion.ts';
assert.ok(existsSync(source), 'Homepage scroll-motion controller exists');
const output = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function fixture({ reduced = false, mobile = false, supported = true } = {}) {
  const queries = new Map();
  const media = query => { if (!queries.has(query)) queries.set(query, { matches: query.includes('reduced-motion') ? reduced : mobile, listeners: new Set(), addEventListener(_, fn) { this.listeners.add(fn); }, removeEventListener(_, fn) { this.listeners.delete(fn); } }); return queries.get(query); };
  const targets = [0, 1100, 1200].map((top, i) => ({ dataset: { motion: i === 2 ? 'right' : 'rise', motionDelay: '180' }, animations: [], getBoundingClientRect: () => ({ top, bottom: top + 200 }), contains: el => el === targets[i], animate(frames, options) { let resolve; const a = { frames, options, cancelled: false, finished: new Promise(r => { resolve = r; }), cancel() { this.cancelled = true; }, complete() { resolve(); } }; this.animations.push(a); return a; } }));
  const listeners = new Map();
  const root = { dataset: {}, querySelectorAll: () => targets, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const observers = [];
  class Observer { constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); observers.push(this); } observe(el) { this.observed.add(el); } unobserve(el) { this.observed.delete(el); } disconnect() { this.observed.clear(); } enter(el) { this.callback([{ target: el, isIntersecting: true }]); } }
  const sandbox = { exports: {}, window: { innerHeight: 900, matchMedia: media }, document: { activeElement: null }, HTMLElement: Object, IntersectionObserver: supported ? Observer : undefined, Math };
  sandbox.window.IntersectionObserver = sandbox.IntersectionObserver;
  vm.runInNewContext(output, sandbox);
  const cleanup = sandbox.exports.setupHomeMotion(root);
  return { targets, root, listeners, observers, media, cleanup, behavior: sandbox.exports.homeScrollBehavior };
}
let checks = 0;
function check(name, fn) { fn(); console.log(`PASS ${name}`); checks++; }
check('SSR/null root is harmless', () => { const sandbox = { exports: {} }; vm.runInNewContext(output, sandbox); assert.equal(typeof sandbox.exports.setupHomeMotion(null), 'function'); });
check('No animation for initially visible content; offscreen targets observed', () => { const f = fixture(); assert.equal(f.targets[0].animations.length, 0); assert.equal(f.observers[0].observed.size, 2); f.cleanup(); });
check('Scroll reveal plays once and unobserves target', () => { const f = fixture(); const el = f.targets[1]; f.observers[0].enter(el); f.observers[0].enter(el); assert.equal(el.animations.length, 1); assert.equal(el.dataset.motionState, 'entered'); assert.equal(f.observers[0].observed.has(el), false); f.cleanup(); });
check('Desktop uses restrained directional reveal and bounded stagger', () => { const f = fixture(); f.observers[0].enter(f.targets[2]); const a = f.targets[2].animations[0]; assert.ok(a.frames[0].transform.includes('28px')); assert.equal(a.options.delay, 180); assert.equal(a.options.fill, 'backwards'); f.cleanup(); });
check('Mobile has shorter duration/distance and delay', () => { const f = fixture({mobile:true}); f.observers[0].enter(f.targets[2]); const a = f.targets[2].animations[0]; assert.ok(a.frames[0].transform.includes('16px')); assert.ok(a.options.duration <= 550); assert.ok(a.options.delay <= 120); f.cleanup(); });
check('Reduced motion and missing observer keep content available', () => { for (const opts of [{reduced:true}, {supported:false}]) { const f = fixture(opts); assert.equal(f.observers.length, 0); assert.notEqual(f.root.dataset.homeMotion, 'on'); f.cleanup(); } });
check('Keyboard focus cancels pending reveal, including active animation', () => { const f = fixture(); f.observers[0].enter(f.targets[1]); f.listeners.get('focusin')({target:f.targets[1]}); assert.equal(f.targets[1].animations[0].cancelled, true); f.cleanup(); });
check('Changing motion preference stops all animations and observer', () => { const f = fixture(); f.observers[0].enter(f.targets[1]); const m = f.media('(prefers-reduced-motion: reduce)'); m.matches = true; for (const fn of m.listeners) fn(); assert.equal(f.root.dataset.homeMotion, 'off'); assert.equal(f.targets[1].animations[0].cancelled, true); assert.equal(f.observers[0].observed.size, 0); f.cleanup(); });
check('Unmount cleans observer, animations, listeners and attributes', () => { const f = fixture(); f.observers[0].enter(f.targets[2]); f.cleanup(); assert.equal(f.observers[0].observed.size, 0); assert.equal(f.listeners.size, 0); assert.equal(f.root.dataset.homeMotion, undefined); assert.ok(f.targets.every(el => el.dataset.motionState === undefined)); });
check('Explicit scrolling respects reduced motion', () => { const f = fixture({reduced:true}); assert.equal(f.behavior(), 'auto'); f.cleanup(); const normal = fixture(); assert.equal(normal.behavior(), 'smooth'); normal.cleanup(); });
console.log(`${checks} motion checks passed`);
