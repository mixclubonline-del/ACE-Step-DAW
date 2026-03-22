import { useCallback, useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateBatch, type BatchTrackEntry } from '../../services/generationPipeline';

const VOCAL_TRACKS = new Set(['vocals', 'backing_vocals']);

interface TrackRow {
  trackId: string;
  trackName: string;
  displayName: string;
  localDescription: string;
  lyrics: string;
  checked: boolean;
  firstClipId: string | null;
  hasExistingAudio: boolean;
}

interface Props {
  mode: 'silence' | 'context';
  onModeChange: (mode: 'silence' | 'context') => void;
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

export function MultiTrackGenerateSection({ mode, onModeChange }: Props) {
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const initialRange = useUIStore((s) => s.batchGenerateInitialRange);

  const [globalCaption, setGlobalCaption] = useState(() => project?.globalCaption ?? '');
  const [rows, setRows] = useState<TrackRow[]>([]);
  const [sharedSeed, setSharedSeed] = useState<number>(randomSeed);

  useEffect(() => {
    if (!project) return;
    setGlobalCaption((prev) => prev || project.globalCaption || '');
    const tracks = useProjectStore.getState().getTracksInGenerationOrder();
    setRows(
      tracks.map((track) => {
        const firstClip = track.clips[0] ?? null;
        return {
          trackId: track.id,
          trackName: track.trackName,
          displayName: track.displayName ?? track.trackName.replace(/_/g, ' ').toUpperCase(),
          localDescription: firstClip?.prompt ?? '',
          lyrics: firstClip?.lyrics ?? '',
          checked: !firstClip || firstClip.generationStatus !== 'ready',
          firstClipId: firstClip?.id ?? null,
          hasExistingAudio: firstClip?.generationStatus === 'ready',
        };
      }),
    );
  }, [project]);

  const toggleRow = useCallback((trackId: string) => {
    setRows((prev) => prev.map((row) => (row.trackId === trackId ? { ...row, checked: !row.checked } : row)));
  }, []);

  const updateDescription = useCallback((trackId: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.trackId === trackId ? { ...row, localDescription: value } : row)));
  }, []);

  const updateLyrics = useCallback((trackId: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.trackId === trackId ? { ...row, lyrics: value } : row)));
  }, []);

  const selectedRows = rows.filter((row) => row.checked);
  const canGenerate = selectedRows.length > 0 && !isGenerating;
  const isSilence = mode === 'silence';

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    const store = useProjectStore.getState();
    const audioDuration = store.getAudioDuration();
    const tracks: BatchTrackEntry[] = [];
    const clipStartTime = initialRange?.startTime ?? 0;
    const clipDuration = initialRange?.duration ?? audioDuration;

    for (const row of selectedRows) {
      let clipId = row.firstClipId;
      if (!clipId) {
        const newClip = store.addClip(row.trackId, {
          startTime: clipStartTime,
          duration: clipDuration,
          prompt: row.localDescription,
          globalCaption,
          lyrics: row.lyrics,
        });
        clipId = newClip.id;
      }
      tracks.push({
        clipId,
        localDescription: row.localDescription,
        lyrics: row.lyrics || undefined,
      });
    }

    await generateBatch({
      mode,
      globalCaption,
      tracks,
      sharedSeed,
    });
  }, [canGenerate, globalCaption, initialRange?.duration, initialRange?.startTime, mode, selectedRows, sharedSeed]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3" data-testid="multi-track-generation-section">
      <div className="space-y-4">
        <section className="space-y-2 rounded-lg border border-[#333] bg-[#232323] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Multi-Track</h3>
              <p className="text-[11px] text-zinc-400">
                Parallel multi-track generation with per-track descriptions, track selection, and shared seed control.
              </p>
            </div>
            {initialRange && (
              <span className="rounded bg-[#333] px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                {initialRange.startTime.toFixed(1)}s - {(initialRange.startTime + initialRange.duration).toFixed(1)}s
              </span>
            )}
          </div>

          <div className="flex gap-1 rounded-lg border border-[#3a3a3a] bg-[#1c1c1c] p-1">
            <button
              type="button"
              onClick={() => onModeChange('silence')}
              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                isSilence
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
              }`}
              aria-pressed={isSilence}
            >
              From Silence
            </button>
            <button
              type="button"
              onClick={() => onModeChange('context')}
              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                !isSilence
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
              }`}
              aria-pressed={!isSilence}
            >
              Use Context
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">
            {isSilence
              ? 'Starts fresh across the selected tracks in parallel.'
              : 'Uses existing generated material as context while keeping the same track-by-track workflow.'}
          </p>
        </section>

        <section className="space-y-1.5">
          <label className="font-medium text-zinc-400 uppercase tracking-wide text-[10px]">
            Global song description
            <span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span>
          </label>
          <textarea
            value={globalCaption}
            onChange={(e) => setGlobalCaption(e.target.value)}
            placeholder="e.g. upbeat pop song with energetic drums and warm bass..."
            rows={2}
            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:border-indigo-500 focus:outline-none"
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-medium text-zinc-400 uppercase tracking-wide text-[10px]">
              Tracks to generate
            </label>
            <span className="text-zinc-600 text-[10px]">
              {selectedRows.length} / {rows.length} selected
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="py-2 text-[11px] italic text-zinc-500">No tracks in project. Add tracks first.</p>
          ) : (
            <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
              {rows.map((row) => (
                <div
                  key={row.trackId}
                  className={`rounded-lg border transition-colors ${
                    row.checked
                      ? 'border-indigo-500/30 bg-indigo-500/5'
                      : 'border-[#3a3a3a] bg-[#222]/40'
                  }`}
                >
                  <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={() => toggleRow(row.trackId)}
                      className="accent-indigo-500"
                    />
                    <span className={`flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                      row.checked ? 'text-indigo-200' : 'text-zinc-400'
                    }`}>
                      {row.displayName}
                    </span>
                    {row.hasExistingAudio && (
                      <span className="text-[10px] italic text-zinc-500">has audio</span>
                    )}
                  </div>

                  <div className="px-2.5 pb-2">
                    <label className={`mb-1 block text-[10px] ${row.checked ? 'text-zinc-500' : 'text-zinc-600'}`}>
                      Track description
                    </label>
                    <textarea
                      value={row.localDescription}
                      onChange={(e) => updateDescription(row.trackId, e.target.value)}
                      placeholder={`${row.displayName} track description...`}
                      rows={2}
                      className={`w-full rounded border px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none ${
                        row.checked ? 'border-[#444] bg-[#222] focus:border-indigo-500' : 'border-[#3a3a3a] bg-[#222] opacity-50'
                      }`}
                    />
                  </div>

                  {VOCAL_TRACKS.has(row.trackName) && (
                    <div className="px-2.5 pb-2.5">
                      <label className={`mb-1 block text-[10px] ${row.checked ? 'text-zinc-500' : 'text-zinc-600'}`}>
                        Lyrics
                      </label>
                      <textarea
                        value={row.lyrics}
                        onChange={(e) => updateLyrics(row.trackId, e.target.value)}
                        placeholder="Song lyrics..."
                        rows={3}
                        className={`w-full rounded border px-2 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none ${
                          row.checked ? 'border-[#444] bg-[#222] focus:border-indigo-500' : 'border-[#3a3a3a] bg-[#222] opacity-50'
                        }`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-1.5">
          <label className="font-medium text-zinc-400 uppercase tracking-wide text-[10px]">
            Shared seed
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSharedSeed(randomSeed())}
              className="rounded border border-[#444] bg-[#333] px-2 py-1.5 text-zinc-300 transition-colors hover:bg-[#444]"
              title="Randomize seed"
            >
              Shuffle
            </button>
            <input
              type="number"
              value={sharedSeed}
              onChange={(e) => setSharedSeed(Number(e.target.value))}
              className="flex-1 rounded border border-[#444] bg-[#222] px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:border-indigo-500 focus:outline-none"
              min={0}
              max={2147483647}
            />
          </div>
          <p className="text-[10px] text-zinc-500">
            All selected tracks share this seed for tighter harmonic correlation.
          </p>
        </section>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-full rounded-lg py-2 text-sm font-medium transition-colors ${
            canGenerate
              ? isSilence
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'bg-[#444] text-zinc-400 cursor-not-allowed'
          }`}
        >
          {isGenerating ? 'Generating...' : `Generate ${selectedRows.length} Track${selectedRows.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
