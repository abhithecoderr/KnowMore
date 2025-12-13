/**
 * KnowMore - Curriculum Review View
 * Interface for reviewing and adjusting generated curriculum before generating experience
 */

import React, { useRef, useEffect } from 'react';
import { CurriculumData, ChatMessage } from '../types';
import { Icons } from '../constants';

// ============================================
// TYPES
// ============================================

interface CurriculumReviewViewProps {
  curriculum: CurriculumData;
  refinementMessages: ChatMessage[];
  adjustPrompt: string;
  setAdjustPrompt: (v: string) => void;
  isChatMode: boolean;
  isRefiningCurriculum: boolean;
  isLoading: boolean;
  loadingText: string;
  onBack: () => void;
  onGenerateExperience: () => void;
  onRefinementSend: (text: string) => void;
  onAdjustCurriculum: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function CurriculumReviewView({
  curriculum,
  refinementMessages,
  adjustPrompt,
  setAdjustPrompt,
  isChatMode,
  isRefiningCurriculum,
  isLoading,
  loadingText,
  onBack,
  onGenerateExperience,
  onRefinementSend,
  onAdjustCurriculum,
}: CurriculumReviewViewProps) {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const refinementEndRef = useRef<HTMLDivElement>(null);

  // Scroll to refinement messages when they change
  useEffect(() => {
    refinementEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [refinementMessages]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isRefiningCurriculum) {
      if (isChatMode) {
        onRefinementSend(e.currentTarget.value);
        e.currentTarget.value = '';
      } else {
        onAdjustCurriculum();
      }
    }
  };

  const handleAdjustClick = () => {
    if (isChatMode) {
      const input = document.querySelector('input[placeholder*="Add more examples"]') as HTMLInputElement;
      if (input?.value) {
        onRefinementSend(input.value);
        input.value = '';
      }
    } else {
      onAdjustCurriculum();
    }
  };

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* Minimal Header */}
      <div className="flex-shrink-0 border-b border-zinc-900 bg-zinc-950 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <button
            onClick={onBack}
            className="text-zinc-500 hover:text-white text-sm flex items-center gap-2 transition-colors"
          >
            <Icons.ArrowLeft /> Back
          </button>
          <button
            onClick={onGenerateExperience}
            disabled={isLoading}
            className="bg-amber-400 hover:bg-amber-500 text-black px-5 py-2.5 rounded-full font-semibold transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {isLoading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full"></span>
                Generating...
              </>
            ) : (
              <>
                Generate Experience <Icons.ArrowRight />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div ref={contentScrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-12">

          {/* Title + Overview Section */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">
              {curriculum.title}
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-4xl mx-auto">
              {curriculum.overview}
            </p>
          </div>

          {/* Modules Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Modules</h2>
              <span className="text-zinc-500 text-sm">
                {curriculum.modules.length} modules • {curriculum.modules.reduce((acc, m) => acc + m.slides.length, 0)} topics
              </span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {curriculum.modules.map((module, modIdx) => (
                <div
                  key={module.id}
                  className="group border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 hover:bg-zinc-900/30 transition-all duration-200 flex flex-col"
                >
                  {/* Module Number */}
                  <div className="text-amber-400 text-sm font-medium mb-2">
                    Module {String(modIdx + 1).padStart(2, '0')}
                  </div>

                  {/* Module Title */}
                  <h3 className="text-white font-semibold text-lg mb-2 leading-snug group-hover:text-amber-50 transition-colors">
                    {module.title}
                  </h3>

                  {/* Module Description */}
                  <p className="text-zinc-500 text-sm leading-relaxed mb-4">
                    {module.description}
                  </p>

                  {/* Subtopics List */}
                  <div className="mt-auto pt-4 border-t border-zinc-800/50">
                    <div className="text-zinc-600 text-xs font-medium mb-2">Topics</div>
                    <ul className="space-y-1.5">
                      {module.slides.map((slide) => (
                        <li key={slide.id} className="text-zinc-400 text-sm flex items-start gap-2">
                          <span className="w-1 h-1 rounded-full bg-amber-400/50 flex-shrink-0 mt-2"></span>
                          <span>{slide.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Learning Goals - Collapsed/Minimal */}
          {curriculum.learningGoals.length > 0 && (
            <div className="border-t border-zinc-900 pt-10">
              <details className="group">
                <summary className="text-zinc-500 text-sm cursor-pointer hover:text-zinc-300 transition-colors list-none flex items-center gap-2">
                  <Icons.BookOpen />
                  <span>View learning goals ({curriculum.learningGoals.length})</span>
                  <span className="text-zinc-700 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <ul className="mt-4 space-y-2 pl-6">
                  {curriculum.learningGoals.map((goal, idx) => (
                    <li key={idx} className="text-zinc-400 text-sm flex items-start gap-3">
                      <span className="text-amber-400/60 mt-0.5">✓</span>
                      <span>{goal}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {/* Refinement Section - At bottom of content */}
          <div className="border-t border-zinc-900 pt-10">
            <div className="max-w-3xl mx-auto">
              <h3 className="text-zinc-400 text-sm font-medium mb-4 text-center">Want to adjust the curriculum?</h3>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
                {/* Chat messages (if any) */}
                {(isChatMode ? refinementMessages : []).length > 0 && (
                  <div className="space-y-3 max-h-48 overflow-y-auto mb-4 pr-2">
                    {refinementMessages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-4 py-2 rounded-xl text-sm ${
                          msg.role === 'user'
                            ? 'bg-zinc-800 text-white'
                            : 'bg-zinc-950 text-zinc-400'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isRefiningCurriculum && (
                      <div className="text-zinc-500 text-sm animate-pulse">Updating...</div>
                    )}
                    <div ref={refinementEndRef} />
                  </div>
                )}

                {/* Input */}
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={isChatMode ? '' : adjustPrompt}
                    onChange={isChatMode ? undefined : (e) => setAdjustPrompt(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-zinc-700 placeholder-zinc-600"
                    placeholder="e.g., Add more examples, focus on practical applications..."
                    onKeyDown={handleInputKeyDown}
                  />
                  <button
                    onClick={handleAdjustClick}
                    disabled={isRefiningCurriculum || (!isChatMode && !adjustPrompt.trim())}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isRefiningCurriculum ? '...' : 'Adjust'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom padding */}
          <div className="h-8"></div>
        </div>
      </div>

      {/* Full-screen loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-zinc-950/90 flex items-center justify-center z-50">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto">
              <Icons.Sparkles />
            </div>
            <p className="text-white font-medium">{loadingText}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default CurriculumReviewView;
