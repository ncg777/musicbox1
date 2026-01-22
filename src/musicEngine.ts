import { Pcs12 } from './pcs12';
import pcsGraphData from './pcsGraphData.json';

// MIDI file constants
const MIDI_HEADER = [0x4D, 0x54, 0x68, 0x64]; // "MThd"
const MIDI_TRACK_HEADER = [0x4D, 0x54, 0x72, 0x6B]; // "MTrk"
const TICKS_PER_BEAT = 480;

// Default constants
const DEFAULT_BPM = 45;
const DEFAULT_MEAN_NOTES_PER_BAR = 6;
const MAX_VOICES = 32;
const OCTAVE_MIN = 4;
const OCTAVE_MAX = 7;
const BARS_PER_CHANGE = 4;

// User-configurable parameters with defaults
export interface EnvelopeParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface VibratoParams {
  rate: number;
  depth: number;
}

export interface TremoloParams {
  rate: number;
  depth: number;
}

// Musical duration values for delay timing
export type MusicalDuration = 
  | '2/1' | '2/1T' | '2/1D'  
  | '1/1' | '1/1T' | '1/1D'
  | '1/2' | '1/2T' | '1/2D'
  | '1/4' | '1/4T' | '1/4D'
  | '1/8' | '1/8T' | '1/8D'
  | '1/16' | '1/16T' | '1/16D'
  | '1/32' | '1/32T' | '1/32D';

export const MUSICAL_DURATIONS: MusicalDuration[] = [
  '2/1', '2/1D', '2/1T',
  '1/1', '1/1D', '1/1T',
  '1/2', '1/2D', '1/2T',
  '1/4', '1/4D', '1/4T',
  '1/8', '1/8D', '1/8T',
  '1/16', '1/16D', '1/16T',
  '1/32', '1/32D', '1/32T'
];

export type DelayFilterType = 'lowpass' | 'bandpass' | 'highpass';
export type DelayFilterOrder = 6 | 12 | 24;

export interface DelayParams {
  enabled: boolean;
  duration: MusicalDuration;
  feedback: number;  // 0 to 0.95
  mix: number;       // 0 to 1 (dry/wet)
  filterType: DelayFilterType;
  filterFrequency: number;  // Hz
  filterResonance: number;  // Q value, 0.1 to 20
  filterOrder: DelayFilterOrder;
}

export interface SynthParams {
  envelope: EnvelopeParams;
  vibrato: VibratoParams;
  tremolo: TremoloParams;
  delay: DelayParams;
  maxNoteDuration: MusicalDuration;
}

export const DEFAULT_SYNTH_PARAMS: SynthParams = {
  envelope: {
    attack: 0.01,
    decay: 0.1,
    sustain: 0.0,
    release: 0.0
  },
  vibrato: {
    rate: 4.8,
    depth: 0.003
  },
  tremolo: {
    rate: 2.1,
    depth: 0.25
  },
  delay: {
    enabled: true,
    duration: '1/2',
    feedback: 0.25,
    mix: 0.4,
    filterType: 'lowpass',
    filterFrequency: 1000,
    filterResonance: 1.0,
    filterOrder: 12
  },
  maxNoteDuration: '1/4'
};

// Convert musical duration to seconds based on BPM
export function musicalDurationToSeconds(duration: MusicalDuration, bpm: number): number {
  const beatSeconds = 60 / bpm;  // Quarter note duration
  const wholeNote = beatSeconds * 4;
  
  const baseValues: Record<string, number> = {
    '2/1': wholeNote*2,
    '1/1': wholeNote,
    '1/2': wholeNote / 2,
    '1/4': wholeNote / 4,
    '1/8': wholeNote / 8,
    '1/16': wholeNote / 16,
    '1/32': wholeNote / 32
  };
  
  // Extract base and modifier
  const base = duration.replace(/[TD]$/, '');
  const modifier = duration.slice(-1);
  
  let value = baseValues[base] || wholeNote / 4;
  
  if (modifier === 'T') {
    // Triplet: 2/3 of the base value
    value = value * (2 / 3);
  } else if (modifier === 'D') {
    // Dotted: 1.5 times the base value
    value = value * 1.5;
  }
  
  return value;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Voice {
  oscillator: OscillatorNode | null;
  gainNode: GainNode | null;
  startTime: number;
  endTime: number;
}

/**
 * PCS Relation Graph for navigating between pitch class sets.
 * Uses precomputed graph data for instant initialization.
 */
class PcsRelationGraph {
  private nodes: Pcs12[];
  private adjacency: number[][];
  private currentIndex: number;

  constructor() {
    // Load precomputed data
    this.nodes = pcsGraphData.nodes.map(str => Pcs12.fromBinaryString(str));
    this.adjacency = pcsGraphData.adjacency;
    this.currentIndex = Math.floor(Math.random() * this.nodes.length);
  }

  current(): Pcs12 {
    return this.nodes[this.currentIndex];
  }

  advance(): void {
    if (this.nodes.length === 0) return;

    const neighbors = this.adjacency[this.currentIndex];
    if (neighbors.length > 0) {
      this.currentIndex = neighbors[Math.floor(Math.random() * neighbors.length)];
      return;
    }
    
    this.currentIndex = Math.floor(Math.random() * this.nodes.length);
  }
}

/**
 * Main music engine using Web Audio API directly.
 */
export class MusicEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayFilters: BiquadFilterNode[] = [];
  private delayDryGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;
  private delayInputGain: GainNode | null = null;
  private isPlaying: boolean = false;
  private pcsGraph: PcsRelationGraph;
  private activePitchClasses: number[] = [];
  private voices: Voice[] = [];
  private nextNoteTime: number = 0;
  private nextGraphHopTime: number = 0;
  private schedulerId: number | null = null;
  private synthParams: SynthParams = JSON.parse(JSON.stringify(DEFAULT_SYNTH_PARAMS));
  
  // Timing parameters
  private bpm: number = DEFAULT_BPM;
  private meanNotesPerBar: number = DEFAULT_MEAN_NOTES_PER_BAR;
  
  // Callbacks
  onChordChange?: (chord: string) => void;
  onNoteTriggered?: (pitchClass: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;

  constructor() {
    this.pcsGraph = new PcsRelationGraph();
    this.setupMediaSession();
  }

  // Computed timing values
  private get sixteenthSeconds(): number {
    return (60 / this.bpm) / 4;
  }

  private get barSeconds(): number {
    return 4 * (60 / this.bpm);
  }

  private get lambda(): number {
    return this.meanNotesPerBar / this.barSeconds;
  }

  private setupMediaSession(): void {
    if ('mediaSession' in navigator) {
      const assetPath = (file: string) => `${import.meta.env.BASE_URL}${file}`;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'NCG777 Music Box',
        artist: 'Generative Ambient',
        album: 'Pitch Class Sets',
        artwork: [
          { src: assetPath('pwa-192x192.svg'), sizes: '192x192', type: 'image/svg+xml' },
          { src: assetPath('pwa-512x512.svg'), sizes: '512x512', type: 'image/svg+xml' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        this.start();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        this.stop();
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        this.stop();
      });
    }
  }

  private updateMediaSessionState(): void {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
    }
  }

  setLambda(meanNotesPerBar: number): void {
    this.meanNotesPerBar = meanNotesPerBar;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(20, Math.min(300, bpm)); // Clamp to reasonable range
  }

  getBpm(): number {
    return this.bpm;
  }

  setSynthParams(params: Partial<SynthParams>): void {
    if (params.envelope) {
      this.synthParams.envelope = { ...this.synthParams.envelope, ...params.envelope };
    }
    if (params.vibrato) {
      this.synthParams.vibrato = { ...this.synthParams.vibrato, ...params.vibrato };
    }
    if (params.tremolo) {
      this.synthParams.tremolo = { ...this.synthParams.tremolo, ...params.tremolo };
    }
    if (params.delay) {
      this.synthParams.delay = { ...this.synthParams.delay, ...params.delay };
      this.updateDelayParams();
    }
    if (params.maxNoteDuration !== undefined) {
      this.synthParams.maxNoteDuration = params.maxNoteDuration;
    }
  }

  private updateDelayParams(): void {
    if (!this.audioContext) return;
    
    const { enabled, duration, feedback, mix, filterType, filterFrequency, filterResonance, filterOrder } = this.synthParams.delay;
    
    // Update delay time
    if (this.delayNode) {
      const delaySeconds = musicalDurationToSeconds(duration, this.bpm);
      this.delayNode.delayTime.setTargetAtTime(delaySeconds, this.audioContext.currentTime, 0.05);
    }
    
    // Update feedback gain
    if (this.delayFeedbackGain) {
      this.delayFeedbackGain.gain.setTargetAtTime(
        enabled ? Math.min(feedback, 0.95) : 0,
        this.audioContext.currentTime,
        0.05
      );
    }
    
    // Update dry/wet mix
    if (this.delayDryGain && this.delayWetGain) {
      this.delayDryGain.gain.setTargetAtTime(1 - (enabled ? mix : 0), this.audioContext.currentTime, 0.05);
      this.delayWetGain.gain.setTargetAtTime(enabled ? mix : 0, this.audioContext.currentTime, 0.05);
    }
    
    // Update filters
    this.updateDelayFilters(filterType, filterFrequency, filterResonance, filterOrder);
  }

  private updateDelayFilters(type: DelayFilterType, frequency: number, resonance: number, order: DelayFilterOrder): void {
    if (!this.audioContext) return;
    
    const numFilters = order / 6;  // 6dB per filter stage
    
    // If we need to recreate filters (different count)
    if (this.delayFilters.length !== numFilters) {
      this.recreateDelayFilterChain(type, frequency, resonance, numFilters);
      return;
    }
    
    // Just update existing filter params
    for (const filter of this.delayFilters) {
      filter.type = type;
      filter.frequency.setTargetAtTime(frequency, this.audioContext.currentTime, 0.05);
      filter.Q.setTargetAtTime(resonance, this.audioContext.currentTime, 0.05);
    }
  }

  private recreateDelayFilterChain(type: DelayFilterType, frequency: number, resonance: number, numFilters: number): void {
    if (!this.audioContext || !this.delayNode || !this.delayFeedbackGain || !this.delayWetGain) return;
    
    // Disconnect old filters
    for (const filter of this.delayFilters) {
      try { filter.disconnect(); } catch (e) {}
    }
    
    // Create new filters
    this.delayFilters = [];
    for (let i = 0; i < numFilters; i++) {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = resonance;
      this.delayFilters.push(filter);
    }
    
    // Reconnect: delayNode -> filters -> feedbackGain & wetGain
    try {
      this.delayNode.disconnect();
    } catch (e) {}
    
    if (this.delayFilters.length > 0) {
      this.delayNode.connect(this.delayFilters[0]);
      for (let i = 0; i < this.delayFilters.length - 1; i++) {
        this.delayFilters[i].connect(this.delayFilters[i + 1]);
      }
      const lastFilter = this.delayFilters[this.delayFilters.length - 1];
      lastFilter.connect(this.delayFeedbackGain);
      lastFilter.connect(this.delayWetGain);
    } else {
      this.delayNode.connect(this.delayFeedbackGain);
      this.delayNode.connect(this.delayWetGain);
    }
  }

  getSynthParams(): SynthParams {
    return { ...this.synthParams };
  }

  private generateExponentialDelay(): number {
    // Exponential distribution with rate lambda
    return -Math.log(1 - Math.random()) / this.lambda;
  }

  private quantizeToSixteenth(time: number): number {
    return Math.ceil(time / this.sixteenthSeconds) * this.sixteenthSeconds;
  }

  private refreshPitchClasses(): void {
    this.activePitchClasses = this.pcsGraph.current().asSequence();
    if (this.onChordChange) {
      this.onChordChange(this.pcsGraph.current().toString());
    }
  }

  private createDelayMixNode(): GainNode | null {
    if (!this.audioContext || !this.delayDryGain || !this.delayWetGain) return null;
    
    const mixNode = this.audioContext.createGain();
    mixNode.gain.value = 1.0;
    this.delayDryGain.connect(mixNode);
    this.delayWetGain.connect(mixNode);
    return mixNode;
  }

  private createDelayEffect(): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const { enabled, duration, feedback, mix, filterType, filterFrequency, filterResonance, filterOrder } = this.synthParams.delay;
    const delaySeconds = musicalDurationToSeconds(duration, this.bpm);
    
    // Create delay node (max 5 seconds for whole notes at slow tempos)
    this.delayNode = this.audioContext.createDelay(5.0);
    this.delayNode.delayTime.value = delaySeconds;
    
    // Create feedback gain
    this.delayFeedbackGain = this.audioContext.createGain();
    this.delayFeedbackGain.gain.value = enabled ? Math.min(feedback, 0.95) : 0;
    
    // Create dry/wet gains
    this.delayDryGain = this.audioContext.createGain();
    this.delayWetGain = this.audioContext.createGain();
    this.delayDryGain.gain.value = 1 - (enabled ? mix : 0);
    this.delayWetGain.gain.value = enabled ? mix : 0;
    
    // Create input gain for delay line
    this.delayInputGain = this.audioContext.createGain();
    this.delayInputGain.gain.value = 1.0;
    
    // Create filter chain
    const numFilters = filterOrder / 6;
    this.delayFilters = [];
    for (let i = 0; i < numFilters; i++) {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFrequency;
      filter.Q.value = filterResonance;
      this.delayFilters.push(filter);
    }
    
    // Connect the delay chain:
    // masterGain -> delayDryGain (dry path)
    // masterGain -> delayInputGain -> delayNode -> filters -> delayWetGain (wet path)
    //                                           -> filters -> delayFeedbackGain -> delayInputGain (feedback loop)
    
    this.masterGain.connect(this.delayDryGain);
    this.masterGain.connect(this.delayInputGain);
    this.delayInputGain.connect(this.delayNode);
    
    if (this.delayFilters.length > 0) {
      this.delayNode.connect(this.delayFilters[0]);
      for (let i = 0; i < this.delayFilters.length - 1; i++) {
        this.delayFilters[i].connect(this.delayFilters[i + 1]);
      }
      const lastFilter = this.delayFilters[this.delayFilters.length - 1];
      lastFilter.connect(this.delayFeedbackGain);
      lastFilter.connect(this.delayWetGain);
    } else {
      this.delayNode.connect(this.delayFeedbackGain);
      this.delayNode.connect(this.delayWetGain);
    }
    
    this.delayFeedbackGain.connect(this.delayInputGain);
  }

  private createSimpleReverb(): ConvolverNode | null {
    if (!this.audioContext) return null;
    
    try {
      const convolver = this.audioContext.createConvolver();
      const rate = this.audioContext.sampleRate;
      const length = rate * 3; // 3 second reverb tail
      const impulse = this.audioContext.createBuffer(2, length, rate);
      
      // Create a more natural sounding reverb impulse response
      const decay = 2.5; // decay time constant
      
      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          const t = i / rate;
          // Exponential decay envelope
          const envelope = Math.exp(-t / decay);
          // Add some early reflections
          let early = 0;
          if (i < rate * 0.1) {
            // Early reflections in first 100ms
            const delays = [0.01, 0.023, 0.037, 0.052, 0.068, 0.083];
            for (const d of delays) {
              if (Math.abs(t - d) < 0.001) {
                early = (Math.random() * 2 - 1) * 0.5;
              }
            }
          }
          // Diffuse late reverb with filtered noise
          const noise = (Math.random() * 2 - 1) * envelope * 0.3;
          channelData[i] = early + noise;
        }
      }
      
      convolver.buffer = impulse;
      return convolver;
    } catch (e) {
      console.warn('Failed to create reverb:', e);
      return null;
    }
  }

  private cleanupOldVoices(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    this.voices = this.voices.filter(voice => {
      if (voice.endTime < now - 0.5) {
        // Voice has finished, clean up
        try {
          if (voice.oscillator) {
            voice.oscillator.disconnect();
          }
          if (voice.gainNode) {
            voice.gainNode.disconnect();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        return false;
      }
      return true;
    });
  }

  private triggerNote(frequency: number, when: number, duration: number): void {
    if (!this.audioContext || !this.masterGain) return;
    
    // Clean up old voices first
    this.cleanupOldVoices();
    
    // Limit active voices
    if (this.voices.length >= MAX_VOICES) {
      // Remove oldest voice
      const oldest = this.voices.shift();
      if (oldest) {
        try {
          if (oldest.oscillator) {
            oldest.oscillator.stop();
            oldest.oscillator.disconnect();
          }
          if (oldest.gainNode) {
            oldest.gainNode.disconnect();
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    const { attack, decay, sustain, release } = this.synthParams.envelope;
    const { rate: vibratoRate, depth: vibratoDepth } = this.synthParams.vibrato;
    const { rate: tremoloRate, depth: tremoloDepth } = this.synthParams.tremolo;
    
    // Create main oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, when);
    
    // Create vibrato (frequency modulation) using LFO
    const vibratoLFO = this.audioContext.createOscillator();
    const vibratoGain = this.audioContext.createGain();
    vibratoLFO.type = 'sine';
    vibratoLFO.frequency.setValueAtTime(vibratoRate, when);
    // Vibrato depth is in semitones, convert to frequency deviation
    vibratoGain.gain.setValueAtTime(frequency * vibratoDepth, when);
    vibratoLFO.connect(vibratoGain);
    vibratoGain.connect(oscillator.frequency);
    
    // Create tremolo (amplitude modulation) using LFO
    const tremoloLFO = this.audioContext.createOscillator();
    const tremoloGain = this.audioContext.createGain();
    const tremoloDepthNode = this.audioContext.createGain();
    tremoloLFO.type = 'sine';
    tremoloLFO.frequency.setValueAtTime(tremoloRate, when);
    // Tremolo oscillates between (1 - depth) and 1
    tremoloGain.gain.setValueAtTime(1 - tremoloDepth / 2, when);
    tremoloDepthNode.gain.setValueAtTime(tremoloDepth / 2, when);
    tremoloLFO.connect(tremoloDepthNode);
    
    // Create gain for envelope
    const envelopeGain = this.audioContext.createGain();
    envelopeGain.gain.setValueAtTime(0, when);
    
    // ADSR envelope
    const peakTime = when + attack;
    const decayEndTime = peakTime + decay;
    const releaseStartTime = when + duration;
    const releaseEndTime = releaseStartTime + release;
    
    // Attack
    envelopeGain.gain.linearRampToValueAtTime(0.3, peakTime);
    // Decay to sustain
    envelopeGain.gain.linearRampToValueAtTime(0.3 * sustain, decayEndTime);
    // Hold sustain until release
    envelopeGain.gain.setValueAtTime(0.3 * sustain, releaseStartTime);
    // Release
    envelopeGain.gain.linearRampToValueAtTime(0, releaseEndTime);
    
    // Connect chain: oscillator -> envelope -> tremolo mix -> master
    oscillator.connect(envelopeGain);
    envelopeGain.connect(tremoloGain);
    tremoloDepthNode.connect(tremoloGain.gain);
    tremoloGain.connect(this.masterGain);
    
    // Start oscillators
    oscillator.start(when);
    vibratoLFO.start(when);
    tremoloLFO.start(when);
    
    // Stop oscillators
    oscillator.stop(releaseEndTime + 0.1);
    vibratoLFO.stop(releaseEndTime + 0.1);
    tremoloLFO.stop(releaseEndTime + 0.1);
    
    // Track the voice
    this.voices.push({
      oscillator,
      gainNode: envelopeGain,
      startTime: when,
      endTime: releaseEndTime
    });
  }

  private triggerRandomNote(whenTime: number): void {
    if (this.activePitchClasses.length === 0) {
      return;
    }

    const pitchClass = this.activePitchClasses[
      Math.floor(Math.random() * this.activePitchClasses.length)
    ];
    const octave = OCTAVE_MIN + Math.floor(Math.random() * (OCTAVE_MAX - OCTAVE_MIN + 1));
    const midi = octave * 12 + pitchClass;
    const frequency = midiToFreq(midi);
    const maxDurationSeconds = musicalDurationToSeconds(this.synthParams.maxNoteDuration, this.bpm);
    const duration = maxDurationSeconds * (0.5 + Math.random() * 0.5);

    console.log('Triggering note:', { pitchClass, octave, frequency: frequency.toFixed(1), whenTime: whenTime.toFixed(2) });
    
    this.triggerNote(frequency, whenTime, duration);
    
    if (this.onNoteTriggered) {
      this.onNoteTriggered(pitchClass);
    }
  }

  private scheduleNextNote(currentTime: number): void {
    const deltaSeconds = Math.max(0.01, this.generateExponentialDelay());
    const target = currentTime + deltaSeconds;
    this.nextNoteTime = this.quantizeToSixteenth(target);
  }

  private scheduler(): void {
    if (!this.isPlaying || !this.audioContext) {
      return;
    }

    const currentTime = this.audioContext.currentTime;
    const lookAhead = 0.2; // 200ms lookahead

    // Check for graph hop (chord change)
    if (currentTime >= this.nextGraphHopTime - lookAhead) {
      this.pcsGraph.advance();
      this.refreshPitchClasses();
      this.nextGraphHopTime += this.barSeconds * BARS_PER_CHANGE;
    }

    // Check for note events
    let notesTriggered = 0;
    while (this.nextNoteTime <= currentTime + lookAhead && notesTriggered < 3) {
      const noteTime = Math.max(this.nextNoteTime, currentTime + 0.02);
      this.triggerRandomNote(noteTime);
      this.scheduleNextNote(this.nextNoteTime);
      notesTriggered++;
    }

    // Schedule next check
    this.schedulerId = window.setTimeout(() => this.scheduler(), 50);
  }

  async start(): Promise<void> {
    if (this.isPlaying) return;

    try {
      console.log('Creating AudioContext...');
      
      // Create or resume audio context
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      console.log('AudioContext state:', this.audioContext.state);

      // Create master gain
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.5;
      
      // Create delay effect
      this.createDelayEffect();
      
      // Create reverb
      this.reverbNode = this.createSimpleReverb();
      
      // Get the output of the delay effect (or master if no delay)
      const delayOutput = this.delayDryGain && this.delayWetGain ? null : this.masterGain;
      const signalSource = delayOutput || this.createDelayMixNode();
      
      if (this.reverbNode && signalSource) {
        // Dry/wet mix: 70% dry, 30% wet
        const dryGain = this.audioContext.createGain();
        const wetGain = this.audioContext.createGain();
        dryGain.gain.value = 0.7;
        wetGain.gain.value = 0.3;
        
        signalSource.connect(dryGain);
        signalSource.connect(this.reverbNode);
        this.reverbNode.connect(wetGain);
        
        dryGain.connect(this.audioContext.destination);
        wetGain.connect(this.audioContext.destination);
      } else if (signalSource) {
        // No reverb, connect directly
        signalSource.connect(this.audioContext.destination);
      }
      
      console.log('Audio chain ready');

      this.refreshPitchClasses();
      console.log('Initial pitch classes:', this.activePitchClasses);

      // Set initial timing
      const startTime = this.audioContext.currentTime;
      this.nextNoteTime = startTime + 0.1;
      this.nextGraphHopTime = startTime + this.barSeconds * BARS_PER_CHANGE;
      this.scheduleNextNote(startTime);

      this.isPlaying = true;
      this.updateMediaSessionState();
      if (this.onPlayStateChange) {
        this.onPlayStateChange(true);
      }
      
      console.log('Starting scheduler');
      this.scheduler();
    } catch (error) {
      console.error('Failed to start audio engine:', error);
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.isPlaying = false;

    if (this.schedulerId !== null) {
      clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }

    // Stop all voices
    for (const voice of this.voices) {
      try {
        if (voice.oscillator) {
          voice.oscillator.stop();
          voice.oscillator.disconnect();
        }
        if (voice.gainNode) {
          voice.gainNode.disconnect();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    this.voices = [];

    // Disconnect nodes
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch (e) {}
      this.masterGain = null;
    }
    
    // Disconnect delay nodes
    if (this.delayNode) {
      try { this.delayNode.disconnect(); } catch (e) {}
      this.delayNode = null;
    }
    if (this.delayFeedbackGain) {
      try { this.delayFeedbackGain.disconnect(); } catch (e) {}
      this.delayFeedbackGain = null;
    }
    if (this.delayDryGain) {
      try { this.delayDryGain.disconnect(); } catch (e) {}
      this.delayDryGain = null;
    }
    if (this.delayWetGain) {
      try { this.delayWetGain.disconnect(); } catch (e) {}
      this.delayWetGain = null;
    }
    if (this.delayInputGain) {
      try { this.delayInputGain.disconnect(); } catch (e) {}
      this.delayInputGain = null;
    }
    for (const filter of this.delayFilters) {
      try { filter.disconnect(); } catch (e) {}
    }
    this.delayFilters = [];
    
    if (this.reverbNode) {
      try {
        this.reverbNode.disconnect();
      } catch (e) {}
      this.reverbNode = null;
    }

    // Suspend audio context to save resources
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend();
    }

    this.updateMediaSessionState();
    if (this.onPlayStateChange) {
      this.onPlayStateChange(false);
    }
  }

  toggle(): Promise<void> {
    if (this.isPlaying) {
      this.stop();
      return Promise.resolve();
    } else {
      return this.start();
    }
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Generate music data for n hyperbars (1 hyperbar = 8 bars)
   * Returns scheduled note events for offline rendering
   */
  private generateMusicData(numHyperbars: number): Array<{ midiNote: number; startTime: number; duration: number }> {
    const notes: Array<{ midiNote: number; startTime: number; duration: number }> = [];
    const totalBars = numHyperbars * 8;
    const totalDuration = totalBars * this.barSeconds;
    
    // Create a local PCS graph for generation
    const localPcsGraph = new PcsRelationGraph();
    let currentPitchClasses = localPcsGraph.current().asSequence();
    
    let nextGraphHopTime = this.barSeconds * BARS_PER_CHANGE;
    
    // Local lambda for exponential delay
    const lambda = this.meanNotesPerBar / this.barSeconds;
    const generateExponentialDelay = () => -Math.log(1 - Math.random()) / lambda;
    const quantizeToSixteenth = (time: number) => Math.ceil(time / this.sixteenthSeconds) * this.sixteenthSeconds;
    
    // Schedule next note time
    let nextNoteTime = quantizeToSixteenth(generateExponentialDelay());
    
    while (nextNoteTime < totalDuration) {
      // Check for chord changes
      while (nextNoteTime >= nextGraphHopTime && nextGraphHopTime < totalDuration) {
        localPcsGraph.advance();
        currentPitchClasses = localPcsGraph.current().asSequence();
        nextGraphHopTime += this.barSeconds * BARS_PER_CHANGE;
      }
      
      // Generate a note
      if (currentPitchClasses.length > 0) {
        const pitchClass = currentPitchClasses[Math.floor(Math.random() * currentPitchClasses.length)];
        const octave = OCTAVE_MIN + Math.floor(Math.random() * (OCTAVE_MAX - OCTAVE_MIN + 1));
        const midiNote = octave * 12 + pitchClass;
        const maxDurationSeconds = musicalDurationToSeconds(this.synthParams.maxNoteDuration, this.bpm);
        const duration = maxDurationSeconds * (0.5 + Math.random() * 0.5);
        
        notes.push({
          midiNote,
          startTime: nextNoteTime,
          duration
        });
      }
      
      // Schedule next note
      const deltaSeconds = Math.max(0.01, generateExponentialDelay());
      const target = nextNoteTime + deltaSeconds;
      nextNoteTime = quantizeToSixteenth(target);
    }
    
    return notes;
  }

  /**
   * Export to WAV file
   * @param numHyperbars Number of hyperbars (8 bars each) to generate
   * @param onProgress Optional progress callback
   */
  async exportToWav(numHyperbars: number, onProgress?: (progress: number) => void): Promise<Blob> {
    const notes = this.generateMusicData(numHyperbars);
    const totalBars = numHyperbars * 8;
    const totalDuration = totalBars * this.barSeconds;
    
    // Calculate the tail needed after the last scheduled note ends
    const { attack, decay: decayTime, sustain, release } = this.synthParams.envelope;
    const { enabled: delayEnabled, feedback, duration: delayDuration } = this.synthParams.delay;
    
    // Find when the last note actually ends (including release)
    let lastNoteEndTime = totalDuration;
    for (const note of notes) {
      const noteEnd = note.startTime + note.duration + release;
      if (noteEnd > lastNoteEndTime) {
        lastNoteEndTime = noteEnd;
      }
    }
    
    // Calculate delay tail: time for delay feedback to decay to -60dB
    // Decay time = -60dB / (20 * log10(feedback)) * delayTime
    const delaySeconds = musicalDurationToSeconds(delayDuration, this.bpm);
    let delayTail = 0;
    if (delayEnabled && feedback > 0.01) {
      // Number of repeats to decay to -60dB
      const repeatsTo60dB = Math.ceil(-60 / (20 * Math.log10(feedback)));
      delayTail = repeatsTo60dB * delaySeconds;
    }
    
    // Reverb tail (3 seconds for our reverb)
    const reverbTail = 3;
    
    // Total render duration: last note end + max(delay tail, reverb tail) + safety margin
    const tailDuration = Math.max(delayTail, reverbTail) + 1;
    const totalRenderDuration = lastNoteEndTime + tailDuration;
    
    const sampleRate = 44100;
    const offlineContext = new OfflineAudioContext(2, Math.ceil(totalRenderDuration * sampleRate), sampleRate);
    
    // Create master gain
    const masterGain = offlineContext.createGain();
    masterGain.gain.value = 0.5;
    
    // Create delay effect for offline context
    const { mix, filterType, filterFrequency, filterResonance, filterOrder } = this.synthParams.delay;
    
    const delayNode = offlineContext.createDelay(5.0);
    delayNode.delayTime.value = delaySeconds;
    
    const delayFeedbackGain = offlineContext.createGain();
    delayFeedbackGain.gain.value = delayEnabled ? Math.min(feedback, 0.95) : 0;
    
    const delayDryGain = offlineContext.createGain();
    const delayWetGain = offlineContext.createGain();
    delayDryGain.gain.value = 1 - (delayEnabled ? mix : 0);
    delayWetGain.gain.value = delayEnabled ? mix : 0;
    
    const delayInputGain = offlineContext.createGain();
    delayInputGain.gain.value = 1.0;
    
    // Create filter chain
    const numFilters = filterOrder / 6;
    const delayFilters: BiquadFilterNode[] = [];
    for (let i = 0; i < numFilters; i++) {
      const filter = offlineContext.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFrequency;
      filter.Q.value = filterResonance;
      delayFilters.push(filter);
    }
    
    // Connect delay chain
    masterGain.connect(delayDryGain);
    masterGain.connect(delayInputGain);
    delayInputGain.connect(delayNode);
    
    if (delayFilters.length > 0) {
      delayNode.connect(delayFilters[0]);
      for (let i = 0; i < delayFilters.length - 1; i++) {
        delayFilters[i].connect(delayFilters[i + 1]);
      }
      const lastFilter = delayFilters[delayFilters.length - 1];
      lastFilter.connect(delayFeedbackGain);
      lastFilter.connect(delayWetGain);
    } else {
      delayNode.connect(delayFeedbackGain);
      delayNode.connect(delayWetGain);
    }
    
    delayFeedbackGain.connect(delayInputGain);
    
    // Create reverb
    const convolver = offlineContext.createConvolver();
    const impulseLength = sampleRate * 3;
    const impulse = offlineContext.createBuffer(2, impulseLength, sampleRate);
    const decayConst = 2.5;
    
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < impulseLength; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t / decayConst);
        let early = 0;
        if (i < sampleRate * 0.1) {
          const delays = [0.01, 0.023, 0.037, 0.052, 0.068, 0.083];
          for (const d of delays) {
            if (Math.abs(t - d) < 0.001) {
              early = (Math.random() * 2 - 1) * 0.5;
            }
          }
        }
        const noise = (Math.random() * 2 - 1) * envelope * 0.3;
        channelData[i] = early + noise;
      }
    }
    convolver.buffer = impulse;
    
    // Create mix node for delay
    const delayMixNode = offlineContext.createGain();
    delayMixNode.gain.value = 1.0;
    delayDryGain.connect(delayMixNode);
    delayWetGain.connect(delayMixNode);
    
    // Connect reverb
    const dryGain = offlineContext.createGain();
    const wetGain = offlineContext.createGain();
    dryGain.gain.value = 0.7;
    wetGain.gain.value = 0.3;
    
    delayMixNode.connect(dryGain);
    delayMixNode.connect(convolver);
    convolver.connect(wetGain);
    
    dryGain.connect(offlineContext.destination);
    wetGain.connect(offlineContext.destination);
    
    // Schedule all notes (envelope params already extracted above)
    const { rate: vibratoRate, depth: vibratoDepth } = this.synthParams.vibrato;
    const { rate: tremoloRate, depth: tremoloDepth } = this.synthParams.tremolo;
    
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const frequency = midiToFreq(note.midiNote);
      const when = note.startTime;
      const noteDuration = note.duration;
      
      // Create oscillator
      const oscillator = offlineContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, when);
      
      // Create vibrato
      const vibratoLFO = offlineContext.createOscillator();
      const vibratoGain = offlineContext.createGain();
      vibratoLFO.type = 'sine';
      vibratoLFO.frequency.setValueAtTime(vibratoRate, when);
      vibratoGain.gain.setValueAtTime(frequency * vibratoDepth, when);
      vibratoLFO.connect(vibratoGain);
      vibratoGain.connect(oscillator.frequency);
      
      // Create tremolo
      const tremoloLFO = offlineContext.createOscillator();
      const tremoloGain = offlineContext.createGain();
      const tremoloDepthNode = offlineContext.createGain();
      tremoloLFO.type = 'sine';
      tremoloLFO.frequency.setValueAtTime(tremoloRate, when);
      tremoloGain.gain.setValueAtTime(1 - tremoloDepth / 2, when);
      tremoloDepthNode.gain.setValueAtTime(tremoloDepth / 2, when);
      tremoloLFO.connect(tremoloDepthNode);
      
      // Create envelope gain
      const envelopeGain = offlineContext.createGain();
      envelopeGain.gain.setValueAtTime(0, when);
      
      // ADSR envelope
      const peakTime = when + attack;
      const decayEndTime = peakTime + decayTime;
      const releaseStartTime = when + noteDuration;
      const releaseEndTime = releaseStartTime + release;
      
      envelopeGain.gain.linearRampToValueAtTime(0.3, peakTime);
      envelopeGain.gain.linearRampToValueAtTime(0.3 * sustain, decayEndTime);
      envelopeGain.gain.setValueAtTime(0.3 * sustain, releaseStartTime);
      envelopeGain.gain.linearRampToValueAtTime(0, releaseEndTime);
      
      // Connect chain
      oscillator.connect(envelopeGain);
      envelopeGain.connect(tremoloGain);
      tremoloDepthNode.connect(tremoloGain.gain);
      tremoloGain.connect(masterGain);
      
      // Start and stop oscillators
      oscillator.start(when);
      vibratoLFO.start(when);
      tremoloLFO.start(when);
      oscillator.stop(releaseEndTime + 0.1);
      vibratoLFO.stop(releaseEndTime + 0.1);
      tremoloLFO.stop(releaseEndTime + 0.1);
      
      if (onProgress && i % 100 === 0) {
        onProgress(i / notes.length * 0.5);
      }
    }
    
    if (onProgress) onProgress(0.5);
    
    // Render audio
    const audioBuffer = await offlineContext.startRendering();
    
    if (onProgress) onProgress(0.8);
    
    // Trim silence from the end
    const trimmedBuffer = this.trimSilence(audioBuffer);
    
    if (onProgress) onProgress(0.9);
    
    // Convert to WAV
    const wavBlob = this.audioBufferToWav(trimmedBuffer);
    
    if (onProgress) onProgress(1.0);
    
    return wavBlob;
  }

  /**
   * Trim silence from the end of an audio buffer
   * @param buffer The audio buffer to trim
   * @param threshold Amplitude threshold below which is considered silence (default: 0.001)
   * @param minSilenceSeconds Minimum silence to keep at the end (default: 0.5)
   */
  private trimSilence(buffer: AudioBuffer, threshold: number = 0.001, minSilenceSeconds: number = 0.5): AudioBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const minSilenceSamples = Math.floor(minSilenceSeconds * sampleRate);
    
    // Find the last sample above threshold in any channel
    let lastSoundSample = 0;
    
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (Math.abs(channelData[i]) > threshold) {
          if (i > lastSoundSample) {
            lastSoundSample = i;
          }
          break;
        }
      }
    }
    
    // Add minimum silence padding and clamp to buffer length
    const endSample = Math.min(lastSoundSample + minSilenceSamples, buffer.length);
    
    // If we're not trimming much, just return the original
    if (endSample >= buffer.length - sampleRate) {
      return buffer;
    }
    
    // Create a new trimmed buffer
    const trimmedBuffer = new AudioContext().createBuffer(numChannels, endSample, sampleRate);
    
    for (let ch = 0; ch < numChannels; ch++) {
      const sourceData = buffer.getChannelData(ch);
      const destData = trimmedBuffer.getChannelData(ch);
      for (let i = 0; i < endSample; i++) {
        destData[i] = sourceData[i];
      }
    }
    
    return trimmedBuffer;
  }

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;
    
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    
    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);
    
    // Write WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Interleave and write samples
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = channels[ch][i];
        // Clamp
        sample = Math.max(-1, Math.min(1, sample));
        // Convert to 16-bit integer
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Export to MIDI file
   * @param numHyperbars Number of hyperbars (8 bars each) to generate
   */
  exportToMidi(numHyperbars: number): Blob {
    const notes = this.generateMusicData(numHyperbars);
    
    // Convert notes to MIDI events
    const ticksPerSecond = (TICKS_PER_BEAT * this.bpm) / 60;
    
    const events: Array<{ tick: number; type: 'on' | 'off'; note: number; velocity: number }> = [];
    
    for (const note of notes) {
      const startTick = Math.round(note.startTime * ticksPerSecond);
      const endTick = Math.round((note.startTime + note.duration) * ticksPerSecond);
      
      events.push({ tick: startTick, type: 'on', note: note.midiNote, velocity: 80 });
      events.push({ tick: endTick, type: 'off', note: note.midiNote, velocity: 0 });
    }
    
    // Sort by tick
    events.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));
    
    // Build track data
    const trackData: number[] = [];
    
    // Tempo meta event
    const microsecondsPerBeat = Math.round(60000000 / this.bpm);
    trackData.push(0x00); // Delta time
    trackData.push(0xFF, 0x51, 0x03); // Tempo meta event
    trackData.push((microsecondsPerBeat >> 16) & 0xFF);
    trackData.push((microsecondsPerBeat >> 8) & 0xFF);
    trackData.push(microsecondsPerBeat & 0xFF);
    
    // Time signature (4/4)
    trackData.push(0x00);
    trackData.push(0xFF, 0x58, 0x04);
    trackData.push(0x04, 0x02, 0x18, 0x08);
    
    // Note events
    let lastTick = 0;
    for (const event of events) {
      const deltaTick = event.tick - lastTick;
      lastTick = event.tick;
      
      // Write variable-length delta time
      this.writeVariableLength(trackData, deltaTick);
      
      // Write note event
      if (event.type === 'on') {
        trackData.push(0x90); // Note on, channel 0
        trackData.push(event.note & 0x7F);
        trackData.push(event.velocity & 0x7F);
      } else {
        trackData.push(0x80); // Note off, channel 0
        trackData.push(event.note & 0x7F);
        trackData.push(0x00);
      }
    }
    
    // End of track
    trackData.push(0x00);
    trackData.push(0xFF, 0x2F, 0x00);
    
    // Build complete MIDI file
    const midiData: number[] = [];
    
    // File header
    midiData.push(...MIDI_HEADER);
    midiData.push(0x00, 0x00, 0x00, 0x06); // Header length
    midiData.push(0x00, 0x00); // Format 0
    midiData.push(0x00, 0x01); // 1 track
    midiData.push((TICKS_PER_BEAT >> 8) & 0xFF, TICKS_PER_BEAT & 0xFF);
    
    // Track header
    midiData.push(...MIDI_TRACK_HEADER);
    const trackLength = trackData.length;
    midiData.push((trackLength >> 24) & 0xFF);
    midiData.push((trackLength >> 16) & 0xFF);
    midiData.push((trackLength >> 8) & 0xFF);
    midiData.push(trackLength & 0xFF);
    
    // Track data
    midiData.push(...trackData);
    
    return new Blob([new Uint8Array(midiData)], { type: 'audio/midi' });
  }

  private writeVariableLength(data: number[], value: number): void {
    if (value < 0) value = 0;
    
    const bytes: number[] = [];
    bytes.push(value & 0x7F);
    value >>= 7;
    
    while (value > 0) {
      bytes.push((value & 0x7F) | 0x80);
      value >>= 7;
    }
    
    bytes.reverse();
    data.push(...bytes);
  }
}
