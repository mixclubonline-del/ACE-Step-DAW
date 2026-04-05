import { useCallback } from 'react';

interface Props {
  /** IndexedDB audio key of the timbre reference, or null if empty. */
  audioKey: string | null;
  /** Display name of the reference. */
  name: string | null;
  /** Timbre strength 0-1. */
  strength: number;
  /** Called when user sets a new reference (via file upload). */
  onSet: (audioKey: string, name: string) => void;
  /** Called when user clears the reference. */
  onClear: () => void;
  /** Called when user adjusts the strength slider. */
  onStrengthChange: (strength: number) => void;
}

export function TimbreReferenceSlot({
  audioKey,
  name,
  strength,
  onSet,
  onClear,
  onStrengthChange,
}: Props) {
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Temporary synthetic key — callers are responsible for persisting the
      // actual audio blob to IndexedDB and replacing this key once stored.
      const key = `timbre-ref-${Date.now()}-${file.name}`;
      onSet(key, file.name.replace(/\.[^.]+$/, ''));
    },
    [onSet],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // TODO: Wire up timeline clip drag with 'application/x-daw-audio-key'
      // MIME type once clip drag sources set that data on the dataTransfer.
      // Handle file drop
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('audio/')) {
        // Temporary synthetic key — callers are responsible for persisting the
        // actual audio blob to IndexedDB and replacing this key once stored.
        const key = `timbre-ref-${Date.now()}-${file.name}`;
        onSet(key, file.name.replace(/\.[^.]+$/, ''));
      }
    },
    [onSet],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  if (!audioKey) {
    return (
      <div
        data-testid="timbre-ref-drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border border-dashed border-[#444] rounded-lg p-3 text-center hover:border-teal-700/50 hover:bg-teal-900/10 transition-colors"
      >
        <p className="text-[10px] text-zinc-500 mb-1.5">
          Drag audio clip here or upload a reference
        </p>
        <label className="inline-block cursor-pointer text-[9px] px-2 py-0.5 rounded bg-[#2a2a2a] border border-[#444] text-zinc-400 hover:text-zinc-300 hover:border-[#555] transition-colors">
          Browse...
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="bg-[#161618] border border-[#333] rounded-lg p-2.5 space-y-2">
      {/* Reference info + clear */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
          <span className="text-[10px] text-zinc-200 truncate">{name || 'Timbre Reference'}</span>
        </div>
        <button
          type="button"
          data-testid="timbre-ref-clear-btn"
          onClick={onClear}
          className="text-zinc-600 hover:text-red-400 text-[10px] transition-colors"
          aria-label="Remove timbre reference"
          title="Remove timbre reference"
        >
          ✕
        </button>
      </div>

      {/* Strength slider */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-zinc-500 shrink-0">Strength</span>
        <input
          type="range"
          data-testid="timbre-strength-slider"
          min={0}
          max={1}
          step={0.01}
          value={strength}
          onChange={(e) => onStrengthChange(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-teal-500 cursor-pointer"
        />
        <span className="text-[9px] text-zinc-400 w-6 text-right tabular-nums">
          {Math.round(strength * 100)}%
        </span>
      </div>
    </div>
  );
}
