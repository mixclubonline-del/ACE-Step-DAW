/**
 * Tests for drum machine keyboard scope — ensures drum pad keys
 * are deferred to the drum machine when its scope is active,
 * and global shortcuts are not suppressed otherwise.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { shouldDeferToDrumMachine } from '../useKeyboardShortcuts';
import { useUIStore } from '../../store/uiStore';

function makeKeyEvent(code: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    code,
    key: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...opts,
  } as unknown as KeyboardEvent;
}

describe('shouldDeferToDrumMachine', () => {
  beforeEach(() => {
    // Reset keyboard context to timeline
    useUIStore.getState().setKeyboardContext('timeline', null);
  });

  it('returns true for pad key when scope is drumMachine', () => {
    useUIStore.getState().setKeyboardContext('drumMachine', 'track-1');
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyZ'))).toBe(true);
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyQ'))).toBe(true);
    expect(shouldDeferToDrumMachine(makeKeyEvent('Digit1'))).toBe(true);
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyF'))).toBe(true);
  });

  it('returns false when scope is timeline', () => {
    useUIStore.getState().setKeyboardContext('timeline', null);
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyZ'))).toBe(false);
    expect(shouldDeferToDrumMachine(makeKeyEvent('Digit1'))).toBe(false);
  });

  it('returns false when scope is pianoRoll', () => {
    useUIStore.getState().setKeyboardContext('pianoRoll', 'track-1');
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyA'))).toBe(false);
  });

  it('returns false when modifier keys are pressed even in drumMachine scope', () => {
    useUIStore.getState().setKeyboardContext('drumMachine', 'track-1');
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyZ', { metaKey: true }))).toBe(false);
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyZ', { ctrlKey: true }))).toBe(false);
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyZ', { altKey: true }))).toBe(false);
  });

  it('returns false for non-pad keys even in drumMachine scope', () => {
    useUIStore.getState().setKeyboardContext('drumMachine', 'track-1');
    expect(shouldDeferToDrumMachine(makeKeyEvent('Space'))).toBe(false);
    expect(shouldDeferToDrumMachine(makeKeyEvent('KeyG'))).toBe(false);
    expect(shouldDeferToDrumMachine(makeKeyEvent('Escape'))).toBe(false);
  });

  it('recognizes all 16 drum pad key codes', () => {
    useUIStore.getState().setKeyboardContext('drumMachine', 'track-1');
    const padKeys = [
      'KeyZ', 'KeyX', 'KeyC', 'KeyV',
      'KeyA', 'KeyS', 'KeyD', 'KeyF',
      'KeyQ', 'KeyW', 'KeyE', 'KeyR',
      'Digit1', 'Digit2', 'Digit3', 'Digit4',
    ];
    for (const code of padKeys) {
      expect(shouldDeferToDrumMachine(makeKeyEvent(code))).toBe(true);
    }
  });
});

describe('uiStore drumMachine keyboard context', () => {
  beforeEach(() => {
    useUIStore.getState().setKeyboardContext('timeline', null);
  });

  it('sets keyboard context to drumMachine when opening drum machine', () => {
    useUIStore.getState().setOpenDrumMachineTrackId('track-1');
    const ctx = useUIStore.getState().keyboardContext;
    expect(ctx.scope).toBe('drumMachine');
    expect(ctx.trackId).toBe('track-1');
  });

  it('resets keyboard context to timeline when closing drum machine', () => {
    useUIStore.getState().setOpenDrumMachineTrackId('track-1');
    useUIStore.getState().setOpenDrumMachineTrackId(null);
    const ctx = useUIStore.getState().keyboardContext;
    expect(ctx.scope).toBe('timeline');
  });
});
