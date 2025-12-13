/**
 * KnowMore - Presentation View
 * Slide-based presentation with navigation and AI presenter chat
 */

import React from 'react';
import { Presentation, ChatMessage } from '../types';
import { Icons } from '../constants';
import { LIVE_VOICE_ENABLED } from '../services/geminiService';
import { VoiceStatus } from '../hooks/useGeminiLive';

interface VoiceChatInstance {
  isActive: boolean;
  status: VoiceStatus;
  currentUserText: string;
  currentModelText: string;
  start: () => void;
  stop: () => void;
}

interface PresentationViewProps {
  presentation: Presentation;
  activePresentationSlide: number;
  setActivePresentationSlide: React.Dispatch<React.SetStateAction<number>>;
  chatMessages: ChatMessage[];
  showChatPane: boolean;
  setShowChatPane: React.Dispatch<React.SetStateAction<boolean>>;
  voiceChat: VoiceChatInstance;
  onBack: () => void;
}

export function PresentationView({
  presentation,
  activePresentationSlide,
  setActivePresentationSlide,
  chatMessages,
  showChatPane,
  setShowChatPane,
  voiceChat,
  onBack,
}: PresentationViewProps) {
  const currentSlide = presentation.slides[activePresentationSlide];
  const isFirst = activePresentationSlide === 0;
  const isLast = activePresentationSlide === presentation.slides.length - 1;

  return (
    <div className="h-screen bg-zinc-950 flex overflow-hidden">
      {/* Main Presentation Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-zinc-950/95 border-b border-zinc-800 px-8 py-4">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
              <Icons.ArrowLeft /> Back
            </button>
            <span className="text-zinc-500">{activePresentationSlide + 1} / {presentation.slides.length}</span>
            <button
              onClick={() => setShowChatPane(!showChatPane)}
              className={`p-2 rounded-lg transition-colors ${showChatPane ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
            >
              <Icons.MessageCircle />
            </button>
          </div>
        </div>

        {/* Slide Content */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
          <div className="max-w-5xl w-full bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-12 shadow-2xl">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">{currentSlide.title}</h2>

            <div className="flex gap-8">
              {/* Points */}
              <div className="flex-1">
                <ul className="space-y-4">
                  {currentSlide.points.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-lg text-zinc-300">
                      <span className="text-amber-400 mt-1">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Images */}
              {currentSlide.imageUrls && currentSlide.imageUrls.length > 0 && (
                <div className="w-1/3 space-y-3">
                  {currentSlide.imageUrls.filter(url => url).slice(0, 2).map((url, idx) => (
                    <img key={idx} src={url!} alt="" className="w-full rounded-xl object-cover shadow-lg" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-shrink-0 flex justify-center items-center gap-4 py-6 bg-zinc-950 border-t border-zinc-800">
          <button onClick={() => setActivePresentationSlide(Math.max(0, activePresentationSlide - 1))} disabled={isFirst} className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-30"><Icons.ArrowLeft /></button>
          <div className="flex gap-2">
            {presentation.slides.map((_, idx) => (
              <button key={idx} onClick={() => setActivePresentationSlide(idx)} className={`w-3 h-3 rounded-full transition-colors ${idx === activePresentationSlide ? 'bg-amber-400' : 'bg-zinc-700 hover:bg-zinc-600'}`} />
            ))}
          </div>
          <button onClick={() => setActivePresentationSlide(Math.min(presentation.slides.length - 1, activePresentationSlide + 1))} disabled={isLast} className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-30"><Icons.ArrowRight /></button>
        </div>
      </div>

      {/* Chat Pane */}
      {showChatPane && (
        <div className="w-[380px] border-l border-zinc-800 bg-zinc-950 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="font-semibold text-zinc-200 flex items-center gap-2">
              <Icons.MessageCircle /> AI Presenter
              {voiceChat.isActive && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-600">🎤 Live</span>}
            </h3>
            <button onClick={() => setShowChatPane(false)} className="text-zinc-500 hover:text-white"><Icons.X /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === 'user' ? 'bg-amber-400 text-black' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'}`}>{msg.text}</div>
              </div>
            ))}
            {voiceChat.isActive && (voiceChat.currentUserText || voiceChat.currentModelText) && (
              <div className="space-y-2">
                {voiceChat.currentUserText && <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl p-3 text-sm bg-amber-400/50 text-black/70 italic">{voiceChat.currentUserText}...</div></div>}
                {voiceChat.currentModelText && <div className="flex justify-start"><div className="max-w-[85%] rounded-2xl p-3 text-sm bg-zinc-900/50 text-zinc-400 border border-zinc-800 italic">{voiceChat.currentModelText}...</div></div>}
              </div>
            )}
          </div>
          <div className="p-3 bg-zinc-950 border-t border-zinc-900">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => voiceChat.isActive ? voiceChat.stop() : voiceChat.start()}
                className={`flex-1 rounded-xl py-3 font-medium transition-all ${voiceChat.isActive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
              >
                {voiceChat.isActive ? '⏹ Stop Voice' : '🎤 Start Voice Presenter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PresentationView;
