/*
  Records from the microphone until stop() is called (the trainer taps the
  mic again), then hands back the audio. Pauses don't end it.

  - MediaRecorder: the browser's built-in recorder.
  - AudioContext + AnalyserNode: lets us read the live volume a few times a
    second without affecting the recording, for the ring around the mic.
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioFileName, loudness, MAX_RECORDING_MS, pickAudioType } from '../domain/voice';

export type RecorderStatus = 'idle' | 'starting' | 'listening';

interface Options {
  /** The finished recording, after stop() was called. */
  onRecorded: (audio: Blob, fileName: string) => void;
  /** Mic denied or missing. */
  onProblem: (message: string) => void;
}

/** True if this browser can record audio at all (older browsers can't). */
export const canRecord = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function useVoiceRecorder({ onRecorded, onProblem }: Options) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  /** 0 to 1, for a "you're being heard" ring around the mic button. */
  const [level, setLevel] = useState(0);

  // Refs hold things that change without needing a re-render.
  const callbacks = useRef({ onRecorded, onProblem });
  callbacks.current = { onRecorded, onProblem };
  const session = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    audio: AudioContext;
    timer: number;
    discard: boolean;
  } | null>(null);

  /** Stops recording. discard = throw the audio away instead of sending it. */
  const finish = useCallback((discard = false) => {
    const s = session.current;
    if (!s) return;
    s.discard = discard;
    window.clearInterval(s.timer);
    if (s.recorder.state !== 'inactive') s.recorder.stop(); // fires onstop below
  }, []);

  const start = useCallback(async () => {
    if (session.current) return;
    setStatus('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      setStatus('idle');
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      callbacks.current.onProblem(
        denied
          ? 'Microphone access is blocked. Allow it in your browser’s site settings, then try again.'
          : 'No microphone found. Plug one in or type instead.',
      );
      return;
    }

    const type = pickAudioType((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

    // Volume meter.
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      setLevel(Math.min(1, loudness(samples) * 8));
      // Only for a mic left on by mistake; what was said is kept, not sent.
      if (Date.now() - startedAt >= MAX_RECORDING_MS) finish();
    }, 100);

    recorder.onstop = () => {
      const s = session.current;
      session.current = null;
      stream.getTracks().forEach((t) => t.stop()); // turns off the mic light
      audio.close();
      setStatus('idle');
      setLevel(0);
      if (!s || s.discard || chunks.length === 0) return;
      const recordedType = recorder.mimeType || type || 'audio/webm';
      callbacks.current.onRecorded(new Blob(chunks, { type: recordedType }), audioFileName(recordedType));
    };

    session.current = { recorder, stream, audio, timer, discard: false };
    recorder.start(250); // hand over audio every 250 ms
    setStatus('listening');
  }, [finish]);

  // Leaving the page mid-recording turns the mic off and drops the audio.
  useEffect(() => () => finish(true), [finish]);

  return { status, level, start, stop: () => finish(false), cancel: () => finish(true) };
}
