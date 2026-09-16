/* eslint-disable @typescript-eslint/no-require-imports -- Standalone regression test. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("app/(dashboard)/attendances/components/face-recognition-modal.tsx", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function mount({ pendingCamera = false, descriptor = [1] } = {}) {
  let now = 0;
  let stateIndex = 0;
  let stopped = 0;
  let resolveCamera;
  const states = [];
  const effects = [];
  const timers = new Map();
  const intervals = new Map();
  const listeners = new Map();
  const inputs = [];
  let timerId = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const video = {
    currentTime: 0, videoWidth: 640, videoHeight: 480, readyState: 2,
    paused: false, srcObject: null,
    play: async () => { video.paused = false; },
    pause: () => { video.paused = true; },
  };
  const canvas = { getContext: () => ({ drawImage() {} }) };
  const jsx = (type, props) => {
    if (props.ref && type === "video") props.ref.current = video;
    if (props.ref && type === "canvas") props.ref.current = canvas;
    return { type, props };
  };
  const mocks = {
    react: {
      useState(initial) {
        const index = stateIndex++;
        states[index] = index === 3 ? true : initial;
        return [states[index], (value) => { states[index] = value; }];
      },
      useRef: (current) => ({ current }),
      useCallback: (fn) => fn,
      useEffect: (fn) => effects.push(fn),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "face-api.js": {
      TinyFaceDetectorOptions: function (options) { Object.assign(this, options); },
      detectSingleFace: (_, options) => {
        inputs.push(options.inputSize);
        return { withFaceLandmarks: async () => undefined };
      },
    },
    "@/lib/helper/face-descriptor": { parseFaceDescriptor: (value) => value },
    "@/lib/helper/face-performance": { reportFacePerformance() {} },
    "./face-overlay": { createFaceOverlay: () => ({ update() {}, stop() {} }) },
  };
  const context = {
    exports: {}, require: (name) => mocks[name] || {},
    performance: { now: () => now },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    navigator: { mediaDevices: { getUserMedia: () => pendingCamera
      ? new Promise((resolve) => { resolveCamera = resolve; }) : Promise.resolve(stream) } },
    document: {
      hidden: false, createElement: () => canvas,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    window: {
      setInterval: (fn) => { intervals.set(++timerId, fn); return timerId; },
      clearInterval: (id) => intervals.delete(id),
    },
  };
  vm.runInNewContext(compiled, context);
  context.exports.default({
    isOpen: true, mode: "check-in", referenceImageUrl: null,
    referenceDescriptor: descriptor,
    onSuccess: () => assert.fail("Missing face must never pass verification"), onClose() {},
  });
  const cleanup = effects.at(-1)();
  return {
    states, video, inputs, intervals, listeners, cleanup,
    stopped: () => stopped,
    resolveCamera: () => resolveCamera(stream),
    advance(ms) { now += ms; for (const fn of intervals.values()) fn(); },
    async scan() {
      now += 600;
      video.currentTime += 0.6;
      const entry = timers.entries().next().value;
      assert.ok(entry, "Scan loop should continue");
      timers.delete(entry[0]); entry[1](); await flush();
    },
  };
}

async function main() {
  const scanning = mount();
  await flush();
  for (let i = 0; i < 4; i++) await scanning.scan();
  assert.deepEqual(scanning.inputs.slice(0, 4), [224, 224, 224, 416]);
  assert.equal(scanning.states[1], "no-face");
  scanning.advance(0);
  scanning.advance(9000);
  assert.equal(scanning.states[1], "no-camera");
  assert.equal(scanning.stopped(), 1);
  scanning.cleanup();
  assert.equal(scanning.intervals.size, 0);
  assert.equal(scanning.listeners.size, 0);

  const delayed = mount({ pendingCamera: true });
  delayed.advance(21000);
  assert.equal(delayed.states[1], "error");
  delayed.resolveCamera();
  await flush();
  assert.equal(delayed.stopped(), 1, "Late camera stream must be released");
  assert.equal(delayed.video.srcObject, null);
  assert.equal(delayed.inputs.length, 0);
  delayed.cleanup();

  const closed = mount({ pendingCamera: true });
  closed.cleanup();
  closed.resolveCamera();
  await flush();
  assert.equal(closed.stopped(), 1);
  assert.equal(closed.inputs.length, 0);

  const missing = mount({ descriptor: null });
  await flush();
  missing.advance(30000);
  assert.equal(missing.states[1], "no-reference");
  missing.cleanup();
  console.log("Face recognition regression checks passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
