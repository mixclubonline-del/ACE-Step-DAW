import { describe, it, expect } from 'vitest';
import {
  buildTimbreEnhancedPrompt,
  timbreStrengthToCoverStrength,
  createTimbreReference,
} from '../timbreTransfer';

describe('TimbreReference type', () => {
  it('createTimbreReference builds a valid reference', () => {
    const ref = createTimbreReference('audio-key-123', 'My Reference');
    expect(ref.id).toBeTruthy();
    expect(ref.audioKey).toBe('audio-key-123');
    expect(ref.name).toBe('My Reference');
    expect(ref.strength).toBe(0.5); // default
    expect(ref.createdAt).toBeGreaterThan(0);
  });

  it('createTimbreReference accepts custom strength', () => {
    const ref = createTimbreReference('key-456', 'Strong Ref', 0.8);
    expect(ref.strength).toBe(0.8);
  });
});

describe('buildTimbreEnhancedPrompt', () => {
  it('prepends timbre direction to the user prompt', () => {
    const result = buildTimbreEnhancedPrompt('rock guitar solo', 'Reference Guitar Tone');
    expect(result).toContain('rock guitar solo');
    expect(result).toContain('Reference Guitar Tone');
  });

  it('returns original prompt when no reference name given', () => {
    const result = buildTimbreEnhancedPrompt('rock guitar solo', '');
    expect(result).toBe('rock guitar solo');
  });

  it('includes timbre direction language', () => {
    const result = buildTimbreEnhancedPrompt('my prompt', 'Warm Vintage Tone');
    expect(result.toLowerCase()).toContain('timbre');
  });
});

describe('timbreStrengthToCoverStrength', () => {
  it('maps 0 timbre strength to low cover strength', () => {
    const result = timbreStrengthToCoverStrength(0);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0.3);
  });

  it('maps 1 timbre strength to high cover strength', () => {
    const result = timbreStrengthToCoverStrength(1);
    expect(result).toBeGreaterThanOrEqual(0.7);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('maps 0.5 timbre strength to mid range', () => {
    const result = timbreStrengthToCoverStrength(0.5);
    expect(result).toBeGreaterThan(0.3);
    expect(result).toBeLessThan(0.8);
  });

  it('clamps input to 0-1 range', () => {
    // negative input treated as 0
    expect(timbreStrengthToCoverStrength(-0.5)).toBe(timbreStrengthToCoverStrength(0));
    // input above 1 treated as 1
    expect(timbreStrengthToCoverStrength(1.5)).toBe(timbreStrengthToCoverStrength(1));
  });
});
