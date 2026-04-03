import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore, getBottomPanelHeight, isAnyModalOpen } from '../../store/uiStore';
import { generateCoverClip, generateRepaintClip } from '../../services/generationPipeline';
import { modelSupportsTaskType, isModelInventoryLoaded, isModelReady } from '../../services/aceStepApi';
import { Z } from '../../utils/zIndex';
import { useEnhancePlayback } from '../../hooks/useEnhancePlayback';
import { computeWaveformPeaks } from '../../utils/waveformPeaks';
import type { RepaintMode } from '../../types/api';
import type { EnhancementNode } from '../../types/enhance';
import { EnhanceSidebar } from './EnhanceSidebar';
import { EnhanceControls } from './EnhanceControls';
import { EnhanceResults, type ResultEntry } from './EnhanceResults';

const ENHANCER_BASE_BOTTOM = 60;

type ConsistencyLevel = 'low' | 'medium' | 'high';
const CONSISTENCY_VALUES: Record<ConsistencyLevel, number> = { low: 0.75, medium: 0.5, high: 0.25 };

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SessionEntry { id: string; label: string; timestamp: number; }

export function EnhancePanel() {
  const enhancerOpen = useUIStore((s) => s.enhancerOpen);
  const enhancerTarget = useUIStore((s) => s.enhancerTarget);
  const closeEnhancer = useUIStore((s) => s.closeEnhancer);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);
  const bottomPanelHeight = useUIStore(getBottomPanelHeight);
  const dynamicBottom = ENHANCER_BASE_BOTTOM + bottomPanelHeight;

  const clip = enhancerTarget ? getClipById(enhancerTarget.clipId) ?? null : null;
  const track = enhancerTarget ? project?.tracks.find((t) => t.id === enhancerTarget.trackId) ?? null : null;

  const [mode, setMode] = useState<'cover' | 'repaint'>('cover');
  const [caption, setCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [consistency, setConsistency] = useState<ConsistencyLevel>('medium');
  const [createNew, setCreateNew] = useState(true);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');
  const [repaintMode, setRepaintMode] = useState<RepaintMode>('balanced');
  const [repaintStrength, setRepaintStrength] = useState(0.5);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const sessionCounterRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [abSide, setAbSide] = useState<'A' | 'B'>('A');
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [miniPlayerIdx, setMiniPlayerIdx] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chainedSourceAudioKey, setChainedSourceAudioKey] = useState<string | null>(null);

  const playback = useEnhancePlayback();
  const enhancementSession = useUIStore((s) => s.enhancementSession);
  const startEnhancementSession = useUIStore((s) => s.startEnhancementSession);
  const addEnhancementNode = useUIStore((s) => s.addEnhancementNode);
  const setActiveEnhancementNode = useUIStore((s) => s.setActiveEnhancementNode);
  const rollbackToNode = useUIStore((s) => s.rollbackToNode);

  const clipAudioKey = clip?.isolatedAudioKey || clip?.cumulativeMixKey || '';
  const sourceAudioKey = chainedSourceAudioKey || clipAudioKey;

  // Initialize form when enhancerTarget changes
  useEffect(() => {
    if (enhancerTarget && clip) {
      setMode(enhancerTarget.mode);
      setCaption(clip.prompt ?? ''); setLyrics(clip.lyrics ?? ''); setConsistency('medium'); setCreateNew(true);
      const clipStart = clip.startTime ?? 0;
      const clipEnd = clipStart + (clip.duration ?? 0);
      setSelStart(enhancerTarget.range?.start ?? clipStart);
      setSelEnd(enhancerTarget.range?.end ?? clipEnd);
      setPrompt(clip.prompt ?? '');
      setGlobalCaption(clip.globalCaption ?? project?.globalCaption ?? '');
      setRepaintMode('balanced'); setRepaintStrength(0.5);
      const sessionId = `session-${Date.now()}`;
      sessionCounterRef.current = 1;
      setSessions([{ id: sessionId, label: 'Enhancement 1', timestamp: Date.now() }]);
      setActiveSessionId(sessionId); setResults([]); setAbSide('A');
      setSelectedResultId(null); setMiniPlayerIdx(0); setChainedSourceAudioKey(null);
      const currentSession = useUIStore.getState().enhancementSession;
      if (!currentSession || currentSession.clipId !== enhancerTarget.clipId) startEnhancementSession(enhancerTarget.clipId);
    }
  }, [enhancerTarget?.clipId]);

  useEffect(() => { if (!enhancerOpen) playback.stopPlayback(); }, [enhancerOpen, playback.stopPlayback]);

  // Focus management
  useEffect(() => {
    if (!enhancerOpen) return;
    previousFocusRef.current = document.activeElement;
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')?.focus();
    });
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (isAnyModalOpen()) return; e.stopPropagation(); closeEnhancer(); return; }
      if (e.key === 'Tab') {
        const panel = panelRef.current; if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); if (previousFocusRef.current instanceof HTMLElement) previousFocusRef.current.focus(); };
  }, [enhancerOpen, closeEnhancer]);

  const handleNewSession = useCallback(() => {
    sessionCounterRef.current += 1;
    const sessionId = `session-${Date.now()}`;
    setSessions((prev) => [{ id: sessionId, label: `Enhancement ${sessionCounterRef.current}`, timestamp: Date.now() }, ...prev]);
    setActiveSessionId(sessionId);
    if (clip) { setCaption(clip.prompt ?? ''); setLyrics(clip.lyrics ?? ''); setPrompt(clip.prompt ?? ''); }
    setConsistency('medium'); setRepaintMode('balanced'); setRepaintStrength(0.5);
    setResults([]); setSelectedResultId(null); setMiniPlayerIdx(0);
  }, [clip]);

  const handleRangeChange = useCallback((s: number, e: number) => { setSelStart(s); setSelEnd(e); }, []);

  const finalizeResult = useCallback(async (resultId: string, originalClipId: string, newClipId?: string) => {
    const store = useProjectStore.getState();
    const targetId = newClipId ?? originalClipId;
    let updatedClip = store.getClipById(targetId);
    let audioKey = updatedClip?.isolatedAudioKey || updatedClip?.cumulativeMixKey || '';
    if (!audioKey && !newClipId && enhancerTarget) {
      const t = store.project?.tracks.find((t) => t.id === enhancerTarget.trackId);
      if (t) { const readyClip = [...t.clips].reverse().find((c) => c.id !== originalClipId && (c.isolatedAudioKey || c.cumulativeMixKey)); if (readyClip) { updatedClip = readyClip; audioKey = readyClip.isolatedAudioKey || readyClip.cumulativeMixKey || ''; } }
    }
    if (!audioKey) { setResults((prev) => prev.map((r) => r.id === resultId ? { ...r, status: 'error' as const, error: 'No audio key found for result' } : r)); return; }
    try {
      const buffer = await playback.loadBuffer(audioKey);
      if (!buffer) { setResults((prev) => prev.map((r) => r.id === resultId ? { ...r, status: 'error' as const, error: 'Failed to load audio buffer' } : r)); return; }
      const peaks = computeWaveformPeaks(buffer, 60);
      const dur = buffer.duration;
      const finalClipId = updatedClip?.id ?? originalClipId;
      setResults((prev) => prev.map((r) => r.id === resultId ? { ...r, clipId: finalClipId, audioKey, peaks, duration: formatDuration(dur), durationSec: dur, status: 'ready' as const } : r));
      setSelectedResultId((prev) => prev ?? resultId);
      setMiniPlayerIdx((prev) => prev === 0 ? Math.max(0, results.length) : prev);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Audio decode failed';
      setResults((prev) => prev.map((r) => r.id === resultId ? { ...r, status: 'error' as const, error: message } : r));
    }
  }, [playback, results.length, enhancerTarget]);

  const handleGenerate = useCallback(async () => {
    if (!enhancerTarget || isGenerating || isSubmitting) return;
    setIsSubmitting(true);
    const resultId = `result-${Date.now()}`;
    const title = mode === 'cover' ? (caption || 'Untitled enhancement') : (prompt || 'Untitled repaint');
    setResults((prev) => [...prev, { id: resultId, clipId: enhancerTarget.clipId, audioKey: '', title, duration: '--:--', durationSec: 0, peaks: [], timestamp: Date.now(), status: 'generating' }]);
    try {
      const newClipId = mode === 'cover'
        ? await generateCoverClip({ clipId: enhancerTarget.clipId, caption, lyrics, coverStrength: CONSISTENCY_VALUES[consistency], createNew, sourceAudioOverride: chainedSourceAudioKey || undefined })
        : await generateRepaintClip({ clipId: enhancerTarget.clipId, repaintStart: selStart, repaintEnd: selEnd, prompt, globalCaption: globalCaption || undefined, repaintMode, repaintStrength, sourceAudioOverride: chainedSourceAudioKey || undefined });
      await finalizeResult(resultId, enhancerTarget.clipId, newClipId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setResults((prev) => prev.map((r) => r.id === resultId ? { ...r, status: 'error' as const, error: message } : r));
    } finally { setIsSubmitting(false); }
  }, [enhancerTarget, mode, caption, lyrics, consistency, createNew, prompt, globalCaption, repaintMode, repaintStrength, selStart, selEnd, isGenerating, isSubmitting, chainedSourceAudioKey, finalizeResult]);

  const handleSourcePlay = useCallback(() => { if (sourceAudioKey) playback.togglePlay('source', sourceAudioKey); }, [sourceAudioKey, playback]);
  const handleSourceSeek = useCallback((progress: number) => { if (sourceAudioKey) playback.seek('source', sourceAudioKey, progress); }, [sourceAudioKey, playback]);
  const handleResultPlay = useCallback((resultId: string, audioKey: string) => { if (audioKey) { setSelectedResultId(resultId); playback.togglePlay(resultId, audioKey); } }, [playback]);

  const handleABToggle = useCallback(() => {
    const nextSide = abSide === 'A' ? 'B' as const : 'A' as const;
    setAbSide(nextSide);
    const sel = results.find((r) => r.id === selectedResultId);
    if (nextSide === 'A' && sourceAudioKey) playback.play('source', sourceAudioKey, playback.progress);
    else if (nextSide === 'B' && sel?.audioKey) playback.play(sel.id, sel.audioKey, playback.progress);
  }, [abSide, results, selectedResultId, sourceAudioKey, playback]);

  const handleUseAsSource = useCallback((result: ResultEntry) => {
    if (!result.audioKey || !enhancerTarget) return;
    addEnhancementNode({ parentId: enhancementSession?.activeNodeId ?? null, clipId: result.clipId, audioKey: result.audioKey, mode, params: mode === 'cover' ? { caption, lyrics, coverStrength: CONSISTENCY_VALUES[consistency] } : { repaintRange: { start: selStart, end: selEnd }, repaintMode, repaintStrength }, label: result.title });
    setChainedSourceAudioKey(result.audioKey);
    handleNewSession();
  }, [enhancerTarget, enhancementSession, addEnhancementNode, mode, caption, lyrics, consistency, selStart, selEnd, repaintMode, repaintStrength, handleNewSession]);

  const handleVersionTreeClick = useCallback((node: EnhancementNode) => { rollbackToNode(node.id); setChainedSourceAudioKey(node.audioKey); }, [rollbackToNode]);
  const handleVersionTreeOriginal = useCallback(() => { setChainedSourceAudioKey(null); setActiveEnhancementNode(null); }, [setActiveEnhancementNode]);

  const versionTreeRoots = useMemo(() => enhancementSession ? enhancementSession.nodes.filter((n) => n.parentId === null) : [], [enhancementSession]);
  const getNodeChildren = useCallback((parentId: string) => enhancementSession ? enhancementSession.nodes.filter((n) => n.parentId === parentId) : [], [enhancementSession]);

  const miniResult = results[miniPlayerIdx] ?? null;
  const handleMiniPrev = useCallback(() => setMiniPlayerIdx((prev) => Math.max(0, prev - 1)), []);
  const handleMiniNext = useCallback(() => setMiniPlayerIdx((prev) => Math.min(results.length - 1, prev + 1)), [results.length]);
  const handleMiniPlay = useCallback(() => { if (miniResult?.audioKey) { setSelectedResultId(miniResult.id); playback.togglePlay(miniResult.id, miniResult.audioKey); } }, [miniResult, playback]);
  const handleMiniSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => { if (!miniResult?.audioKey) return; const rect = e.currentTarget.getBoundingClientRect(); const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); setSelectedResultId(miniResult.id); playback.seek(miniResult.id, miniResult.audioKey, progress); }, [miniResult, playback]);

  if (!enhancerOpen) return null;

  if (!enhancerTarget) {
    return (
      <>
        <div data-testid="enhance-backdrop" role="presentation" className="fixed inset-0 bg-black/30" style={{ zIndex: Z.panel - 1 }} onClick={closeEnhancer} />
        <div ref={panelRef} data-testid="enhance-panel" role="dialog" aria-label="AI Enhancer" className="fixed left-1/2 -translate-x-1/2 w-[780px] max-w-[95vw] daw-glass-subtle rounded-xl daw-shadow-xl text-xs text-zinc-200 p-8 text-center transition-[bottom] duration-200 ease-out" style={{ zIndex: Z.panel, bottom: `${dynamicBottom}px` }}>
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-semibold text-white">Enhance</span>
            <button data-testid="enhance-close-btn" onClick={closeEnhancer} className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none">✕</button>
          </div>
          <svg className="w-10 h-10 text-zinc-600 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" /><path d="M8 12h8M12 8v8" strokeLinecap="round" /></svg>
          <p className="text-zinc-400 text-[13px] mb-1">First, create a selection on the canvas</p>
          <p className="text-zinc-600 text-[11px]">Use Cmd/Ctrl+drag on the timeline to select a region, or right-click a clip</p>
          <div className="mt-6"><button onClick={closeEnhancer} className="px-5 py-2 rounded-lg bg-[#2a2a2e] hover:bg-[#333338] text-zinc-300 text-[11px] font-medium transition-colors">Cancel</button></div>
        </div>
      </>
    );
  }

  const hasAudio = !!(clip?.isolatedAudioKey || clip?.cumulativeMixKey);
  const inventoryLoaded = isModelInventoryLoaded();
  const modelReady = isModelReady();
  const modeSupported = mode === 'cover' ? modelSupportsTaskType('cover') : modelSupportsTaskType('repaint');
  const canGenerate = hasAudio && modeSupported && !isGenerating && !isSubmitting && !!(clip && track);
  const selectedResult = results.find((r) => r.id === selectedResultId);
  const canAB = hasAudio && !!selectedResult?.audioKey;
  const sourceIsPlaying = playback.playingId === 'source';
  const miniIsPlaying = miniResult ? playback.playingId === miniResult.id : false;

  return (
    <>
      <div data-testid="enhance-backdrop" role="presentation" className="fixed inset-0 bg-black/30" style={{ zIndex: Z.panel - 1 }} onClick={closeEnhancer} />
      <div ref={panelRef} data-testid="enhance-panel" role="dialog" aria-label="AI Enhancer" className="fixed left-1/2 -translate-x-1/2 w-[820px] max-w-[95vw] max-h-[60vh] daw-glass-subtle rounded-xl daw-shadow-xl flex text-xs text-zinc-200 overflow-hidden transition-[bottom] duration-200 ease-out" style={{ zIndex: Z.panel, bottom: `${dynamicBottom}px` }}>
        <EnhanceSidebar enhancementSession={enhancementSession} versionTreeRoots={versionTreeRoots} getNodeChildren={getNodeChildren} onVersionTreeClick={handleVersionTreeClick} onVersionTreeOriginal={handleVersionTreeOriginal} sessions={sessions} activeSessionId={activeSessionId} onSessionClick={setActiveSessionId} onNewSession={handleNewSession} />
        <EnhanceControls mode={mode} setMode={setMode} clip={clip} track={track} project={project} hasAudio={hasAudio} chainedSourceAudioKey={chainedSourceAudioKey} canAB={canAB} abSide={abSide} onABToggle={handleABToggle} sourcePeaks={clip?.waveformPeaks ?? []} sourceIsPlaying={sourceIsPlaying} sourceProgress={sourceIsPlaying ? playback.progress : 0} onSourcePlay={handleSourcePlay} onSourceSeek={handleSourceSeek} caption={caption} setCaption={setCaption} lyrics={lyrics} setLyrics={setLyrics} consistency={consistency} setConsistency={setConsistency} createNew={createNew} setCreateNew={setCreateNew} selStart={selStart} selEnd={selEnd} onRangeChange={handleRangeChange} prompt={prompt} setPrompt={setPrompt} globalCaption={globalCaption} setGlobalCaption={setGlobalCaption} repaintMode={repaintMode} setRepaintMode={setRepaintMode} repaintStrength={repaintStrength} setRepaintStrength={setRepaintStrength} canGenerate={canGenerate} isGenerating={isGenerating} isSubmitting={isSubmitting} onGenerate={handleGenerate} onClose={closeEnhancer} inventoryLoaded={inventoryLoaded} modelReady={modelReady} modeSupported={modeSupported} />
        <EnhanceResults results={results} selectedResultId={selectedResultId} onSelectResult={(id, idx) => { setSelectedResultId(id); setMiniPlayerIdx(idx); }} canAB={canAB} abSide={abSide} playingId={playback.playingId} progress={playback.progress} onResultPlay={handleResultPlay} onUseAsSource={handleUseAsSource} miniPlayerIdx={miniPlayerIdx} onMiniPrev={handleMiniPrev} onMiniNext={handleMiniNext} onMiniPlay={handleMiniPlay} onMiniSeek={handleMiniSeek} miniIsPlaying={miniIsPlaying} miniProgress={miniIsPlaying ? playback.progress : 0} miniResult={miniResult} />
      </div>
    </>
  );
}
