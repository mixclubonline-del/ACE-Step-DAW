import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StatusBar, _resetLastKnownConnection } from '../../src/components/layout/StatusBar';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

const healthCheckMock = vi.fn().mockResolvedValue(false);

vi.mock('../../src/services/aceStepApi', () => ({
  healthCheck: () => healthCheckMock(),
}));

describe('StatusBar auto-hide', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    _resetLastKnownConnection();
  });

  it('renders in expanded mode by default (auto-hide off)', () => {
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).not.toContain('status-bar-collapsed');
  });

  it('collapses when statusBarAutoHide is enabled and mouse is not hovering', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).toContain('status-bar-collapsed');
  });

  it('expands on mouseenter when auto-hide is enabled', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    fireEvent.mouseEnter(bar);
    expect(bar.className).not.toContain('status-bar-collapsed');
  });

  it('collapses on mouseleave when auto-hide is enabled', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');

    fireEvent.mouseEnter(bar);
    expect(bar.className).not.toContain('status-bar-collapsed');

    fireEvent.mouseLeave(bar);
    expect(bar.className).toContain('status-bar-collapsed');
  });

  it('always shows connection dot in collapsed state', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const dot = screen.getByTestId('connection-dot');
    expect(dot).toBeInTheDocument();
  });

  it('always shows save status in collapsed state', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar saveStatus="saved" lastSavedAt={Date.now()} />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).toContain('status-bar-collapsed');
    // SaveStatusIndicator should still render
    expect(screen.getByTestId('status-connection')).toBeInTheDocument();
  });

  it('model names have max-width truncation to prevent overflow', () => {
    render(<StatusBar />);
    const modelSection = screen.getByTestId('status-model-name');
    expect(modelSection.className).toContain('truncate');
  });
});

describe('StatusBar overflow prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    _resetLastKnownConnection();
  });

  it('outer container has overflow-hidden to prevent text overflow', () => {
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).toContain('overflow-hidden');
  });

  it('meta row has min-w-0 to allow flex children to shrink', () => {
    render(<StatusBar />);
    const metaRow = screen.getByTestId('status-bar-meta-row');
    expect(metaRow.className).toContain('min-w-0');
  });
});
