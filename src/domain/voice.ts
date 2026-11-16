/*
  Voice input for the trainer's assistant, without React or the network:
  which audio format to record, how loud the mic is, and how spoken words
  join what was already typed. Used by src/components/useVoiceRecorder.ts.
*/

// Chrome, Edge and Firefox record webm; Safari (iPhone) records mp4.
// OpenAI accepts all of these.
const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** The first format this browser can record, or undefined to let it choose. */
export function pickAudioType(isSupported: (type: string) => boolean): string | undefined {
  return AUDIO_TYPES.find((t) => isSupported(t));
}

/** OpenAI reads the file's extension to know the format. */
export function audioFileName(type: string): string {
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'speech.mp4';
  if (type.includes('ogg')) return 'speech.ogg';
  if (type.includes('wav')) return 'speech.wav';
  return 'speech.webm';
}

/**
 * The mic records until the trainer taps stop, however long they pause.
 * This cap only catches a mic left on by mistake (10 minutes stays well
 * under the server's 10 MB limit).
 */
export const MAX_RECORDING_MS = 10 * 60_000;

/**
 * What you said goes into the message box to check before sending. If
 * something was already typed there, the new words are added after it.
 */
export function addSpokenText(draft: string, spoken: string): string {
  const before = draft.trimEnd();
  const words = spoken.trim();
  if (!words) return draft;
  return before ? `${before} ${words}` : words;
}

/** Loudness of a slice of audio samples (-1 to 1), as root mean square. */
export function loudness(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
