/**
 * KnowMore - Clarification View
 * Chat consultation interface for understanding user's learning goals
 */

import React, { useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { Icons } from '../constants';
import { LIVE_VOICE_ENABLED } from '../services/geminiService';
import { VoiceStatus } from '../hooks/useGeminiLive';

// ============================================
// TYPES
// ============================================

interface VoiceChatInstance {
  isActive: boolean;
  status: VoiceStatus;
  currentUserText: string;
  currentModelText: string;
  start: () => void;
  stop: () => void;
}

interface ClarificationViewProps {
  messages: ChatMessage[];
  isConsulting: boolean;
  isLoading: boolean;
  voiceChat: VoiceChatInstance;
  onBack: () => void;
  onSend: (text: string) => void;
  onGenerateCurriculum: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function ClarificationView({
  messages,
  isConsulting,
  isLoading,
  voiceChat,
  onBack,
  onSend,
  onGenerateCurriculum,
}: ClarificationViewProps) {
  const clarificationEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    clarificationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading && !voiceChat.isActive) {
      onSend(e.currentTarget.value);
      e.currentTarget.value = '';
    }
  };

  const handleSendClick = () => {
    const input = document.getElementById('consultant-input') as HTMLInputElement;
    if (input?.value.trim() && !isLoading) {
      onSend(input.value);
      input.value = '';
    }
  };

  return (
    <div className="h-screen bg-zinc-950 flex flex-col p-4 md:p-8">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col min-h-0 bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <Icons.ArrowLeft />
            </button>
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Icons.Brain /> Learning Buddy
            </h2>
          </div>
          <button
            onClick={onGenerateCurriculum}
            disabled={isLoading || messages.length < 2}
            className="bg-amber-400 text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-amber-500 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Generating...' : 'Create Curriculum'}
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                ? 'bg-zinc-800 text-white'
                : 'bg-zinc-950 border border-zinc-800 text-zinc-300'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}

          {/* Live transcription indicator for voice chat */}
          {voiceChat.isActive && (voiceChat.currentUserText || voiceChat.currentModelText) && (
            <div className="space-y-2">
              {voiceChat.currentUserText && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] p-4 rounded-2xl text-sm bg-zinc-800/50 text-white/70 italic">
                    {voiceChat.currentUserText}...
                  </div>
                </div>
              )}
              {voiceChat.currentModelText && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-4 rounded-2xl text-sm bg-zinc-950/50 text-zinc-400 border border-zinc-800 italic">
                    {voiceChat.currentModelText}...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Consulting (thinking) indicator */}
          {isConsulting && !isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl text-zinc-500 text-sm animate-pulse">
                Thinking...
              </div>
            </div>
          )}

          {/* Curriculum Generation Loading */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gradient-to-r from-amber-400/10 to-orange-400/10 border border-amber-400/30 p-5 rounded-2xl flex items-center gap-4">
                <div className="animate-spin h-6 w-6 border-3 border-amber-400 border-t-transparent rounded-full"></div>
                <div>
                  <div className="text-amber-400 font-medium">Creating your curriculum...</div>
                  <div className="text-zinc-500 text-sm mt-1">Designing a personalized learning path</div>
                </div>
              </div>
            </div>
          )}

          <div ref={clarificationEndRef} />
        </div>

        {/* Input - disabled when loading */}
        <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
          {/* Live transcription indicator */}
          {voiceChat.isActive && (voiceChat.currentUserText || voiceChat.currentModelText) && (
            <div className="mb-3 p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm">
              {voiceChat.currentUserText && (
                <p className="text-zinc-400 italic">You: {voiceChat.currentUserText}...</p>
              )}
              {voiceChat.currentModelText && (
                <p className="text-purple-400 italic">AI: {voiceChat.currentModelText}...</p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <input
              id="consultant-input"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-700 disabled:opacity-50"
              placeholder={isLoading ? "Generating curriculum..." : voiceChat.isActive ? "Listening..." : "Type your answer..."}
              disabled={isLoading || voiceChat.isActive}
              onKeyDown={handleInputKeyDown}
            />
            {/* Voice chat button - only show if enabled */}
            {LIVE_VOICE_ENABLED && (
              <button
                onClick={() => voiceChat.isActive ? voiceChat.stop() : voiceChat.start()}
                disabled={isLoading}
                className={`rounded-xl px-4 py-3 transition-all ${
                  voiceChat.isActive
                    ? voiceChat.status === 'speaking'
                      ? 'bg-purple-600 text-white animate-pulse'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                } disabled:opacity-50`}
                title={voiceChat.isActive ? 'Stop voice chat' : 'Start voice chat'}
              >
                {voiceChat.isActive ? <Icons.Stop /> : <Icons.Mic />}
              </button>
            )}
            {/* Send button */}
            <button
              onClick={handleSendClick}
              disabled={isLoading || voiceChat.isActive}
              className="bg-amber-400 hover:bg-amber-500 text-black rounded-xl px-4 py-3 disabled:opacity-50 transition-colors"
              title="Send message"
            >
              <Icons.ArrowRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClarificationView;
