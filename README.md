# NCG777 Music Box PWA

A Vue.js TypeScript Progressive Web App that generates ambient generative music using pitch class sets. This is a port of the Arduino-based ESP32 Bluetooth music box to a web application using Tone.js for audio synthesis.

## Features

- **Generative Music**: Uses pitch class set theory to create evolving harmonic progressions
- **Sine Wave Synthesis**: Clean, bell-like tones with vibrato and tremolo
- **Adjustable Density**: Control the rate of note generation with the λ (lambda) slider
- **Background Playback**: Works as a PWA and continues playing when minimized
- **Media Session API**: Control playback from your device's notification panel

## How It Works

The app uses a graph-based approach to navigate between pitch class sets (PCS):

1. **Necklace Generation**: All unique 12-tone pitch class sets are generated using the FKM algorithm
2. **Relation Graph**: PCS are connected based on interval vector similarity and shared notes
3. **Random Walk**: Every 4 bars, the app moves to a related pitch class set
4. **Note Scheduling**: Notes are triggered using an exponential distribution (Poisson process)
5. **Synthesis**: Sine waves with attack/release envelope, vibrato, tremolo, and reverb

## Installation

```bash
cd musicbox-pwa
npm install
```

## Development

```bash
npm run dev
```

## Production Build

```bash
npm run build
```

## Technical Details

### Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| BPM | 45 | Base tempo |
| λ (default) | 6 notes/bar | Mean note density |
| Octave Range | 5-8 | Random octave selection |
| Attack | 0.01s | Note attack time |
| Release | 1.8s | Note release time |
| Max Voices | 16 | Polyphony limit |
| Chord Change | 4 bars | Time between PCS transitions |

### Audio Chain

```
Synth → Vibrato → Tremolo → Master Gain → Reverb → Output
```

## Credits

- Original C++ implementation by ncg777
- Pitch Class Set theory based on Allen Forte's work
- Audio synthesis powered by [Tone.js](https://tonejs.github.io/)

## License

MIT
