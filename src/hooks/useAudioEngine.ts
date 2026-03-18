import { useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { AudioEngine } from '../engine/AudioEngine';
import { useTransportStore } from '../store/transportStore';

let _engineInstance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!_engineInstance) {
    _engineInstance = new AudioEngine();
  }
  return _engineInstance;
}

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine>(getAudioEngine());

  useEffect(() => {
    const engine = engineRef.current;
    engine.setTimeUpdateCallback((time) => {
      useTransportStore.getState().setCurrentTime(time);
    });

    return () => {
      engine.setTimeUpdateCallback(() => {});
    };
  }, []);

  const resumeOnGesture = useCallback(async () => {
    await Promise.all([
      engineRef.current.resume(),
      Tone.start(),
    ]);
  }, []);

  return { engine: engineRef.current, resumeOnGesture };
}
