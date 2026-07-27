<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { MusicEngine, DEFAULT_SYNTH_PARAMS, MUSICAL_DURATIONS, type MusicalDuration, type DelayFilterType, type DelayFilterOrder } from './musicEngine';

const STORAGE_KEY = 'musicbox-params';
const PRESETS_STORAGE_KEY = 'musicbox-presets';

interface SavedParams {
  bpm: number;
  lambda: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  vibratoRate: number;
  vibratoDepth: number;
  tremoloRate: number;
  tremoloDepth: number;
  maxNoteDurationIndex: number;
  // Delay params
  delayEnabled: boolean;
  delayDurationIndex: number;
  delayFeedback: number;
  delayMix: number;
  delayFilterType: DelayFilterType;
  delayFilterFrequency: number;
  delayFilterResonance: number;
  delayFilterOrder: DelayFilterOrder;
}

interface Preset {
  name: string;
  params: SavedParams;
  isFactory: boolean;
}

// Factory presets (read-only)
const FACTORY_PRESETS: Preset[] = [
  {
    name: 'Default',
    isFactory: true,
    params: {
      bpm: 45,
      lambda: 6,
      attack: DEFAULT_SYNTH_PARAMS.envelope.attack,
      decay: DEFAULT_SYNTH_PARAMS.envelope.decay,
      sustain: DEFAULT_SYNTH_PARAMS.envelope.sustain,
      release: DEFAULT_SYNTH_PARAMS.envelope.release,
      vibratoRate: DEFAULT_SYNTH_PARAMS.vibrato.rate,
      vibratoDepth: DEFAULT_SYNTH_PARAMS.vibrato.depth,
      tremoloRate: DEFAULT_SYNTH_PARAMS.tremolo.rate,
      tremoloDepth: DEFAULT_SYNTH_PARAMS.tremolo.depth,
      maxNoteDurationIndex: MUSICAL_DURATIONS.indexOf(DEFAULT_SYNTH_PARAMS.maxNoteDuration),
      delayEnabled: DEFAULT_SYNTH_PARAMS.delay.enabled,
      delayDurationIndex: MUSICAL_DURATIONS.indexOf(DEFAULT_SYNTH_PARAMS.delay.duration),
      delayFeedback: DEFAULT_SYNTH_PARAMS.delay.feedback,
      delayMix: DEFAULT_SYNTH_PARAMS.delay.mix,
      delayFilterType: DEFAULT_SYNTH_PARAMS.delay.filterType,
      delayFilterFrequency: DEFAULT_SYNTH_PARAMS.delay.filterFrequency,
      delayFilterResonance: DEFAULT_SYNTH_PARAMS.delay.filterResonance,
      delayFilterOrder: DEFAULT_SYNTH_PARAMS.delay.filterOrder
    }
  },
  {
    name: 'Ambient Pad',
    isFactory: true,
    params: {
      bpm: 30,
      lambda: 3,
      attack: 0.8,
      decay: 0.5,
      sustain: 0.7,
      release: 2.5,
      vibratoRate: 3,
      vibratoDepth: 0.01,
      tremoloRate: 0.5,
      tremoloDepth: 0.15,
      maxNoteDurationIndex: MUSICAL_DURATIONS.indexOf('1/1'),
      delayEnabled: true,
      delayDurationIndex: MUSICAL_DURATIONS.indexOf('1/2D'),
      delayFeedback: 0.45,
      delayMix: 0.5,
      delayFilterType: 'lowpass',
      delayFilterFrequency: 800,
      delayFilterResonance: 1.5,
      delayFilterOrder: 12
    }
  },
  {
    name: 'Plucky',
    isFactory: true,
    params: {
      bpm: 90,
      lambda: 12,
      attack: 0.01,
      decay: 0.15,
      sustain: 0.2,
      release: 0.3,
      vibratoRate: 0,
      vibratoDepth: 0,
      tremoloRate: 0,
      tremoloDepth: 0,
      maxNoteDurationIndex: MUSICAL_DURATIONS.indexOf('1/8'),
      delayEnabled: true,
      delayDurationIndex: MUSICAL_DURATIONS.indexOf('1/8D'),
      delayFeedback: 0.35,
      delayMix: 0.3,
      delayFilterType: 'highpass',
      delayFilterFrequency: 400,
      delayFilterResonance: 0.7,
      delayFilterOrder: 6
    }
  },
  {
    name: 'Dark Drone',
    isFactory: true,
    params: {
      bpm: 20,
      lambda: 2,
      attack: 1.5,
      decay: 1.0,
      sustain: 0.8,
      release: 4.0,
      vibratoRate: 1,
      vibratoDepth: 0.02,
      tremoloRate: 0.2,
      tremoloDepth: 0.25,
      maxNoteDurationIndex: MUSICAL_DURATIONS.indexOf('1/1'),
      delayEnabled: true,
      delayDurationIndex: MUSICAL_DURATIONS.indexOf('1/1'),
      delayFeedback: 0.1,
      delayMix: 0.2,
      delayFilterType: 'lowpass',
      delayFilterFrequency: 400,
      delayFilterResonance: 3,
      delayFilterOrder: 24
    }
  }
];

function loadSavedParams(): SavedParams | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load saved params:', e);
  }
  return null;
}

function saveParams() {
  const params: SavedParams = {
    bpm: bpm.value,
    lambda: lambda.value,
    attack: attack.value,
    decay: decay.value,
    sustain: sustain.value,
    release: release.value,
    vibratoRate: vibratoRate.value,
    vibratoDepth: vibratoDepth.value,
    tremoloRate: tremoloRate.value,
    tremoloDepth: tremoloDepth.value,
    maxNoteDurationIndex: maxNoteDurationIndex.value,
    // Delay params
    delayEnabled: delayEnabled.value,
    delayDurationIndex: delayDurationIndex.value,
    delayFeedback: delayFeedback.value,
    delayMix: delayMix.value,
    delayFilterType: delayFilterType.value,
    delayFilterFrequency: delayFilterFrequency.value,
    delayFilterResonance: delayFilterResonance.value,
    delayFilterOrder: delayFilterOrder.value
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch (e) {
    console.warn('Failed to save params:', e);
  }
}

// Preset management functions
function loadUserPresets(): Preset[] {
  try {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load user presets:', e);
  }
  return [];
}

function saveUserPresets(presets: Preset[]) {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn('Failed to save user presets:', e);
  }
}

function getCurrentParams(): SavedParams {
  return {
    bpm: bpm.value,
    lambda: lambda.value,
    attack: attack.value,
    decay: decay.value,
    sustain: sustain.value,
    release: release.value,
    vibratoRate: vibratoRate.value,
    vibratoDepth: vibratoDepth.value,
    tremoloRate: tremoloRate.value,
    tremoloDepth: tremoloDepth.value,
    maxNoteDurationIndex: maxNoteDurationIndex.value,
    delayEnabled: delayEnabled.value,
    delayDurationIndex: delayDurationIndex.value,
    delayFeedback: delayFeedback.value,
    delayMix: delayMix.value,
    delayFilterType: delayFilterType.value,
    delayFilterFrequency: delayFilterFrequency.value,
    delayFilterResonance: delayFilterResonance.value,
    delayFilterOrder: delayFilterOrder.value
  };
}

// Load saved params or use defaults
const savedParams = loadSavedParams();

const engine = ref<MusicEngine | null>(null);
const isPlaying = ref(false);
const isLoading = ref(false);
const lambda = ref(savedParams?.lambda ?? 6); // Mean notes per bar
const bpm = ref(savedParams?.bpm ?? 45); // Beats per minute
const currentChord = ref('');
const activeNotes = ref<Set<number>>(new Set());

// Envelope parameters
const attack = ref(savedParams?.attack ?? DEFAULT_SYNTH_PARAMS.envelope.attack);
const decay = ref(savedParams?.decay ?? DEFAULT_SYNTH_PARAMS.envelope.decay);
const sustain = ref(savedParams?.sustain ?? DEFAULT_SYNTH_PARAMS.envelope.sustain);
const release = ref(savedParams?.release ?? DEFAULT_SYNTH_PARAMS.envelope.release);

// Vibrato parameters
const vibratoRate = ref(savedParams?.vibratoRate ?? DEFAULT_SYNTH_PARAMS.vibrato.rate);
const vibratoDepth = ref(savedParams?.vibratoDepth ?? DEFAULT_SYNTH_PARAMS.vibrato.depth);

// Tremolo parameters
const tremoloRate = ref(savedParams?.tremoloRate ?? DEFAULT_SYNTH_PARAMS.tremolo.rate);
const tremoloDepth = ref(savedParams?.tremoloDepth ?? DEFAULT_SYNTH_PARAMS.tremolo.depth);

// Max note duration (as index into MUSICAL_DURATIONS)
const maxNoteDurationIndex = ref(savedParams?.maxNoteDurationIndex ?? MUSICAL_DURATIONS.indexOf(DEFAULT_SYNTH_PARAMS.maxNoteDuration));

// Delay parameters
const delayEnabled = ref(savedParams?.delayEnabled ?? DEFAULT_SYNTH_PARAMS.delay.enabled);
const delayDurationIndex = ref(savedParams?.delayDurationIndex ?? MUSICAL_DURATIONS.indexOf(DEFAULT_SYNTH_PARAMS.delay.duration));
const delayFeedback = ref(savedParams?.delayFeedback ?? DEFAULT_SYNTH_PARAMS.delay.feedback);
const delayMix = ref(savedParams?.delayMix ?? DEFAULT_SYNTH_PARAMS.delay.mix);
const delayFilterType = ref<DelayFilterType>(savedParams?.delayFilterType ?? DEFAULT_SYNTH_PARAMS.delay.filterType);
const delayFilterFrequency = ref(savedParams?.delayFilterFrequency ?? DEFAULT_SYNTH_PARAMS.delay.filterFrequency);
const delayFilterResonance = ref(savedParams?.delayFilterResonance ?? DEFAULT_SYNTH_PARAMS.delay.filterResonance);
const delayFilterOrder = ref<DelayFilterOrder>(savedParams?.delayFilterOrder ?? DEFAULT_SYNTH_PARAMS.delay.filterOrder);

// Preset management
const userPresets = ref<Preset[]>(loadUserPresets());
const allPresets = computed(() => [...FACTORY_PRESETS, ...userPresets.value]);
const currentPresetName = ref('');
const newPresetName = ref('');

// Computed for displaying current musical duration
const currentDelayDuration = computed(() => MUSICAL_DURATIONS[delayDurationIndex.value] || '1/4');
const currentMaxNoteDuration = computed(() => MUSICAL_DURATIONS[maxNoteDurationIndex.value] || '1/2');

// Computed for which notes are in the current chord (from binary string)
const chordNotes = computed(() => {
  const notes = new Set<number>();
  if (currentChord.value) {
    for (let i = 0; i < currentChord.value.length; i++) {
      if (currentChord.value[i] === '1') {
        notes.add(i);
      }
    }
  }
  return notes;
});

// Filter type options for select
const filterTypeOptions: { value: DelayFilterType; label: string }[] = [
  { value: 'lowpass', label: 'LP' },
  { value: 'bandpass', label: 'BP' },
  { value: 'highpass', label: 'HP' }
];

// Filter order options
const filterOrderOptions: DelayFilterOrder[] = [6, 12, 24];

// Preset actions
function applyPreset(preset: Preset) {
  const p = preset.params;
  bpm.value = p.bpm;
  lambda.value = p.lambda;
  attack.value = p.attack;
  decay.value = p.decay;
  sustain.value = p.sustain;
  release.value = p.release;
  vibratoRate.value = p.vibratoRate;
  vibratoDepth.value = p.vibratoDepth;
  tremoloRate.value = p.tremoloRate;
  tremoloDepth.value = p.tremoloDepth;
  maxNoteDurationIndex.value = p.maxNoteDurationIndex;
  delayEnabled.value = p.delayEnabled;
  delayDurationIndex.value = p.delayDurationIndex;
  delayFeedback.value = p.delayFeedback;
  delayMix.value = p.delayMix;
  delayFilterType.value = p.delayFilterType;
  delayFilterFrequency.value = p.delayFilterFrequency;
  delayFilterResonance.value = p.delayFilterResonance;
  delayFilterOrder.value = p.delayFilterOrder;
  
  currentPresetName.value = preset.name;
  updateEngineParams();
}

function selectPreset(presetName: string) {
  const preset = allPresets.value.find(p => p.name === presetName);
  if (preset) {
    applyPreset(preset);
  }
}

function saveAsPreset() {
  const name = newPresetName.value.trim();
  if (!name) return;
  
  // Check if name conflicts with factory preset
  if (FACTORY_PRESETS.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    alert('Cannot use a factory preset name');
    return;
  }
  
  // Check if updating existing user preset
  const existingIndex = userPresets.value.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
  
  const newPreset: Preset = {
    name,
    params: getCurrentParams(),
    isFactory: false
  };
  
  if (existingIndex >= 0) {
    userPresets.value[existingIndex] = newPreset;
  } else {
    userPresets.value.push(newPreset);
  }
  
  saveUserPresets(userPresets.value);
  currentPresetName.value = name;
  newPresetName.value = '';
}

function deletePreset(presetName: string) {
  const preset = allPresets.value.find(p => p.name === presetName);
  if (!preset || preset.isFactory) return;
  
  userPresets.value = userPresets.value.filter(p => p.name !== presetName);
  saveUserPresets(userPresets.value);
  
  if (currentPresetName.value === presetName) {
    currentPresetName.value = '';
  }
}

function exportPresets() {
  const data = {
    version: 1,
    presets: userPresets.value
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'musicbox-presets.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importPresets() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.presets || !Array.isArray(data.presets)) {
        alert('Invalid preset file format');
        return;
      }
      
      // Import presets, avoiding factory name conflicts
      const imported: Preset[] = data.presets
        .filter((p: Preset) => !FACTORY_PRESETS.some(f => f.name.toLowerCase() === p.name.toLowerCase()))
        .map((p: Preset) => ({ ...p, isFactory: false }));
      
      // Merge with existing, updating duplicates
      for (const preset of imported) {
        const existingIndex = userPresets.value.findIndex(up => up.name.toLowerCase() === preset.name.toLowerCase());
        if (existingIndex >= 0) {
          userPresets.value[existingIndex] = preset;
        } else {
          userPresets.value.push(preset);
        }
      }
      
      saveUserPresets(userPresets.value);
      alert(`Imported ${imported.length} preset(s)`);
    } catch (err) {
      console.error('Failed to import presets:', err);
      alert('Failed to import presets');
    }
  };
  input.click();
}

async function handlePlayClick() {
  if (!engine.value) return;
  
  if (!isPlaying.value) {
    isLoading.value = true;
  }
  
  try {
    await engine.value.toggle();
  } catch (err) {
    console.error('Play toggle failed:', err);
  } finally {
    isLoading.value = false;
  }
}

function updateEngineParams() {
  if (!engine.value) return;
  engine.value.setLambda(lambda.value);
  engine.value.setBpm(bpm.value);
  engine.value.setSynthParams({
    envelope: {
      attack: attack.value,
      decay: decay.value,
      sustain: sustain.value,
      release: release.value
    },
    vibrato: {
      rate: vibratoRate.value,
      depth: vibratoDepth.value
    },
    tremolo: {
      rate: tremoloRate.value,
      depth: tremoloDepth.value
    },
    delay: {
      enabled: delayEnabled.value,
      duration: MUSICAL_DURATIONS[delayDurationIndex.value] as MusicalDuration,
      feedback: delayFeedback.value,
      mix: delayMix.value,
      filterType: delayFilterType.value,
      filterFrequency: delayFilterFrequency.value,
      filterResonance: delayFilterResonance.value,
      filterOrder: delayFilterOrder.value
    },
    maxNoteDuration: MUSICAL_DURATIONS[maxNoteDurationIndex.value] as MusicalDuration
  });
  
  // Persist to localStorage
  saveParams();
}

onMounted(() => {
  engine.value = new MusicEngine();
  
  // Apply saved params to the engine
  updateEngineParams();
  
  engine.value.onChordChange = (chord: string) => {
    currentChord.value = chord;
  };
  
  engine.value.onNoteTriggered = (pitchClass: number) => {
    activeNotes.value.add(pitchClass);
    setTimeout(() => {
      activeNotes.value.delete(pitchClass);
      activeNotes.value = new Set(activeNotes.value);
    }, 150);
    activeNotes.value = new Set(activeNotes.value);
  };

  engine.value.onPlayStateChange = (playing: boolean) => {
    isPlaying.value = playing;
  };

  // Register service worker for background audio
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(() => {
      console.log('Service worker ready for background audio');
    });
  }
});

onUnmounted(() => {
  if (engine.value) {
    engine.value.stop();
  }
});

const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// Export state
const isExporting = ref(false);
const exportProgress = ref(0);

async function exportToWav() {
  if (!engine.value || isExporting.value) return;
  
  const input = prompt('Enter number of hyperbars to generate (1 hyperbar = 8 bars):', '1');
  if (!input) return;
  
  const numHyperbars = parseInt(input, 10);
  if (isNaN(numHyperbars) || numHyperbars < 1 || numHyperbars > 100) {
    alert('Please enter a valid number between 1 and 100');
    return;
  }
  
  isExporting.value = true;
  exportProgress.value = 0;
  
  try {
    const blob = await engine.value.exportToWav(numHyperbars, (progress) => {
      exportProgress.value = progress;
    });
    
    // Download the file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `musicbox-${numHyperbars}x8bars-${timestamp}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('WAV export failed:', err);
    alert('Failed to export WAV file');
  } finally {
    isExporting.value = false;
    exportProgress.value = 0;
  }
}

function exportToMidi() {
  if (!engine.value || isExporting.value) return;
  
  const input = prompt('Enter number of hyperbars to generate (1 hyperbar = 8 bars):', '1');
  if (!input) return;
  
  const numHyperbars = parseInt(input, 10);
  if (isNaN(numHyperbars) || numHyperbars < 1 || numHyperbars > 100) {
    alert('Please enter a valid number between 1 and 100');
    return;
  }
  
  isExporting.value = true;
  
  try {
    const blob = engine.value.exportToMidi(numHyperbars);
    
    // Download the file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `musicbox-${numHyperbars}x8bars-${timestamp}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('MIDI export failed:', err);
    alert('Failed to export MIDI file');
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="header-left">
        <button 
          class="play-button" 
          :class="{ playing: isPlaying, loading: isLoading }"
          @click="handlePlayClick"
          :disabled="isLoading"
          :aria-label="isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play'"
        >
          {{ isLoading ? '⏳' : isPlaying ? '⏸' : '▶' }}
        </button>
        <h1>🎵 musicbox1</h1>
      </div>
      <div class="header-right">
        <button 
          class="export-btn wav" 
          @click="exportToWav" 
          :disabled="isExporting"
          title="Export to WAV audio file"
        >
          {{ isExporting ? `${Math.round(exportProgress * 100)}%` : '🎵 WAV' }}
        </button>
        <button 
          class="export-btn midi" 
          @click="exportToMidi" 
          :disabled="isExporting"
          title="Export to MIDI file"
        >
          🎹 MIDI
        </button>
      </div>
    </header>
    
    <div class="note-indicator">
      <div 
        v-for="i in 12" 
        :key="i"
        class="note-dot"
        :class="{ active: activeNotes.has(i - 1), 'in-chord': chordNotes.has(i - 1) }"
        :title="noteNames[i - 1]"
      >
        <span class="note-label">{{ noteNames[i - 1] }}</span>
      </div>
    </div>
    
    <!-- Preset Bar -->
    <div class="preset-bar">
      <div class="preset-select-group">
        <label for="preset-select">Preset:</label>
        <select 
          id="preset-select" 
          :value="currentPresetName"
          @change="selectPreset(($event.target as HTMLSelectElement).value)"
        >
          <option value="">-- Select --</option>
          <optgroup label="Factory">
            <option v-for="preset in FACTORY_PRESETS" :key="preset.name" :value="preset.name">
              {{ preset.name }}
            </option>
          </optgroup>
          <optgroup v-if="userPresets.length > 0" label="User">
            <option v-for="preset in userPresets" :key="preset.name" :value="preset.name">
              {{ preset.name }}
            </option>
          </optgroup>
        </select>
      </div>
      
      <div class="preset-save-group">
        <input 
          type="text" 
          v-model="newPresetName" 
          placeholder="New preset name..."
          class="preset-name-input"
          @keyup.enter="saveAsPreset"
        />
        <button class="preset-btn save" @click="saveAsPreset" :disabled="!newPresetName.trim()">Save</button>
      </div>
      
      <button 
        class="preset-btn delete" 
        @click="deletePreset(currentPresetName)"
        :disabled="!currentPresetName || allPresets.find(p => p.name === currentPresetName)?.isFactory"
        title="Delete current preset"
      >Delete</button>
      
      <div class="preset-io-group">
        <button class="preset-btn export" @click="exportPresets" :disabled="userPresets.length === 0">Export</button>
        <button class="preset-btn import" @click="importPresets">Import</button>
      </div>
    </div>

    
    <!--
    <div class="status" v-if="isPlaying">
      <p>Current chord: <span class="current-chord">{{ currentChord || '...' }}</span></p>
    </div>
    -->
    <div class="controls">
      <div class="params-grid">
        <div class="param-section">
          <h3>Timing</h3>
          <div class="slider-container">
            <label for="bpm">BPM</label>
            <div class="slider-row">
              <input 
                type="range" 
                id="bpm"
                min="20" 
                max="200" 
                step="1"
                v-model.number="bpm"
                @input="updateEngineParams"
              />
              <span class="value-display">{{ bpm }} BPM</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="lambda">Note Density (λ)</label>
            <div class="slider-row">
              <input 
                type="range" 
                id="lambda"
                min="1" 
                max="20" 
                step="0.5"
                v-model.number="lambda"
                @input="updateEngineParams"
              />
              <span class="value-display">{{ lambda.toFixed(1) }} n/bar</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="maxNoteDuration">Max Note Length</label>
            <div class="slider-row">
              <input 
                type="range" 
                id="maxNoteDuration" 
                min="0" 
                :max="MUSICAL_DURATIONS.length - 1" 
                step="1" 
                v-model.number="maxNoteDurationIndex" 
                @input="updateEngineParams" 
              />
              <span class="value-display">{{ currentMaxNoteDuration }}</span>
            </div>
          </div>
        </div>

        <div class="param-section">
          <h3>Envelope</h3>
          <div class="slider-container">
            <label for="attack">Attack</label>
            <div class="slider-row">
              <input type="range" id="attack" min="0.001" max="1" step="0.001" v-model.number="attack" @input="updateEngineParams" />
              <span class="value-display">{{ attack.toFixed(3) }}s</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="decay">Decay</label>
            <div class="slider-row">
              <input type="range" id="decay" min="0.01" max="2" step="0.01" v-model.number="decay" @input="updateEngineParams" />
              <span class="value-display">{{ decay.toFixed(2) }}s</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="sustain">Sustain</label>
            <div class="slider-row">
              <input type="range" id="sustain" min="0" max="1" step="0.01" v-model.number="sustain" @input="updateEngineParams" />
              <span class="value-display">{{ (sustain * 100).toFixed(0) }}%</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="release">Release</label>
            <div class="slider-row">
              <input type="range" id="release" min="0.1" max="5" step="0.1" v-model.number="release" @input="updateEngineParams" />
              <span class="value-display">{{ release.toFixed(1) }}s</span>
            </div>
          </div>
        </div>

        <div class="param-section">
          <h3>Modulation</h3>
          <div class="slider-container">
            <label for="vibratoRate">Vibrato Rate</label>
            <div class="slider-row">
              <input type="range" id="vibratoRate" min="0.1" max="20" step="0.1" v-model.number="vibratoRate" @input="updateEngineParams" />
              <span class="value-display">{{ vibratoRate.toFixed(1) }} Hz</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="vibratoDepth">Vibrato Depth</label>
            <div class="slider-row">
              <input type="range" id="vibratoDepth" min="0" max="0.05" step="0.001" v-model.number="vibratoDepth" @input="updateEngineParams" />
              <span class="value-display">{{ (vibratoDepth * 100).toFixed(1) }}%</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="tremoloRate">Tremolo Rate</label>
            <div class="slider-row">
              <input type="range" id="tremoloRate" min="0.1" max="20" step="0.1" v-model.number="tremoloRate" @input="updateEngineParams" />
              <span class="value-display">{{ tremoloRate.toFixed(1) }} Hz</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="tremoloDepth">Tremolo Depth</label>
            <div class="slider-row">
              <input type="range" id="tremoloDepth" min="0" max="1" step="0.01" v-model.number="tremoloDepth" @input="updateEngineParams" />
              <span class="value-display">{{ (tremoloDepth * 100).toFixed(0) }}%</span>
            </div>
          </div>
        </div>

        <div class="param-section wide">
          <h3>
            Delay
            <label class="toggle-label">
              <input type="checkbox" v-model="delayEnabled" @change="updateEngineParams" />
              <span class="toggle-text">{{ delayEnabled ? 'On' : 'Off' }}</span>
            </label>
          </h3>
          <div class="slider-container">
            <label for="delayDuration">Time</label>
            <div class="slider-row">
              <input 
                type="range" 
                id="delayDuration"
                min="0" 
                :max="MUSICAL_DURATIONS.length - 1" 
                step="1"
                v-model.number="delayDurationIndex"
                @input="updateEngineParams"
              />
              <span class="value-display">{{ currentDelayDuration }}</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="delayFeedback">Feedback</label>
            <div class="slider-row">
              <input type="range" id="delayFeedback" min="0" max="0.95" step="0.01" v-model.number="delayFeedback" @input="updateEngineParams" />
              <span class="value-display">{{ (delayFeedback * 100).toFixed(0) }}%</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="delayMix">Mix</label>
            <div class="slider-row">
              <input type="range" id="delayMix" min="0" max="1" step="0.01" v-model.number="delayMix" @input="updateEngineParams" />
              <span class="value-display">{{ (delayMix * 100).toFixed(0) }}%</span>
            </div>
          </div>
          <div class="slider-container">
            <label>Filter Type</label>
            <div class="button-group">
              <button 
                v-for="opt in filterTypeOptions" 
                :key="opt.value"
                :class="{ active: delayFilterType === opt.value }"
                @click="delayFilterType = opt.value; updateEngineParams()"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="slider-container">
            <label for="delayFilterFreq">Filter Freq</label>
            <div class="slider-row">
              <input type="range" id="delayFilterFreq" min="100" max="10000" step="10" v-model.number="delayFilterFrequency" @input="updateEngineParams" />
              <span class="value-display">{{ delayFilterFrequency >= 1000 ? (delayFilterFrequency / 1000).toFixed(1) + 'k' : delayFilterFrequency }} Hz</span>
            </div>
          </div>
          <div class="slider-container">
            <label for="delayFilterRes">Resonance</label>
            <div class="slider-row">
              <input type="range" id="delayFilterRes" min="0.1" max="20" step="0.1" v-model.number="delayFilterResonance" @input="updateEngineParams" />
              <span class="value-display">{{ delayFilterResonance.toFixed(1) }}</span>
            </div>
          </div>
          <div class="slider-container">
            <label>Filter Order</label>
            <div class="button-group">
              <button 
                v-for="order in filterOrderOptions" 
                :key="order"
                :class="{ active: delayFilterOrder === order }"
                @click="delayFilterOrder = order; updateEngineParams()"
              >
                {{ order }}dB
              </button>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  </div>
</template>
