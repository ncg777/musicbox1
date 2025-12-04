import { Pcs12 } from './pcs12';
import pcsGraphData from './pcsGraphData.json';

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
  | '1/1' | '1/1T' | '1/1D'
  | '1/2' | '1/2T' | '1/2D'
  | '1/4' | '1/4T' | '1/4D'
  | '1/8' | '1/8T' | '1/8D'
  | '1/16' | '1/16T' | '1/16D'
  | '1/32' | '1/32T' | '1/32D';

export const MUSICAL_DURATIONS: MusicalDuration[] = [
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
  maxNoteDuration: number;
}

export const DEFAULT_SYNTH_PARAMS: SynthParams = {
  envelope: {
    attack: 0.01,
    decay: 0.1,
    sustain: 0.8,
    release: 1.8
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
    enabled: false,
    duration: '1/4',
    feedback: 0.4,
    mix: 0.3,
    filterType: 'lowpass',
    filterFrequency: 2000,
    filterResonance: 1.0,
    filterOrder: 12
  },
  maxNoteDuration: 2.4
};

// Convert musical duration to seconds based on BPM
export function musicalDurationToSeconds(duration: MusicalDuration, bpm: number): number {
  const beatSeconds = 60 / bpm;  // Quarter note duration
  const wholeNote = beatSeconds * 4;
  
  const baseValues: Record<string, number> = {
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
    const duration = this.synthParams.maxNoteDuration * (0.5 + Math.random() * 0.5);

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
}
