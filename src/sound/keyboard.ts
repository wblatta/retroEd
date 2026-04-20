interface LoadedSample {
  buffer: AudioBuffer;
  attackOffset: number;
}

// Vite glob imports — resolved at build time
const clickUrls = import.meta.glob("./samples/click*.wav", {
  query: "?url",
  eager: true,
  import: "default",
}) as Record<string, string>;

const spaceUrls = import.meta.glob("./samples/space*.wav", {
  query: "?url",
  eager: true,
  import: "default",
}) as Record<string, string>;

const enterUrls = import.meta.glob("./samples/enter*.wav", {
  query: "?url",
  eager: true,
  import: "default",
}) as Record<string, string>;

const backspaceUrls = import.meta.glob("./samples/backspace*.wav", {
  query: "?url",
  eager: true,
  import: "default",
}) as Record<string, string>;

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

const sampleCache = new Map<string, LoadedSample>();

async function loadSample(url: string): Promise<LoadedSample> {
  if (sampleCache.has(url)) return sampleCache.get(url)!;

  const resp = await fetch(url);
  const arrayBuf = await resp.arrayBuffer();
  const decoded = await getCtx().decodeAudioData(arrayBuf);

  // Find peak amplitude
  let peak = 0;
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }

  // Walk forward to first sample above 50% of peak
  const threshold = peak * 0.5;
  const sampleRate = decoded.sampleRate;
  let strikeIdx = 0;
  outer: for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) >= threshold) {
        strikeIdx = i;
        break outer;
      }
    }
  }

  // Back up 2 ms for rising-edge headroom
  const backupSamples = Math.floor(sampleRate * 0.002);
  const startIdx = Math.max(0, strikeIdx - backupSamples);

  // Trim to 160 ms max
  const maxSamples = Math.floor(sampleRate * 0.16);
  const length = Math.min(maxSamples, decoded.length - startIdx);

  const trimmed = getCtx().createBuffer(
    decoded.numberOfChannels,
    length,
    sampleRate
  );
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const src = decoded.getChannelData(ch).subarray(startIdx, startIdx + length);
    trimmed.copyToChannel(src, ch);
  }

  const loaded: LoadedSample = { buffer: trimmed, attackOffset: strikeIdx - startIdx };
  sampleCache.set(url, loaded);
  return loaded;
}

function urlsToArray(map: Record<string, string>): string[] {
  return Object.values(map);
}

const clickArr = urlsToArray(clickUrls);
const spaceArr = urlsToArray(spaceUrls).length ? urlsToArray(spaceUrls) : clickArr;
const enterArr = urlsToArray(enterUrls).length ? urlsToArray(enterUrls) : clickArr;
const backspaceArr = urlsToArray(backspaceUrls).length ? urlsToArray(backspaceUrls) : clickArr;
const hasSamples = clickArr.length > 0;

export async function prewarmKeySounds(): Promise<void> {
  if (!hasSamples) return;
  const allUrls = [...new Set([...clickArr, ...spaceArr, ...enterArr, ...backspaceArr])];
  await Promise.all(allUrls.map(loadSample));
}

// WebAudio synth fallback — bandpassed noise burst + triangle resonance
function playSynth(): void {
  const c = getCtx();
  const bufLen = Math.floor(c.sampleRate * 0.04);
  const noiseBuf = c.createBuffer(1, bufLen, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
  }

  const noise = c.createBufferSource();
  noise.buffer = noiseBuf;

  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3000 + Math.random() * 1000;
  bp.Q.value = 2;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.3, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);

  noise.connect(bp);
  bp.connect(gain);
  gain.connect(c.destination);
  noise.start(0);
  noise.stop(c.currentTime + 0.04);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function playKey(key: string): Promise<void> {
  if (!hasSamples) {
    playSynth();
    return;
  }

  let pool: string[];
  if (key === " ") pool = spaceArr;
  else if (key === "Enter") pool = enterArr;
  else if (key === "Backspace" || key === "Delete") pool = backspaceArr;
  else pool = clickArr;

  const url = pickRandom(pool);
  let sample: LoadedSample;
  try {
    sample = await loadSample(url);
  } catch {
    playSynth();
    return;
  }

  const c = getCtx();
  const t0 = performance.now();

  const source = c.createBufferSource();
  source.buffer = sample.buffer;

  // ±12% pitch jitter
  source.playbackRate.value = 1 + (Math.random() - 0.5) * 0.24;

  const gainNode = c.createGain();
  // ±18% volume jitter
  gainNode.gain.value = 0.7 + (Math.random() - 0.5) * 0.36;

  source.connect(gainNode);
  gainNode.connect(c.destination);
  source.start(0);

  const triggerMs = performance.now() - t0;
  console.debug(
    `[keyboard] trigger ${triggerMs.toFixed(1)}ms (cached) · state=${c.state} · baseLatency=${(c.baseLatency * 1000).toFixed(1)}ms · outputLatency=${(c.outputLatency * 1000).toFixed(1)}ms`
  );
}
