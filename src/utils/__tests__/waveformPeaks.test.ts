import { describe, it, expect } from 'vitest';
import { computeWaveformPeaks, PEAK_STRIDE } from '../waveformPeaks';

/** Create a minimal AudioBuffer-like object for testing. */
function mockAudioBuffer(channels: Float32Array[]): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate: 44100,
    duration: channels[0].length / 44100,
    getChannelData: (ch: number) => channels[ch] ?? channels[0],
  } as AudioBuffer;
}

describe('waveformPeaks', () => {
  describe('PEAK_STRIDE', () => {
    it('is 4 (Lmax, Lmin, Rmax, Rmin)', () => {
      expect(PEAK_STRIDE).toBe(4);
    });
  });

  describe('computeWaveformPeaks', () => {
    it('returns correct length: numPeaks * 4', () => {
      const buffer = mockAudioBuffer([new Float32Array(100)]);
      const peaks = computeWaveformPeaks(buffer, 10);
      expect(peaks.length).toBe(40); // 10 * 4
    });

    it('returns zeros for silent mono audio', () => {
      const buffer = mockAudioBuffer([new Float32Array(100)]);
      const peaks = computeWaveformPeaks(buffer, 5);
      expect(peaks.every((v) => v === 0)).toBe(true);
    });

    it('detects positive peaks in mono audio', () => {
      const data = new Float32Array(100);
      data[5] = 0.8; // positive peak in first bin
      const buffer = mockAudioBuffer([data]);
      const peaks = computeWaveformPeaks(buffer, 5);
      // First bin: Lmax=0.8, Lmin=0, Rmax=0.8 (mono → same), Rmin=0
      expect(peaks[0]).toBeCloseTo(0.8); // Lmax
      expect(peaks[1]).toBe(0);           // Lmin
      expect(peaks[2]).toBeCloseTo(0.8); // Rmax (same as L for mono)
      expect(peaks[3]).toBe(0);           // Rmin
    });

    it('detects negative peaks', () => {
      const data = new Float32Array(100);
      data[5] = -0.6;
      const buffer = mockAudioBuffer([data]);
      const peaks = computeWaveformPeaks(buffer, 5);
      expect(peaks[0]).toBe(0);            // Lmax (no positive samples)
      expect(peaks[1]).toBeCloseTo(-0.6); // Lmin
    });

    it('handles stereo with different L/R data', () => {
      const left = new Float32Array(100);
      const right = new Float32Array(100);
      left[0] = 0.5;
      right[0] = 0.9;
      const buffer = mockAudioBuffer([left, right]);
      const peaks = computeWaveformPeaks(buffer, 5);
      expect(peaks[0]).toBeCloseTo(0.5); // Lmax
      expect(peaks[2]).toBeCloseTo(0.9); // Rmax
    });

    it('respects startSample parameter', () => {
      const data = new Float32Array(100);
      data[0] = 1.0; // This should be skipped
      data[50] = 0.7; // This should be picked up
      const buffer = mockAudioBuffer([data]);
      const peaks = computeWaveformPeaks(buffer, 5, 50);
      // First peak should NOT contain the value at index 0
      expect(peaks[0]).toBeCloseTo(0.7);
    });

    it('respects endSample parameter', () => {
      const data = new Float32Array(100);
      data[90] = 1.0; // This should be excluded
      data[10] = 0.3; // This should be included
      const buffer = mockAudioBuffer([data]);
      const peaks = computeWaveformPeaks(buffer, 5, 0, 50);
      // Last peak should NOT contain the value at index 90
      const lastIdx = (5 - 1) * 4;
      expect(peaks[lastIdx]).toBe(0);
    });

    it('returns zeros when samplesPerPeak <= 0', () => {
      const buffer = mockAudioBuffer([new Float32Array(2)]);
      const peaks = computeWaveformPeaks(buffer, 100);
      expect(peaks.length).toBe(400);
      expect(peaks.every((v) => v === 0)).toBe(true);
    });

    it('correctly processes a full waveform', () => {
      // Create a simple sine-like pattern
      const length = 200;
      const data = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        data[i] = Math.sin((2 * Math.PI * i) / 100);
      }
      const buffer = mockAudioBuffer([data]);
      const peaks = computeWaveformPeaks(buffer, 4);

      // 200 samples / 4 bins = 50 samples per bin, period = 100
      // Bin 0 (0-49): first half of first period (0 to ~1 to ~0)
      expect(peaks[0]).toBeGreaterThan(0.9); // Lmax near 1
      // Bin 1 (50-99): second half of first period (0 to ~-1 to ~0)
      expect(peaks[1 * 4 + 1]).toBeLessThan(-0.9); // Lmin near -1
    });
  });
});
