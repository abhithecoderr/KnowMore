import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { encodeAudio, decodeAudio, decodeAudioData } from '../utils/audio';

// Type definitions for Live API (not exported by SDK)
type LiveSession = any;
type LiveServerMessage = any;
type AudioBlob = { data: string; mimeType: string };

// Audio configuration
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

// Voice status types
export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface VoiceMessage {
  role: 'user' | 'model';
  text: string;
  isVoice?: boolean;
}

interface UseGeminiLiveOptions {
  onMessage?: (message: VoiceMessage) => void;  // Callback when a message is complete
  onModelResponse?: (text: string) => void;     // Callback with complete model response (for trigger detection)
  initialContext?: string;                       // Initial text to send for context
  voiceName?: string;
}

export const useGeminiLive = (options: UseGeminiLiveOptions = {}) => {
  const { onMessage, onModelResponse, initialContext, voiceName = 'Charon' } = options;

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentModelText, setCurrentModelText] = useState('');

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const onMessageRef = useRef(onMessage);
  const onModelResponseRef = useRef(onModelResponse);
  const initialContextRef = useRef(initialContext);
  onMessageRef.current = onMessage;
  onModelResponseRef.current = onModelResponse;
  initialContextRef.current = initialContext;

  const aiRef = useRef<GoogleGenAI | null>(null);

  const cleanup = useCallback(() => {
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;

    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    inputAudioContextRef.current?.close().catch(console.error);
    inputAudioContextRef.current = null;

    outputAudioContextRef.current?.close().catch(console.error);
    outputAudioContextRef.current = null;

    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();

    sessionPromiseRef.current = null;
    setStatus('idle');
    setCurrentUserText('');
    setCurrentModelText('');
  }, []);

  const stop = useCallback(async () => {
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) {
        console.error('Error closing session:', e);
      }
    }
    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    setCurrentUserText('');
    setCurrentModelText('');

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setError("API key is not configured.");
      setStatus('error');
      return;
    }

    aiRef.current = new GoogleGenAI({ apiKey });

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });

      sessionPromiseRef.current = aiRef.current.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: async () => {
            const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
            scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);

            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: AudioBlob = {
                data: encodeAudio(new Uint8Array(int16.buffer)),
                mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
              };

              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(e => console.error("Failed to send audio:", e));
            };

            source.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
            setStatus('listening');

            // Send initial context message if provided
            if (initialContextRef.current) {
              try {
                const session = await sessionPromiseRef.current;
                session.sendClientContent({
                  turns: [{ role: 'user', parts: [{ text: initialContextRef.current }] }],
                  turnComplete: true
                });
                console.log('📤 Sent initial context to voice model');
              } catch (e) {
                console.error('Failed to send initial context:', e);
              }
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle input transcription (what user said)
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              currentInputTranscriptionRef.current += text;
              setCurrentUserText(currentInputTranscriptionRef.current);
            }

            // Handle output transcription (what AI says)
            if (message.serverContent?.outputTranscription) {
              setStatus('speaking');
              const text = message.serverContent.outputTranscription.text;
              currentOutputTranscriptionRef.current += text;
              setCurrentModelText(currentOutputTranscriptionRef.current);
            }

            // Turn complete - finalize messages
            if (message.serverContent?.turnComplete) {
              // Send completed user message
              if (currentInputTranscriptionRef.current.trim()) {
                onMessageRef.current?.({
                  role: 'user',
                  text: currentInputTranscriptionRef.current.trim(),
                  isVoice: true
                });
              }
              // Send completed model message
              if (currentOutputTranscriptionRef.current.trim()) {
                const modelText = currentOutputTranscriptionRef.current.trim();
                onMessageRef.current?.({
                  role: 'model',
                  text: modelText,
                  isVoice: true
                });
                // Call model response callback for trigger detection
                onModelResponseRef.current?.(modelText);
              }
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
              setCurrentUserText('');
              setCurrentModelText('');
              setStatus('listening');
            }

            // Play audio response
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              setStatus('speaking');
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
              const audioBuffer = await decodeAudioData(decodeAudio(base64Audio), outputAudioContextRef.current, OUTPUT_SAMPLE_RATE, 1);
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContextRef.current.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;

              audioSourcesRef.current.add(source);
              source.onended = () => {
                audioSourcesRef.current.delete(source);
              };
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(source => source.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: any) => {
            console.error(e);
            setError(`An error occurred: ${e.message || 'Unknown error'}`);
            setStatus('error');
            cleanup();
          },
          onclose: () => {
            cleanup();
          },
        },
      });
    } catch (e: any) {
      console.error(e);
      setError(`Failed to start microphone: ${e.message}`);
      setStatus('error');
      cleanup();
    }
  }, [cleanup, voiceName]);

  const isActive = status === 'listening' || status === 'speaking' || status === 'connecting';

  return {
    status,
    error,
    start,
    stop,
    isActive,
    currentUserText,  // Live transcription of what user is saying
    currentModelText  // Live transcription of what AI is saying
  };
};
