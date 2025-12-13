/**
 * KnowMore - Home View
 * Landing page with topic input, mode selection, and curated experiences
 */

import React, { useState } from 'react';
import { LearningMode, LearningPreferences, Course, CurriculumData, ChatMessage } from '../types';
import { Icons } from '../constants';
import ScrollingBackground from '../components/ScrollingBackground';
import { CURATED_TOPICS, CuratedTopic } from '../data/curatedTopics';

// ============================================
// CURATED TOPIC CARD (moved from App.tsx)
// ============================================

interface CuratedTopicCardProps {
  key?: string;
  topic: CuratedTopic;
  onClick: () => void;
}

function CuratedTopicCard({ topic, onClick }: CuratedTopicCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    const fetchImage = async () => {
      try {
        const params = new URLSearchParams({
          origin: '*',
          action: 'query',
          generator: 'search',
          gsrsearch: `${topic.imageKeyword} filetype:bitmap`,
          gsrnamespace: '6',
          gsrlimit: '1',
          prop: 'imageinfo',
          iiprop: 'url',
          iiurlwidth: '400',
          format: 'json'
        });

        const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
        const data = await res.json();

        if (data.query?.pages) {
          const pages = Object.values(data.query.pages) as any[];
          if (pages[0]?.imageinfo?.[0]?.thumburl) {
            setImageUrl(pages[0].imageinfo[0].thumburl);
          }
        }
      } catch (e) {
        console.warn(`Failed to load image for ${topic.title}:`, e);
      }
      setIsLoading(false);
    };

    fetchImage();
  }, [topic.imageKeyword, topic.title]);

  return (
    <button
      onClick={onClick}
      className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-zinc-800 hover:border-amber-400/50 transition-all hover:scale-[1.02] shadow-lg"
    >
      {/* Background Image */}
      <div className="absolute inset-0 bg-zinc-900">
        {isLoading ? (
          <div className="absolute inset-0 animate-pulse bg-zinc-800" />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={topic.title}
            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />
        )}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 text-left">
        <h4 className="text-white font-semibold text-sm group-hover:text-amber-400 transition-colors">
          {topic.title}
        </h4>
        <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{topic.tagline}</p>
      </div>
    </button>
  );
}

// ============================================
// TYPES
// ============================================

interface HomeViewProps {
  topic: string;
  setTopic: (topic: string) => void;
  isChatMode: boolean;
  setIsChatMode: (v: boolean) => void;
  learningMode: LearningMode;
  setLearningMode: (m: LearningMode) => void;
  isLoading: boolean;
  loadingText: string;
  history: Course[];
  preferences: LearningPreferences;
  updatePreferences: (prefs: Partial<LearningPreferences>) => void;
  saveCustomInstructions: boolean;
  setSaveCustomInstructions: (v: boolean) => void;
  showHistorySidebar: boolean;
  setShowHistorySidebar: (v: boolean) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (v: boolean) => void;
  onSubmit: () => void;
  onLoadFromHistory: (item: Course) => void;
  onDeleteFromHistory: (id: string, e: React.MouseEvent) => void;
  onSelectCuratedTopic: (curriculum: CurriculumData) => void;
}

// ============================================
// COMPONENT
// ============================================

export function HomeView({
  topic,
  setTopic,
  isChatMode,
  setIsChatMode,
  learningMode,
  setLearningMode,
  isLoading,
  loadingText,
  history,
  preferences,
  updatePreferences,
  saveCustomInstructions,
  setSaveCustomInstructions,
  showHistorySidebar,
  setShowHistorySidebar,
  showSettingsModal,
  setShowSettingsModal,
  onSubmit,
  onLoadFromHistory,
  onDeleteFromHistory,
  onSelectCuratedTopic,
}: HomeViewProps) {
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);

  return (
    <div className="h-screen bg-zinc-950 flex">
      {/* Sidebar - Past Experiences (toggleable) */}
      <div
        className={`border-r border-zinc-800 bg-zinc-900/30 flex flex-col h-full hidden md:flex transition-all duration-300 ease-in-out ${
          showHistorySidebar ? 'w-72' : 'w-16'
        }`}
      >
        {/* Sidebar Header with Toggle */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl text-black flex-shrink-0">
              <Icons.Brain />
            </div>
            {showHistorySidebar && (
              <div className="overflow-hidden">
                <h1 className="font-bold text-white text-lg">KnowMore</h1>
                <p className="text-zinc-500 text-xs">AI Learning Platform</p>
              </div>
            )}
          </div>
          {/* Toggle Button */}
          <button
            onClick={() => setShowHistorySidebar(!showHistorySidebar)}
            className="mt-4 w-full p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 text-zinc-400 hover:text-white"
            title={showHistorySidebar ? "Hide sidebar" : "Show past experiences"}
          >
            <Icons.MessageCircle />
            {showHistorySidebar && <span className="text-sm">History</span>}
          </button>
        </div>

        {/* Past Experiences List (only when expanded) */}
        {showHistorySidebar && (
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-zinc-500 uppercase text-xs font-bold tracking-widest mb-3">Past Experiences</h3>
            {history.length === 0 ? (
              <p className="text-zinc-600 text-sm">No experiences yet. Start learning something new!</p>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onLoadFromHistory(item)}
                    className="group p-3 rounded-lg bg-zinc-800/30 border border-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-zinc-300 text-sm font-medium group-hover:text-white transition-colors line-clamp-2">
                        {item.title || item.topic}
                      </span>
                      <button
                        onClick={(e) => onDeleteFromHistory(item.id, e)}
                        className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <Icons.X />
                      </button>
                    </div>
                    <div className="text-zinc-600 text-xs mt-1">
                      {item.modules?.length || 0} modules
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero Section with Scrolling Background - Fixed Height */}
        <div className="relative min-h-[80vh] flex flex-col items-center justify-center p-6 overflow-hidden">
          {/* Animated Scrolling Image Background - contained to hero */}
          <ScrollingBackground />

          <div className="z-10 max-w-xl w-full text-center space-y-8 animate-fade-in-up">
            {/* Mobile Logo */}
            <div className="md:hidden flex justify-center mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl text-black">
                  <Icons.Brain />
                </div>
                <h1 className="font-bold text-white text-2xl">KnowMore</h1>
              </div>
            </div>

            {/* Main Heading */}
            <div className="space-y-3">
              <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                What do you want to <span className="text-amber-400">learn</span>?
              </h2>
              <p className="text-zinc-400 text-lg">
                Master any topic with AI-powered structured learning
              </p>
            </div>

            {/* Input Section - Larger 2-row prompt box */}
            <div className="space-y-6 w-full max-w-2xl">
              <div className="relative group">
                {/* Glow effect behind input */}
                <div className="absolute -inset-3 bg-gradient-to-r from-amber-400/20 via-orange-500/20 to-amber-400/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {/* Large prompt box */}
                <div className="relative bg-zinc-900/95 border-2 border-zinc-700 rounded-2xl shadow-2xl focus-within:ring-4 focus-within:ring-amber-400/30 focus-within:border-amber-400 transition-all overflow-visible">
                  {/* Top row: Input field with Send button */}
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                      placeholder={isChatMode ? "Describe what you want to learn..." : "Enter a topic to learn about..."}
                      className="flex-1 min-w-0 bg-transparent text-white text-xl px-6 py-6 focus:outline-none placeholder-zinc-500"
                    />
                    <div className="flex-shrink-0 pr-3">
                      <button
                        onClick={onSubmit}
                        disabled={isLoading || !topic.trim()}
                        className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-zinc-950 rounded-lg px-5 py-2.5 flex items-center gap-2 transition-all disabled:opacity-50 font-semibold text-sm shadow-lg whitespace-nowrap"
                      >
                        {isLoading ? (
                          <span className="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                        ) : (
                          <>Start<Icons.ArrowRight /></>
                        )}
                      </button>
                    </div>
                  </div>
                  {/* Bottom row: Mode dropdown at left corner */}
                  <div className="border-t border-zinc-800 px-3 py-2 flex items-center">
                    <div className="relative">
                      <button
                        onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
                        onBlur={() => setTimeout(() => setModeDropdownOpen(false), 150)}
                        className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-amber-400 text-sm transition-colors rounded-lg hover:bg-zinc-800/50"
                      >
                        <span>{learningMode === 'curriculum' ? '📚' : learningMode === 'article' ? '📄' : '🎬'}</span>
                        <span className="capitalize">{learningMode === 'presentation' ? 'Presentation' : learningMode}</span>
                        <svg className={`w-3 h-3 transition-transform ${modeDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {modeDropdownOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50">
                          {[
                            { value: 'curriculum', label: 'Curriculum', emoji: '📚', desc: 'Structured modules' },
                            { value: 'article', label: 'Article', emoji: '📄', desc: 'Single page read' },
                            { value: 'presentation', label: 'Presentation', emoji: '🎬', desc: 'Visual slides' }
                          ].map((option) => (
                            <button
                              key={option.value}
                              onMouseDown={(e) => { e.preventDefault(); setLearningMode(option.value as LearningMode); setModeDropdownOpen(false); }}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors ${
                                learningMode === option.value ? 'bg-zinc-800 text-amber-400' : 'text-white'
                              }`}
                            >
                              <span className="text-lg">{option.emoji}</span>
                              <div>
                                <div className="font-medium">{option.label}</div>
                                <div className="text-xs text-zinc-500">{option.desc}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mode Toggle and Settings */}
              <div className="flex flex-col items-center gap-4">
                {/* Quick/Guided Toggle */}
                <div className="flex items-center gap-4 text-sm">
                  <span className={`transition-colors ${!isChatMode ? 'text-white font-medium' : 'text-zinc-500'}`}>Quick Generate</span>
                  <button
                    onClick={() => setIsChatMode(!isChatMode)}
                    className={`w-14 h-7 rounded-full p-1 transition-colors ${isChatMode ? 'bg-amber-400' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-black transition-transform ${isChatMode ? 'translate-x-7' : 'translate-x-0'}`}></div>
                  </button>
                  <span className={`transition-colors ${isChatMode ? 'text-white font-medium' : 'text-zinc-500'}`}>Guided Chat</span>
                  {/* Settings button - only show in Quick Generate mode */}
                  {!isChatMode && (
                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="ml-2 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                      title="Personalization Settings"
                    >
                      <Icons.Settings />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-zinc-600 text-sm">
                {learningMode === 'curriculum'
                  ? (isChatMode ? "I'll ask a few questions to personalize your learning experience" : "Generate a curriculum instantly based on your topic")
                  : learningMode === 'article'
                  ? "Generate a comprehensive article with sections and images"
                  : "Create an interactive presentation with slides and voice"
                }
              </p>
            </div>

            {isLoading && (
              <div className="text-amber-400 text-sm animate-pulse tracking-wide">{loadingText}</div>
            )}

            {/* Settings Modal */}
            {showSettingsModal && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowSettingsModal(false)}>
                <div
                  className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">Personalization Settings</h3>
                    <button
                      onClick={() => setShowSettingsModal(false)}
                      className="text-zinc-500 hover:text-white transition-colors"
                    >
                      <Icons.X />
                    </button>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-zinc-400 text-sm font-medium mb-2">Knowledge Level</label>
                      <select
                        value={preferences.knowledgeLevel}
                        onChange={e => updatePreferences({ knowledgeLevel: e.target.value as LearningPreferences['knowledgeLevel'] })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:border-amber-400 focus:outline-none transition-colors"
                      >
                        <option value="beginner">Beginner - New to this topic</option>
                        <option value="intermediate">Intermediate - Some familiarity</option>
                        <option value="advanced">Advanced - Good understanding</option>
                        <option value="expert">Expert - Deep expertise</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-sm font-medium mb-2">Preferred Depth</label>
                      <select
                        value={preferences.preferredDepth}
                        onChange={e => updatePreferences({ preferredDepth: e.target.value as LearningPreferences['preferredDepth'] })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:border-amber-400 focus:outline-none transition-colors"
                      >
                        <option value="quick">Quick Overview - 3 modules</option>
                        <option value="standard">Standard Learning - 4 modules</option>
                        <option value="deep">Deep Study - 5 modules</option>
                        <option value="comprehensive">Comprehensive Mastery - 6 modules</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-sm font-medium mb-2">Custom Instructions (Optional)</label>
                      <textarea
                        value={preferences.customInstructions}
                        onChange={e => updatePreferences({ customInstructions: e.target.value })}
                        placeholder="E.g., Focus on practical examples..."
                        rows={3}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none transition-colors resize-none"
                      />
                      <label className="flex items-center gap-2 mt-2 text-sm text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveCustomInstructions}
                          onChange={e => setSaveCustomInstructions(e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-400 focus:ring-offset-zinc-900"
                        />
                        Save for future queries
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowSettingsModal(false)}
                    className="w-full mt-6 bg-amber-400 hover:bg-amber-500 text-black font-semibold py-3 rounded-xl transition-colors"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Curated Topics Section - Below hero, solid background */}
        <div className="bg-zinc-950 border-t border-zinc-900 px-6 md:px-12 py-16">
          <div className="max-w-6xl mx-auto">
            <h3 className="text-white text-2xl font-bold mb-10 text-center">Curated Experiences</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {CURATED_TOPICS.map((curatedTopic) => (
                <CuratedTopicCard
                  key={curatedTopic.id}
                  topic={curatedTopic}
                  onClick={() => onSelectCuratedTopic(curatedTopic.curriculum)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Mobile History */}
        {history.length > 0 && (
          <div className="md:hidden bg-zinc-950 px-6 py-8">
            <h3 className="text-zinc-600 uppercase text-xs font-bold tracking-widest mb-3">Continue Learning</h3>
            <div className="space-y-2">
              {history.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onLoadFromHistory(item)}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-900 hover:border-zinc-700 transition-all"
                >
                  <span className="text-zinc-300 font-medium">{item.title || item.topic}</span>
                  <Icons.ArrowRight />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default HomeView;
