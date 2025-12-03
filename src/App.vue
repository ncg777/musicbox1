<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { MusicEngine, DEFAULT_SYNTH_PARAMS } from './musicEngine';

const STORAGE_KEY = 'musicbox-params';

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
  maxNoteDuration: number;
}

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
    maxNoteDuration: maxNoteDuration.value
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch (e) {
    console.warn('Failed to save params:', e);
  }
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

// Max note duration
const maxNoteDuration = ref(savedParams?.maxNoteDuration ?? DEFAULT_SYNTH_PARAMS.maxNoteDuration);

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
    maxNoteDuration: maxNoteDuration.value
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
</script>

<template>
  <div class="app">
    <h1>🎵 Music Box</h1>
    <p class="subtitle">Generative ambient music using pitch class sets</p>
      
    <div class="controls">
      <button 
        class="play-button" 
        :class="{ playing: isPlaying, loading: isLoading }"
        @click="handlePlayClick"
        :disabled="isLoading"
        :aria-label="isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play'"
      >
        {{ isLoading ? '⏳' : isPlaying ? '⏸' : '▶' }}
      </button>
      <div class="note-indicator">
        <div 
          v-for="i in 12" 
          :key="i"
          class="note-dot"
          :class="{ active: activeNotes.has(i - 1) }"
          :title="noteNames[i - 1]"
        ></div>
      </div>
      
      <div class="status" v-if="isPlaying">
        <p>Current chord: <span class="current-chord">{{ currentChord || '...' }}</span></p>
      </div>
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
            <span class="value-display">{{ lambda.toFixed(1) }} notes/bar</span>
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
        <h3>Vibrato</h3>
        <div class="slider-container">
          <label for="vibratoRate">Rate</label>
          <div class="slider-row">
            <input type="range" id="vibratoRate" min="0.1" max="20" step="0.1" v-model.number="vibratoRate" @input="updateEngineParams" />
            <span class="value-display">{{ vibratoRate.toFixed(1) }} Hz</span>
          </div>
        </div>
        <div class="slider-container">
          <label for="vibratoDepth">Depth</label>
          <div class="slider-row">
            <input type="range" id="vibratoDepth" min="0" max="0.05" step="0.001" v-model.number="vibratoDepth" @input="updateEngineParams" />
            <span class="value-display">{{ (vibratoDepth * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>

      <div class="param-section">
        <h3>Tremolo</h3>
        <div class="slider-container">
          <label for="tremoloRate">Rate</label>
          <div class="slider-row">
            <input type="range" id="tremoloRate" min="0.1" max="20" step="0.1" v-model.number="tremoloRate" @input="updateEngineParams" />
            <span class="value-display">{{ tremoloRate.toFixed(1) }} Hz</span>
          </div>
        </div>
        <div class="slider-container">
          <label for="tremoloDepth">Depth</label>
          <div class="slider-row">
            <input type="range" id="tremoloDepth" min="0" max="1" step="0.01" v-model.number="tremoloDepth" @input="updateEngineParams" />
            <span class="value-display">{{ (tremoloDepth * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>

      <div class="param-section">
        <h3>Duration</h3>
        <div class="slider-container">
          <label for="maxNoteDuration">Max Note Length</label>
          <div class="slider-row">
            <input type="range" id="maxNoteDuration" min="0.5" max="10" step="0.1" v-model.number="maxNoteDuration" @input="updateEngineParams" />
            <span class="value-display">{{ maxNoteDuration.toFixed(1) }}s</span>
          </div>
        </div>
      </div>
      
    </div>
  </div>
</template>
