'use client';

import Hls from 'hls.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { VideoSource } from '@/lib/types';
import {
  adaptAnimoriSources,
  mediaUrlAllowed,
  needsAnimoriHlsRelay,
  type AnimoriPlayerSource,
} from '@/lib/player-adapter';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { trackPlayback } from './Analytics';

type SiblingEpisode = {
  id: string;
  episode_number: number | string;
  title?: string | null;
};

type Panel = 'episodes' | 'more' | 'report' | null;
type ReportReason = 'playback' | 'audio' | 'subtitles' | 'wrong_episode' | 'other';

type PlayerProps = {
  episodeId: string;
  animeId: string;
  animeSlug: string;
  animeTitle: string;
  episodeNumber: number | string;
  episodeTitle?: string | null;
  sources: VideoSource[];
  siblings: SiblingEpisode[];
  userId: string | null;
  initialPosition?: number;
  qaMode?: boolean;
  relayAllHls?: boolean;
};

const LOAD_TIMEOUT_MS = 15_000;
const CLOUD_SAVE_INTERVAL_MS = 10_000;
const EMBED_SANDBOX =
  'allow-scripts allow-forms allow-presentation allow-pointer-lock allow-orientation-lock allow-same-origin';

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function targetIsInteractive(target: EventTarget | null) {
  return target instanceof Element &&
    Boolean(target.closest('button,a,input,select,textarea,[role="button"],.bbp-panel,.bbp-react,.bbp-actions,.bbp-top,.bbp-progress'));
}

export function Player({
  episodeId,
  animeId,
  animeSlug,
  animeTitle,
  episodeNumber,
  episodeTitle,
  sources,
  siblings,
  userId,
  initialPosition = 0,
  qaMode = false,
  relayAllHls = false,
}: PlayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPointerRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const suppressTapUntilRef = useRef(0);
  const touchStartRef = useRef<{x:number;y:number} | null>(null);
  const edgeBackRef = useRef(false);
  const edgeBackDxRef = useRef(0);
  const navigationLockRef = useRef(0);
  const scrubbingRef = useRef(false);
  const cloudSaveAtRef = useRef(0);
  const loadSeqRef = useRef(0);
  const shouldAutoplayRef = useRef(false);
  const triedFailoverRef = useRef(new Set<string>());
  const milestonesRef = useRef(new Set<number>());
  const historyRecordedRef = useRef(false);

  const portableSources = useMemo(() => adaptAnimoriSources(sources), [sources]);
  const [selectedSourceId, setSelectedSourceId] = useState(portableSources[0]?.id ?? '');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loading, setLoading] = useState(Boolean(portableSources.length));
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [autoplayCancelled, setAutoplayCancelled] = useState(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [holding2x, setHolding2x] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('playback');
  const [reportDetails, setReportDetails] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const source = useMemo(
    () => portableSources.find((item) => item.id === selectedSourceId) ?? portableSources[0],
    [portableSources, selectedSourceId],
  );
  const sourceIndex = source ? portableSources.findIndex((item) => item.id === source.id) : -1;
  const episodeIndex = siblings.findIndex((item) => item.id === episodeId);
  const previousEpisode = episodeIndex > 0 ? siblings[episodeIndex - 1] : undefined;
  const nextEpisode = episodeIndex >= 0 ? siblings[episodeIndex + 1] : undefined;
  const embedMode = source?.type === 'embed';

  useEffect(() => {
    if (!portableSources.some((item) => item.id === selectedSourceId)) {
      setSelectedSourceId(portableSources[0]?.id ?? '');
    }
  }, [portableSources, selectedSourceId]);

  const clearLoadTimer = useCallback(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = null;
  }, []);

  const destroyHls = useCallback(() => {
    try { hlsRef.current?.destroy(); } catch {}
    hlsRef.current = null;
  }, []);

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 1800);
  }, []);

  const showControls = useCallback((hold = false) => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (!hold) {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2200);
    }
  }, []);

  const emit = useCallback((eventName: string, sourceId?: string) => {
    if (rootRef.current) rootRef.current.dataset.lastEvent = eventName;
    if (qaMode) return;
    void trackPlayback(eventName, animeId, episodeId, sourceId, userId);
  }, [animeId, episodeId, qaMode, userId]);

  const saveProgress = useCallback(async (force = false, completed = false) => {
    const video = videoRef.current;
    if (!video || embedMode || !Number.isFinite(video.currentTime)) return;

    const seconds = Math.max(0, video.currentTime || 0);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const done = completed || (duration > 0 && seconds / duration >= 0.92);

    try {
      localStorage.setItem(`animori-player-progress:${episodeId}`, String(Math.floor(seconds)));
    } catch {}

    if (qaMode || !userId) return;
    const now = Date.now();
    if (!force && now - cloudSaveAtRef.current < CLOUD_SAVE_INTERVAL_MS) return;
    cloudSaveAtRef.current = now;

    const db = createSupabaseBrowserClient();
    const result = await db.from('playback_progress').upsert({
      user_id: userId,
      episode_id: episodeId,
      anime_id: animeId,
      position_seconds: seconds,
      duration_seconds: duration || null,
      completed: done,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,episode_id' });

    if (result.error) setNotice('Progress could not be saved.');
  }, [animeId, embedMode, episodeId, qaMode, userId]);

  const navigateEpisode = useCallback(async (target?: SiblingEpisode) => {
    if (!target || target.id === episodeId) return;
    await saveProgress(true).catch(() => {});
    location.assign(`/watch/${target.id}`);
  }, [episodeId, saveProgress]);

  const navigateNext = useCallback(() => {
    if (!nextEpisode) return toast('You reached the latest episode');
    void navigateEpisode(nextEpisode);
  }, [navigateEpisode, nextEpisode, toast]);

  const navigatePrevious = useCallback(() => {
    if (previousEpisode) void navigateEpisode(previousEpisode);
  }, [navigateEpisode, previousEpisode]);

  const releaseHold = useCallback((event?: PointerEvent) => {
    if (event?.pointerId != null && holdPointerRef.current != null && event.pointerId !== holdPointerRef.current) return;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    const root = rootRef.current;
    if (root && holdPointerRef.current != null) {
      try {
        if (root.hasPointerCapture(holdPointerRef.current)) root.releasePointerCapture(holdPointerRef.current);
      } catch {}
    }
    holdPointerRef.current = null;
    const wasHolding = holdingRef.current;
    holdingRef.current = false;
    setHolding2x(false);
    const video = videoRef.current;
    if (video && !embedMode) {
      try {
        video.defaultPlaybackRate = 1;
        video.playbackRate = 1;
      } catch {}
    }
    if (wasHolding) suppressTapUntilRef.current = Date.now() + 320;
  }, [embedMode]);

  const beginHold = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || embedMode || video.paused || video.ended || holdingRef.current || targetIsInteractive(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    holdPointerRef.current = event.pointerId;
    try { rootRef.current?.setPointerCapture(event.pointerId); } catch {}
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      const currentVideo = videoRef.current;
      if (!currentVideo || embedMode || currentVideo.paused || currentVideo.ended) return;
      holdingRef.current = true;
      suppressTapUntilRef.current = Date.now() + 320;
      currentVideo.defaultPlaybackRate = 2;
      currentVideo.playbackRate = 2;
      setHolding2x(true);
      navigator.vibrate?.(8);
      emit('speed_hold', source?.id);
    }, 180);
  }, [embedMode, emit, source?.id]);

  useEffect(() => {
    const up = (event: PointerEvent) => releaseHold(event);
    const cancel = (event: PointerEvent) => releaseHold(event);
    const blur = () => releaseHold();
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', blur);
    };
  }, [releaseHold]);

  useEffect(() => {
    const originalOpen = window.open;
    const guardedOpen = ((url?: string | URL, target?: string, features?: string) => {
      const activation = (navigator as any).userActivation as { isActive?: boolean } | undefined;
      if (!activation?.isActive) {
        if (rootRef.current) rootRef.current.dataset.popupBlocked = 'true';
        emit('popup_blocked', source?.id);
        return null;
      }
      return (originalOpen as any)(url as any, target, features);
    }) as typeof window.open;
    window.open = guardedOpen;
    return () => {
      if (window.open === guardedOpen) window.open = originalOpen;
    };
  }, [emit, source?.id]);

  useEffect(() => {
    if (qaMode) {
      setFavorite(false);
      return;
    }
    if (!userId) {
      setFavorite(false);
      return;
    }
    let cancelled = false;
    const db = createSupabaseBrowserClient();
    void db.from('favorites').select('anime_id').eq('user_id', userId).eq('anime_id', animeId).maybeSingle()
      .then((result) => {
        if (!cancelled && !result.error) setFavorite(Boolean(result.data));
      });
    return () => { cancelled = true; };
  }, [animeId, qaMode, userId]);

  const failActiveSource = useCallback((message: string, autoplay = true) => {
    clearLoadTimer();
    if (!source) return;
    const key = `${episodeId}:${source.id}`;
    const nextSource = sourceIndex >= 0 ? portableSources[sourceIndex + 1] : undefined;

    if (nextSource && !triedFailoverRef.current.has(key)) {
      triedFailoverRef.current.add(key);
      shouldAutoplayRef.current = autoplay;
      setNotice(`Source unavailable. Trying ${nextSource.label}…`);
      setFailure('');
      setSelectedSourceId(nextSource.id);
      return;
    }

    setFailure(message || 'This source failed to load.');
    setLoading(true);
    showControls(true);
    emit('playback_error', source.id);
  }, [clearLoadTimer, emit, episodeId, portableSources, showControls, source, sourceIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) {
      setLoading(false);
      return;
    }

    const seq = ++loadSeqRef.current;
    setFailure('');
    setNotice('');
    setLoading(true);
    setNextCountdown(null);
    setAutoplayCancelled(false);
    clearLoadTimer();
    destroyHls();

    video.pause();
    video.onerror = null;
    video.removeAttribute('src');
    video.load();

    if (!mediaUrlAllowed(source.url)) {
      failActiveSource('This source was blocked by the player network guard.', shouldAutoplayRef.current);
      return;
    }

    if (source.type === 'embed') {
      loadTimerRef.current = setTimeout(() => {
        if (seq === loadSeqRef.current) {
          failActiveSource('This embedded server is taking too long to respond.', true);
        }
      }, LOAD_TIMEOUT_MS);
      return () => clearLoadTimer();
    }

    let readyHandled = false;
    const onReady = () => {
      if (seq !== loadSeqRef.current || readyHandled) return;
      readyHandled = true;
      clearLoadTimer();
      setLoading(false);

      let local = 0;
      try {
        local = Number(localStorage.getItem(`animori-player-progress:${episodeId}`) || 0);
      } catch {}
      const saved = Math.max(local, Number(initialPosition || 0));
      if (Number.isFinite(video.duration) && saved > 5 && saved < video.duration - 8) {
        try {
          video.currentTime = saved;
          setNotice(`Resumed from ${formatTime(saved)}.`);
        } catch {}
      }

      emit('play_start', source.id);
      if (!historyRecordedRef.current && !qaMode && userId) {
        historyRecordedRef.current = true;
        const db = createSupabaseBrowserClient();
        void db.from('watch_history').upsert({
          user_id: userId,
          anime_id: animeId,
          episode_id: episodeId,
          watched_at: new Date().toISOString(),
        }, { onConflict: 'user_id,episode_id' });
      }

      const autoplay = shouldAutoplayRef.current;
      shouldAutoplayRef.current = false;
      if (autoplay) void video.play().catch(() => {});
      showControls();
    };

    const onError = () => {
      if (seq !== loadSeqRef.current) return;
      failActiveSource(
        `This video source failed to load (media error ${video.error?.code || 0}).`,
        shouldAutoplayRef.current,
      );
    };

    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);

    try {
      const isHls = source.type === 'hls' || /\.m3u8(?:$|[?#])/i.test(source.url);
      const finalUrl = isHls && (needsAnimoriHlsRelay(source.url) || relayAllHls)
        ? `/api/hls-proxy?url=${encodeURIComponent(source.url)}`
        : source.url;

      if (!isHls) {
        video.src = finalUrl;
        video.load();
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = finalUrl;
        video.load();
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
          maxBufferLength: 30,
          capLevelToPlayerSize: true,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data?.fatal || seq !== loadSeqRef.current) return;
          try { hls.destroy(); } catch {}
          if (hlsRef.current === hls) hlsRef.current = null;
          failActiveSource(`This HLS source failed to load: ${data.details || data.type || 'fatal error'}`, true);
        });
        hls.loadSource(finalUrl);
        hls.attachMedia(video);
      } else {
        failActiveSource('HLS playback is not supported in this browser.', false);
      }
    } catch (error) {
      failActiveSource(error instanceof Error ? error.message : 'Playback failed.', false);
    }

    loadTimerRef.current = setTimeout(() => {
      if (seq === loadSeqRef.current && video.readyState < 1) {
        failActiveSource('This source is taking too long to respond. Retry it or try another server.', true);
      }
    }, LOAD_TIMEOUT_MS);

    return () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      clearLoadTimer();
      destroyHls();
    };
  }, [
    animeId,
    clearLoadTimer,
    destroyHls,
    emit,
    episodeId,
    failActiveSource,
    initialPosition,
    qaMode,
    relayAllHls,
    reloadNonce,
    showControls,
    source,
    userId,
  ]);

  const syncLayout = useCallback(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root) return;
    const sourceLandscape = Boolean(!embedMode && video && video.videoWidth > 0 && video.videoWidth > video.videoHeight * 1.08);
    const deviceLandscape = window.matchMedia?.('(orientation: landscape)').matches || innerWidth > innerHeight;
    root.classList.toggle('bbp-media-landscape', sourceLandscape);
    root.classList.toggle('bbp-device-landscape', Boolean(deviceLandscape));
  }, [embedMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const seconds = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      setCurrentSeconds(seconds);
      setDurationSeconds(duration);
      void saveProgress(false);

      if (duration > 0) {
        const ratio = seconds / duration;
        for (const [threshold, mark] of [[0.25, 25], [0.5, 50], [0.75, 75]] as const) {
          if (ratio >= threshold && !milestonesRef.current.has(mark)) {
            milestonesRef.current.add(mark);
            emit(`play_${mark}`, source?.id);
          }
        }
      }

      if (!autoplayCancelled && nextEpisode && duration > 0) {
        const remaining = Math.ceil(duration - seconds);
        setNextCountdown(remaining >= 1 && remaining <= 5 ? remaining : null);
      } else {
        setNextCountdown(null);
      }
    };
    const onPlay = () => {
      emit('play', source?.id);
      showControls();
    };
    const onPause = () => {
      releaseHold();
      void saveProgress(true);
      emit('pause', source?.id);
      showControls();
    };
    const onEnded = () => {
      releaseHold();
      setNextCountdown(null);
      void (async () => {
        await saveProgress(true, true).catch(() => {});
        emit('play_complete', source?.id);
        if (!autoplayCancelled && nextEpisode) {
          await new Promise((resolve) => setTimeout(resolve, 220));
          await navigateEpisode(nextEpisode);
        }
      })();
    };
    const onMeta = () => syncLayout();

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('durationchange', onTime);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('durationchange', onTime);
    };
  }, [
    autoplayCancelled,
    emit,
    navigateEpisode,
    nextEpisode,
    releaseHold,
    saveProgress,
    showControls,
    source?.id,
    syncLayout,
  ]);

  useEffect(() => {
    const onFullscreen = () => syncLayout();
    const onResize = () => syncLayout();
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('resize', onResize);
    };
  }, [syncLayout]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        releaseHold();
        void saveProgress(true);
      }
    };
    const onPageHide = () => {
      releaseHold();
      void saveProgress(true);
      destroyHls();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [destroyHls, releaseHold, saveProgress]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const editing = target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (event.key === 'Escape') {
        setPanel(null);
        setReactionOpen(false);
        showControls();
        return;
      }
      if (editing) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        navigateNext();
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        navigatePrevious();
      }
      if (event.key === 'ArrowLeft' && !embedMode && videoRef.current) {
        event.preventDefault();
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
        showControls();
      }
      if (event.key === 'ArrowRight' && !embedMode && videoRef.current) {
        event.preventDefault();
        videoRef.current.currentTime = Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + 5);
        showControls();
      }
      if (event.key === ' ' && !embedMode && videoRef.current) {
        event.preventDefault();
        videoRef.current.paused ? void videoRef.current.play().catch(() => {}) : videoRef.current.pause();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [embedMode, navigateNext, navigatePrevious, showControls]);

  useEffect(() => () => {
    clearLoadTimer();
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    destroyHls();
  }, [clearLoadTimer, destroyHls]);

  const closeToAnime = useCallback(async () => {
    await saveProgress(true).catch(() => {});
    location.assign(`/anime/${animeSlug}`);
  }, [animeSlug, saveProgress]);

  const switchServer = useCallback((next: AnimoriPlayerSource) => {
    if (next.id === source?.id) return;
    shouldAutoplayRef.current = true;
    setPanel(null);
    setFailure('');
    setNotice(`Switching to ${next.label}…`);
    setSelectedSourceId(next.id);
    emit('source_change', next.id);
  }, [emit, source?.id]);

  const retry = useCallback(() => {
    setFailure('');
    setNotice('Retrying source…');
    shouldAutoplayRef.current = true;
    setReloadNonce((value) => value + 1);
  }, []);

  const toggleFavorite = useCallback(async () => {
    if (favoriteBusy) return;
    if (qaMode) {
      setFavorite((value) => !value);
      toast(favorite ? 'Removed from My List' : 'Added to My List');
      return;
    }
    if (!userId) {
      location.assign('/login');
      return;
    }

    const previous = favorite;
    const next = !previous;
    setFavoriteBusy(true);
    setFavorite(next);
    const db = createSupabaseBrowserClient();
    const result = next
      ? await db.from('favorites').upsert({ user_id: userId, anime_id: animeId }, { onConflict: 'user_id,anime_id' })
      : await db.from('favorites').delete().eq('user_id', userId).eq('anime_id', animeId);
    if (result.error) {
      setFavorite(previous);
      toast('My List could not be updated');
    } else {
      toast(next ? 'Added to My List' : 'Removed from My List');
      emit('favorite_toggle', source?.id);
    }
    setFavoriteBusy(false);
  }, [animeId, emit, favorite, favoriteBusy, qaMode, source?.id, toast, userId]);

  const sendReaction = useCallback(async (reaction: 'heart'|'shock'|'laugh'|'fire') => {
    const second = embedMode ? 0 : Math.max(0, Math.floor(videoRef.current?.currentTime || 0));
    try {
      if (!qaMode) {
        const db = createSupabaseBrowserClient();
        const { error } = await db.from('episode_reactions').insert({
          episode_id: episodeId,
          source_id: source?.id ?? null,
          user_id: userId,
          reaction,
          bucket_second: second,
        });
        if (error) throw error;
      }
      toast('Reaction sent');
      emit('reaction', source?.id);
    } catch {
      toast('Reaction failed');
    }
    setReactionOpen(false);
  }, [embedMode, emit, episodeId, qaMode, source?.id, toast, userId]);

  const openReport = useCallback((prefill = '') => {
    setReportReason('playback');
    setReportDetails(prefill ? `Detected player error: ${prefill}`.slice(0, 1000) : '');
    setReportStatus('');
    setPanel('report');
    showControls(true);
  }, [showControls]);

  const submitReport = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (reportBusy) return;
    setReportBusy(true);
    setReportStatus('Sending report…');
    try {
      if (!qaMode) {
        const db = createSupabaseBrowserClient();
        const { error } = await db.from('episode_reports').insert({
          episode_id: episodeId,
          source_id: source?.id ?? null,
          user_id: userId,
          reason: reportReason,
          details: reportDetails.trim().slice(0, 1000) || null,
        });
        if (error) throw error;
      }
      setReportStatus('Thanks — the report is in the review queue.');
      emit('report_issue', source?.id);
      setTimeout(() => setPanel(null), 850);
    } catch {
      setReportStatus('The report could not be sent. Please try again.');
    } finally {
      setReportBusy(false);
    }
  }, [emit, episodeId, qaMode, reportBusy, reportDetails, reportReason, source?.id, userId]);

  const share = useCallback(async () => {
    const url = location.href;
    const data = {
      title: `${animeTitle} — Episode ${episodeNumber} · Animori`,
      text: `Watch ${animeTitle} Episode ${episodeNumber} on Animori`,
      url,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
      emit('share', source?.id);
    } catch {}
  }, [animeTitle, emit, episodeNumber, source?.id, toast]);

  const surpriseMe = useCallback(() => {
    if (!siblings.length) return;
    const options = siblings.filter((item) => item.id !== episodeId);
    const target = options[Math.floor(Math.random() * options.length)] ?? siblings[0];
    emit('surprise_me', source?.id);
    setPanel(null);
    void navigateEpisode(target);
  }, [emit, episodeId, navigateEpisode, siblings, source?.id]);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const element = root as HTMLDivElement & { webkitRequestFullscreen?: () => void };
    const media = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    const orientation = (screen as any).orientation as { lock?: (orientation: 'landscape') => Promise<void>; unlock?: () => void } | undefined;
    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        try { orientation?.unlock?.(); } catch {}
        if (document.fullscreenElement) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else if (root.requestFullscreen) {
        await root.requestFullscreen();
        try { await orientation?.lock?.('landscape'); } catch {}
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else {
        media?.webkitEnterFullscreen?.();
      }
    } catch {
      try { media?.webkitEnterFullscreen?.(); } catch {}
    }
    syncLayout();
    showControls();
  }, [showControls, syncLayout]);

  const seekBy = useCallback((delta: number) => {
    if (embedMode || !videoRef.current) {
      toast('5-second seek is unavailable on this server');
      return;
    }
    const video = videoRef.current;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(end, Math.max(0, video.currentTime + delta));
    showControls();
  }, [embedMode, showControls, toast]);

  const commitScrub = useCallback((raw?: string) => {
    const video = videoRef.current;
    const value = raw == null ? scrubValue : Number(raw);
    if (!video || embedMode || value == null || !Number.isFinite(video.duration) || video.duration <= 0) {
      scrubbingRef.current = false;
      setScrubValue(null);
      return;
    }
    video.currentTime = (value / 1000) * video.duration;
    scrubbingRef.current = false;
    setScrubValue(null);
    showControls();
  }, [embedMode, scrubValue, showControls]);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if ((event.target as Element | null)?.closest?.('.bbp-panel')) return;
    if (Math.abs(event.deltaY) < 42) return;
    event.preventDefault();
    const now = Date.now();
    if (now < navigationLockRef.current) return;
    navigationLockRef.current = now + 600;
    event.deltaY > 0 ? navigateNext() : navigatePrevious();
  }, [navigateNext, navigatePrevious]);

  const onTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    edgeBackRef.current = touch.clientX <= 48 && !document.fullscreenElement;
    edgeBackDxRef.current = 0;
    if (edgeBackRef.current) rootRef.current?.classList.add('bbp-edge-back-active');
  }, []);

  const onTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if ((absY > 42 && absY > absX * 1.18) || (absX > 58 && absX > absY * 1.15)) releaseHold();

    if (edgeBackRef.current && dx > 0 && absX > absY * 1.05) {
      edgeBackDxRef.current = Math.min(innerWidth, dx);
      rootRef.current?.style.setProperty('--edge-back-x', `${edgeBackDxRef.current}px`);
      event.preventDefault();
    }
  }, [releaseHold]);

  const onTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.changedTouches[0];
    const x = touch?.clientX ?? start.x;
    const y = touch?.clientY ?? start.y;
    const dx = x - start.x;
    const vertical = start.y - y;
    const root = rootRef.current;

    if (edgeBackRef.current) {
      const shouldReturn =
        edgeBackDxRef.current >= Math.min(110, innerWidth * 0.24) &&
        Math.abs(dx) > Math.abs(vertical) * 1.05;
      if (shouldReturn) {
        root?.style.setProperty('--edge-back-x', '100vw');
        setTimeout(() => void closeToAnime(), 180);
      } else {
        root?.style.setProperty('--edge-back-x', '0px');
        setTimeout(() => root?.classList.remove('bbp-edge-back-active'), 210);
      }
    } else if (Math.abs(vertical) > 65 && Math.abs(vertical) > Math.abs(dx) * 1.2) {
      vertical > 0 ? navigateNext() : navigatePrevious();
    }

    touchStartRef.current = null;
    edgeBackRef.current = false;
    edgeBackDxRef.current = 0;
  }, [closeToAnime, navigateNext, navigatePrevious]);

  if (!source) {
    return <div className="playerEmpty"><strong>No active player source is available.</strong><span>The source verifier may have disabled unhealthy mirrors, or ingestion is still pending.</span></div>;
  }

  const progressValue = scrubValue ?? (durationSeconds > 0 ? Math.round((currentSeconds / durationSeconds) * 1000) : 0);
  const shownCurrent = scrubValue != null && durationSeconds > 0
    ? (scrubValue / 1000) * durationSeconds
    : currentSeconds;
  const nextSource = portableSources[sourceIndex + 1];

  return <div className="animoriBbpHost">
    <div
      ref={rootRef}
      className={`bbp-root ${controlsVisible ? 'bbp-controls' : ''}`}
      onPointerDown={beginHold}
      onPointerMove={() => { if (controlsVisible) showControls(); }}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onContextMenu={(event) => { if (holdingRef.current || holdTimerRef.current) event.preventDefault(); }}
      data-qa-mode={qaMode ? 'true' : undefined}
    >
      <video
        ref={videoRef}
        className={`bbp-video ${embedMode ? 'bbp-hidden' : ''}`}
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disableRemotePlayback
        onClick={() => {
          if (holdingRef.current || Date.now() < suppressTapUntilRef.current) return;
          setControlsVisible((value) => !value);
        }}
      />
      <iframe
        className={`bbp-embed ${embedMode ? '' : 'bbp-hidden'}`}
        src={embedMode ? source.url : 'about:blank'}
        title={`${source.label} player`}
        sandbox={EMBED_SANDBOX}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="no-referrer"
        loading="eager"
        onLoad={() => {
          if (!embedMode) return;
          clearLoadTimer();
          setLoading(false);
          setFailure('');
          emit('play_start', source.id);
          showControls(true);
        }}
        onError={() => {
          if (embedMode) failActiveSource('This embedded player failed to load.', true);
        }}
      />
      <div className="bbp-shade" />

      {(loading || failure) && <div className="bbp-loading">
        {failure ? <div className="bbp-failure">
          <strong>Playback unavailable</strong>
          <p>{failure}</p>
          <div className="buttons">
            <button type="button" onClick={retry}>Retry</button>
            {nextSource && <button type="button" onClick={() => switchServer(nextSource)}>Try next server</button>}
            <button type="button" onClick={() => openReport(failure)}>Report issue</button>
          </div>
        </div> : <>
          <span className="spinner" />
          <p>Loading episode…</p>
        </>}
      </div>}

      {holding2x && <div className="bbp-speed">▶▶ <strong>2x</strong></div>}

      <div className="bbp-top bbp-chrome">
        <button className="bbp-circle" type="button" onClick={() => void closeToAnime()} aria-label="Back to anime">×</button>
        <button className="bbp-circle" type="button" onClick={() => { setPanel('more'); showControls(true); }} aria-label="More options">•••</button>
      </div>

      <section
        className="bbp-title bbp-chrome"
        role="button"
        tabIndex={0}
        onClick={() => { setPanel('episodes'); showControls(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setPanel('episodes');
            showControls(true);
          }
        }}
      >
        <div className="kicker"><span>EP {String(episodeNumber).padStart(2, '0')}</span><span>{episodeIndex + 1} / {siblings.length}</span></div>
        <h1>{animeTitle}</h1>
        <p>{episodeTitle || `Episode ${episodeNumber}`}</p>
      </section>

      <aside className="bbp-actions bbp-chrome">
        <button type="button" onClick={() => { setPanel('episodes'); showControls(true); }}><b>☷</b><small>Episodes</small></button>
        <button type="button" disabled={favoriteBusy} onClick={() => void toggleFavorite()}><b>{favorite ? '✓' : '＋'}</b><small>My List</small></button>
        <button type="button" onClick={() => { setReactionOpen((value) => !value); showControls(true); }} aria-expanded={reactionOpen}><b>☺</b><small>React</small></button>
        <button type="button" onClick={() => void share()}><b>↗</b><small>Share</small></button>
      </aside>

      {reactionOpen && <div className="bbp-react">
        <button type="button" onClick={() => void sendReaction('heart')} aria-label="Love">❤️</button>
        <button type="button" onClick={() => void sendReaction('shock')} aria-label="Shocked">😱</button>
        <button type="button" onClick={() => void sendReaction('laugh')} aria-label="Funny">😂</button>
        <button type="button" onClick={() => void sendReaction('fire')} aria-label="Fire">🔥</button>
      </div>}

      {!embedMode && <div className="bbp-center bbp-chrome">
        <button type="button" onClick={() => seekBy(-5)} aria-label="Back 5 seconds">−5</button>
        <button className="play" type="button" onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          video.paused ? void video.play().catch(() => {}) : video.pause();
        }} aria-label="Play or pause">{videoRef.current?.paused === false ? 'Ⅱ' : '▶'}</button>
        <button type="button" onClick={() => seekBy(5)} aria-label="Forward 5 seconds">+5</button>
      </div>}

      {!embedMode && <div className="bbp-progress bbp-chrome">
        <span>{formatTime(shownCurrent)}</span>
        <input
          type="range"
          min="0"
          max="1000"
          step="1"
          value={progressValue}
          aria-label="Playback progress"
          onPointerDown={() => {
            scrubbingRef.current = true;
            releaseHold();
            setScrubValue(progressValue);
            showControls(true);
          }}
          onInput={(event) => setScrubValue(Number((event.currentTarget as HTMLInputElement).value))}
          onPointerUp={(event) => commitScrub(event.currentTarget.value)}
          onPointerCancel={() => { scrubbingRef.current = false; setScrubValue(null); }}
          onKeyUp={(event) => {
            if (['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key)) {
              commitScrub(event.currentTarget.value);
            }
          }}
        />
        <span>{formatTime(durationSeconds)}</span>
      </div>}

      {nextCountdown != null && <div className="bbp-next">
        <span>NEXT <strong>{nextCountdown}</strong></span>
        <button type="button" onClick={() => {
          setAutoplayCancelled(true);
          setNextCountdown(null);
          toast('Autoplay cancelled');
        }}>Stay Here</button>
      </div>}

      {panel === 'episodes' && <div className="bbp-panel">
        <header><h2>Episodes</h2><button className="bbp-circle" type="button" onClick={() => { setPanel(null); showControls(); }}>×</button></header>
        <div className="bbp-grid">
          {siblings.map((item) => <button
            type="button"
            key={item.id}
            className={item.id === episodeId ? 'active' : ''}
            onClick={() => { setPanel(null); void navigateEpisode(item); }}
          >EP {String(item.episode_number).padStart(2, '0')}</button>)}
        </div>
      </div>}

      {panel === 'more' && <div className="bbp-panel">
        <header><h2>Player</h2><button className="bbp-circle" type="button" onClick={() => { setPanel(null); showControls(); }}>×</button></header>
        <div className="bbp-server-list" aria-label="Playback servers">
          {portableSources.map((item) => <button
            type="button"
            key={item.id}
            className={item.id === source.id ? 'active' : ''}
            onClick={() => switchServer(item)}
          >{item.label}<small>{item.type === 'direct' ? 'MP4 / direct' : item.type.toUpperCase()}</small></button>)}
        </div>
        <div className="bbp-server-list">
          <button type="button" onClick={() => void toggleFullscreen()}>Landscape / fullscreen</button>
          <button type="button" onClick={surpriseMe}>Surprise Me</button>
          <button type="button" onClick={() => openReport()}>Report issue</button>
        </div>
      </div>}

      {panel === 'report' && <div className="bbp-panel">
        <header><h2>Report issue</h2><button className="bbp-circle" type="button" onClick={() => { setPanel(null); showControls(); }}>×</button></header>
        <form className="bbp-report-form" onSubmit={submitReport}>
          <label>Reason
            <select value={reportReason} onChange={(event) => setReportReason(event.target.value as ReportReason)}>
              <option value="playback">Playback problem</option>
              <option value="audio">Audio problem</option>
              <option value="subtitles">Subtitle problem</option>
              <option value="wrong_episode">Wrong episode</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Details
            <textarea maxLength={1000} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="What happened?" />
          </label>
          <button type="submit" disabled={reportBusy}>{reportBusy ? 'Sending…' : 'Send report'}</button>
          {reportStatus && <div className="bbp-report-status" role="status">{reportStatus}</div>}
        </form>
      </div>}

      {notice && !failure && <div className="bbp-toast show" role="status">{notice}</div>}
      {toastMessage && <div className="bbp-toast show" role="status">{toastMessage}</div>}
    </div>
  </div>;
}
