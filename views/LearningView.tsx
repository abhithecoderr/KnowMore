/**
 * KnowMore - Learning View
 * Main learning interface with curriculum sidebar, slide content, and AI chat
 */

import React, { useRef } from 'react';
import { Course, Slide, ChatMessage } from '../types';
import { Icons } from '../constants';
import { SlideView } from '../components/SlideView';
import { generateChatResponse } from '../services/geminiService';
import { VoiceStatus } from '../hooks/useGeminiLive';

interface VoiceChatInstance {
  isActive: boolean;
  status: VoiceStatus;
  currentUserText: string;
  currentModelText: string;
  start: () => void;
  stop: () => void;
}

interface LearningViewProps {
  course: Course;
  activeModuleIndex: number;
  activeSlideIndex: number;
  isGeneratingModule: boolean;
  showCurriculumSidebar: boolean;
  setShowCurriculumSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  curriculumSidebarWidth: number;
  setCurriculumSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  showChatPane: boolean;
  setShowChatPane: React.Dispatch<React.SetStateAction<boolean>>;
  chatPaneWidth: number;
  setChatPaneWidth: React.Dispatch<React.SetStateAction<number>>;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  isChatLoading: boolean;
  setIsChatLoading: React.Dispatch<React.SetStateAction<boolean>>;
  voiceChat: VoiceChatInstance;
  onJumpToSlide: (modIdx: number, slideIdx: number) => Promise<void>;
  onNavigateSlide: (direction: 'next' | 'prev') => Promise<void>;
  onBack: () => void;
}

export function LearningView({
  course,
  activeModuleIndex,
  activeSlideIndex,
  isGeneratingModule,
  showCurriculumSidebar,
  setShowCurriculumSidebar,
  curriculumSidebarWidth,
  setCurriculumSidebarWidth,
  showChatPane,
  setShowChatPane,
  chatPaneWidth,
  setChatPaneWidth,
  chatMessages,
  setChatMessages,
  chatInput,
  setChatInput,
  isChatLoading,
  setIsChatLoading,
  voiceChat,
  onJumpToSlide,
  onNavigateSlide,
  onBack,
}: LearningViewProps) {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentModule = course.modules[activeModuleIndex];
  const currentSlide = currentModule?.slides[activeSlideIndex];
  const isFirst = activeModuleIndex === 0 && activeSlideIndex === 0;
  const isLast = activeModuleIndex === course.modules.length - 1 &&
                 activeSlideIndex === currentModule?.slides.length - 1;

  // Drag handlers for resizing
  const handleCurriculumDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = curriculumSidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(200, Math.min(400, startWidth + delta));
      setCurriculumSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleChatDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = chatPaneWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(500, startWidth + delta));
      setChatPaneWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading || voiceChat.isActive) return;

    const userMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    const input = chatInput;
    setChatInput('');
    setIsChatLoading(true);

    try {
      const history = chatMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const contextPrompt = `Context: Topic is "${course.topic}", current slide is "${currentSlide?.title}". `;
      const response = await generateChatResponse(history, contextPrompt + input);
      setChatMessages(prev => [...prev, { role: 'model', text: response, timestamp: Date.now() }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I had trouble responding. Please try again.", timestamp: Date.now() }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden text-white">
      {/* Left Sidebar - Curriculum (toggleable + resizable) */}
      <div
        className={`bg-black border-r border-zinc-900 flex-col hidden md:flex transition-all duration-300 relative ${
          showCurriculumSidebar ? '' : 'w-12'
        }`}
        style={{ width: showCurriculumSidebar ? curriculumSidebarWidth : 48 }}
      >
        {showCurriculumSidebar ? (
          <>
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <h2 className="font-semibold text-base text-zinc-200 truncate flex-1">{course.title}</h2>
              <button onClick={() => setShowCurriculumSidebar(false)} className="text-zinc-500 hover:text-white p-1" title="Hide sidebar">
                <Icons.ArrowLeft />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {course.modules.map((mod, modIdx) => (
                <div key={mod.id}>
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 px-2 flex items-center gap-2">
                    Module {modIdx + 1}
                    {!mod.isLoaded && <span className="text-amber-400 text-[10px] normal-case">(loading...)</span>}
                  </div>
                  <div className="text-sm text-zinc-400 px-2 mb-2 truncate">{mod.title}</div>
                  <div className="space-y-1">
                    {mod.slides.map((slide, slideIdx) => (
                      <button
                        key={slide.id}
                        onClick={() => onJumpToSlide(modIdx, slideIdx)}
                        disabled={!mod.isLoaded}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-all flex items-center gap-2 disabled:opacity-50 ${
                          modIdx === activeModuleIndex && slideIdx === activeSlideIndex
                          ? 'bg-zinc-900 text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          modIdx === activeModuleIndex && slideIdx === activeSlideIndex
                          ? 'bg-amber-400'
                          : 'bg-zinc-700'
                        }`}></div>
                        <span className="truncate">{slide.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-zinc-900">
              <button onClick={onBack} className="text-sm text-zinc-500 hover:text-white flex items-center gap-2 transition-colors">
                <Icons.ArrowLeft /> Exit
              </button>
            </div>
            {/* Resize handle */}
            <div className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-amber-400/50 transition-colors" onMouseDown={handleCurriculumDrag} />
          </>
        ) : (
          <div className="flex flex-col items-center h-full py-4">
            <button onClick={() => setShowCurriculumSidebar(true)} className="text-zinc-500 hover:text-white p-2" title="Show curriculum">
              <Icons.BookOpen />
            </button>
            <div className="flex-1"></div>
            <button onClick={onBack} className="text-zinc-500 hover:text-white p-2 mb-2" title="Exit">
              <Icons.ArrowLeft />
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative bg-zinc-950">
        {/* Desktop Header */}
        <div className="hidden md:flex h-14 border-b border-zinc-800 items-center justify-between px-6 bg-zinc-950">
          <div className="flex items-center gap-3 text-zinc-400 text-sm">
            <span className="text-zinc-600">Module {activeModuleIndex + 1}</span>
            <span className="text-zinc-700">•</span>
            <span className="text-white font-medium truncate max-w-md">{currentSlide?.title}</span>
          </div>
          <button onClick={() => setShowChatPane(!showChatPane)} className={`p-2 rounded-lg transition-colors ${showChatPane ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} title="Ask AI">
            <Icons.MessageCircle />
          </button>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950">
          <button onClick={onBack} className="text-zinc-400"><Icons.ArrowLeft /></button>
          <div className="flex flex-col overflow-hidden text-center">
            <span className="font-bold truncate text-sm text-white">{currentSlide?.title}</span>
          </div>
          <button onClick={() => setShowChatPane(!showChatPane)} className="text-zinc-400">
            <Icons.MessageCircle />
          </button>
        </div>

        {/* Slide Content */}
        <div ref={contentScrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 pb-28">
          <div className="max-w-4xl mx-auto w-full">
            {isGeneratingModule ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-pulse">
                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-white">
                  <Icons.Sparkles />
                </div>
                <h2 className="text-xl font-medium text-zinc-300">Loading module...</h2>
              </div>
            ) : currentSlide && currentSlide.blocks.length > 0 ? (
              <SlideView slide={currentSlide} />
            ) : (
              <div className="flex items-center justify-center min-h-[60vh]">
                <p className="text-zinc-500">No content available for this slide.</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Nav */}
        <div className="h-20 bg-zinc-950/90 backdrop-blur border-t border-zinc-900 flex items-center justify-between px-6 absolute bottom-0 w-full z-20">
          <button disabled={isFirst} onClick={() => onNavigateSlide('prev')} className="flex items-center gap-2 text-zinc-500 hover:text-white disabled:opacity-20 transition-colors">
            <Icons.ArrowLeft /> Previous
          </button>
          <button disabled={isLast} onClick={() => onNavigateSlide('next')} className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-black px-6 py-2.5 rounded-full font-semibold transition-all disabled:opacity-30">
            Next <Icons.ArrowRight />
          </button>
        </div>
      </div>

      {/* Right Chat Pane (toggleable + resizable) */}
      {showChatPane && (
        <div className="bg-black border-l border-zinc-900 flex flex-col h-full relative transition-all duration-300" style={{ width: chatPaneWidth }}>
          {/* Resize handle */}
          <div className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-amber-400/50 transition-colors" onMouseDown={handleChatDrag} />

          {/* Chat Header */}
          <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
            <h3 className="font-semibold text-zinc-200 flex items-center gap-2">
              <Icons.MessageCircle /> AI Tutor
              {voiceChat.isActive && (
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${voiceChat.status === 'speaking' ? 'bg-purple-600 animate-pulse' : 'bg-green-600'}`}>
                  {voiceChat.status === 'speaking' ? '🔊 Speaking' : '🎤 Listening'}
                </span>
              )}
            </h3>
            <button onClick={() => setShowChatPane(false)} className="text-zinc-500 hover:text-white">
              <Icons.X />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && !voiceChat.isActive && (
              <div className="text-center text-zinc-600 text-sm py-8">
                <p className="mb-2">Hi! I'm here to help.</p>
                <p>Ask me anything about <span className="text-zinc-400">{currentSlide?.title}</span></p>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-amber-400 text-black' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'}`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Live transcription indicator */}
            {voiceChat.isActive && (voiceChat.currentUserText || voiceChat.currentModelText) && (
              <div className="space-y-2">
                {voiceChat.currentUserText && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl p-3 text-sm bg-amber-400/50 text-black/70 italic">
                      {voiceChat.currentUserText}...
                    </div>
                  </div>
                )}
                {voiceChat.currentModelText && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl p-3 text-sm bg-zinc-900/50 text-zinc-400 border border-zinc-800 italic">
                      {voiceChat.currentModelText}...
                    </div>
                  </div>
                )}
              </div>
            )}

            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-2xl text-zinc-500 text-sm animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <form onSubmit={handleChatSubmit} className="p-3 bg-zinc-950 border-t border-zinc-900">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={voiceChat.isActive ? "Listening..." : "Ask a question..."}
                disabled={voiceChat.isActive}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
              />
              {/* Voice button */}
              <button
                type="button"
                onClick={() => voiceChat.isActive ? voiceChat.stop() : voiceChat.start()}
                disabled={isChatLoading}
                className={`rounded-xl px-3 py-2 transition-all ${
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
              {/* Send button */}
              <button
                type="submit"
                disabled={isChatLoading || voiceChat.isActive}
                className="bg-amber-400 hover:bg-amber-500 text-black rounded-xl px-3 py-2 disabled:opacity-50 transition-colors"
              >
                <Icons.ArrowRight />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default LearningView;
