/**
 * KnowMore - AI Learning Platform
 * Main Application Component (Ultra-Slim ~400 lines)
 *
 * Logic extracted to custom hooks:
 * - useCourseGeneration: Course generation, TTS, background loading
 * - useCourseNavigation: Slide/module navigation, lazy loading
 * - useCurriculumFlow: Curriculum generation, refinement, content modes
 */

import React, { useState, useEffect } from 'react';
import { Course, ViewState, ChatMessage, CurriculumData, LearningPreferences, LearningMode, Article, Presentation } from './types';
import { LIVE_VOICE_ENABLED } from './services/geminiService';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useCourseGeneration } from './hooks/useCourseGeneration';
import { useCourseNavigation } from './hooks/useCourseNavigation';
import { useCurriculumFlow } from './hooks/useCurriculumFlow';

// Import View Components
import { HomeView } from './views/HomeView';
import { ClarificationView } from './views/ClarificationView';
import { CurriculumReviewView } from './views/CurriculumReviewView';
import { ArticleView } from './views/ArticleView';
import { PresentationView } from './views/PresentationView';
import { LearningView } from './views/LearningView';

function App() {
  // ============================================
  // STATE
  // ============================================

  // View & Topic
  const [view, setView] = useState<ViewState>('HOME');
  const [topic, setTopic] = useState('');
  const [isChatMode, setIsChatMode] = useState(true);
  const [learningMode, setLearningMode] = useState<LearningMode>('curriculum');

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [isConsulting, setIsConsulting] = useState(false);
  const [isRefiningCurriculum, setIsRefiningCurriculum] = useState(false);
  const [isGeneratingModule, setIsGeneratingModule] = useState(false);

  // Core data
  const [course, setCourse] = useState<Course | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [history, setHistory] = useState<Course[]>([]);

  // Navigation
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [activePresentationSlide, setActivePresentationSlide] = useState(0);
  const [imagesSelectedForModule, setImagesSelectedForModule] = useState<boolean[]>([]);

  // Chat states
  const [clarificationMessages, setClarificationMessages] = useState<ChatMessage[]>([]);
  const [refinementMessages, setRefinementMessages] = useState<ChatMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [adjustPrompt, setAdjustPrompt] = useState('');

  // UI Panel states
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [showCurriculumSidebar, setShowCurriculumSidebar] = useState(true);
  const [showChatPane, setShowChatPane] = useState(false);
  const [curriculumSidebarWidth, setCurriculumSidebarWidth] = useState(280);
  const [chatPaneWidth, setChatPaneWidth] = useState(350);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [saveCustomInstructions, setSaveCustomInstructions] = useState(false);

  // Preferences
  const [preferences, setPreferences] = useState<LearningPreferences>({
    knowledgeLevel: 'intermediate',
    preferredDepth: 'standard',
    customInstructions: ''
  });

  // ============================================
  // HELPERS
  // ============================================

  const updatePreferences = (newPrefs: Partial<LearningPreferences>) => {
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);
    localStorage.setItem('omni_preferences', JSON.stringify(updated));
  };

  const saveToHistory = (c: Course) => {
    const newHistory = [c, ...history.filter(h => h.id !== c.id)].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('omni_history', JSON.stringify(newHistory));
  };

  const loadFromHistory = (item: Course) => {
    setCourse(item);
    setActiveModuleIndex(0);
    setActiveSlideIndex(0);
    setView(item.modules.some(m => m.isLoaded) ? 'LEARNING' : 'PLANNER');
  };

  const deleteFromHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem('omni_history', JSON.stringify(newHistory));
  };

  // ============================================
  // VOICE CHAT
  // ============================================

  const currentSlideForVoice = course?.modules[activeModuleIndex]?.slides[activeSlideIndex];
  const slideContentForVoice = currentSlideForVoice?.blocks
    ?.filter((b: any) => ['text', 'fun_fact', 'notes_summary'].includes(b.type))
    ?.map((b: any) => b.type === 'text' ? b.content : b.type === 'fun_fact' ? `Fun fact: ${b.fact}` : b.summary || b.points?.join('. '))
    ?.join('\n\n') || '';

  const learningVoice = useGeminiLive({
    onMessage: (msg) => setChatMessages(prev => [...prev, { role: msg.role, text: msg.text, timestamp: Date.now() }]),
    initialContext: course ? `[CONTEXT: You are a friendly AI tutor. Student learning "${course.topic}". Current slide: "${currentSlideForVoice?.title}". Content: ${slideContentForVoice}. Keep responses brief for voice chat.]` : undefined
  });

  const conversationContextForVoice = clarificationMessages.map(m => `${m.role === 'user' ? 'User' : 'Consultant'}: ${m.text}`).join('\n');

  const consultantVoice = useGeminiLive({
    onMessage: (msg) => setClarificationMessages(prev => [...prev, { role: msg.role, text: msg.text, timestamp: Date.now() }]),
    onGenerateCurriculum: () => {
      consultantVoice.stop();
      setTimeout(() => { if (!isLoading && clarificationMessages.length >= 2) curriculumFlow.handleGenerateFromChat(); }, 500);
    },
    initialContext: conversationContextForVoice
      ? `[CONTEXT: Learning consultant. Conversation: ${conversationContextForVoice}. Help clarify learning goals. When ready, offer curriculum. Call request_curriculum_generation if agreed.]`
      : `[CONTEXT: Learning consultant. Greet user, ask what they want to learn, understand level and goals. Offer curriculum when ready. Only call request_curriculum_generation if agreed.]`
  });

  // ============================================
  // CUSTOM HOOKS
  // ============================================

  const curriculumFlow = useCurriculumFlow({
    topic, learningMode, preferences, saveCustomInstructions, curriculum, clarificationMessages,
    setCurriculum, setClarificationMessages, setRefinementMessages,
    setIsLoading, setLoadingText, setIsConsulting, setIsRefiningCurriculum,
    setView, setArticle, setPresentation, setActivePresentationSlide,
    updatePreferences, consultantVoice,
  });

  const courseGeneration = useCourseGeneration({
    topic, curriculum, setCourse, setView, setIsLoading, setLoadingText,
    setActiveModuleIndex, setActiveSlideIndex, setImagesSelectedForModule, saveToHistory,
  });

  const courseNavigation = useCourseNavigation({
    course, activeModuleIndex, activeSlideIndex, imagesSelectedForModule,
    setCourse, setActiveModuleIndex, setActiveSlideIndex, setIsGeneratingModule, setImagesSelectedForModule, saveToHistory,
  });

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    const saved = localStorage.getItem('omni_history');
    if (saved) try { setHistory(JSON.parse(saved)); } catch {}
  }, []);

  useEffect(() => {
    const savedPrefs = localStorage.getItem('omni_preferences');
    if (savedPrefs) try { setPreferences(JSON.parse(savedPrefs)); } catch {}
  }, []);

  useEffect(() => {
    if (course && view === 'LEARNING') {
      const module = course.modules[activeModuleIndex];
      if (module?.isLoaded && !module.ttsGenerated) {
        courseGeneration.generateModuleTTS(course, activeModuleIndex);
      }
    }
  }, [activeModuleIndex, course, view]);

  // ============================================
  // VIEWS
  // ============================================

  if (view === 'HOME') {
    return (
      <HomeView
        topic={topic} setTopic={setTopic}
        isChatMode={isChatMode} setIsChatMode={setIsChatMode}
        learningMode={learningMode} setLearningMode={setLearningMode}
        isLoading={isLoading} loadingText={loadingText}
        history={history} preferences={preferences}
        updatePreferences={updatePreferences}
        saveCustomInstructions={saveCustomInstructions} setSaveCustomInstructions={setSaveCustomInstructions}
        showHistorySidebar={showHistorySidebar} setShowHistorySidebar={setShowHistorySidebar}
        showSettingsModal={showSettingsModal} setShowSettingsModal={setShowSettingsModal}
        onSubmit={() => curriculumFlow.handleInitialSubmit(isChatMode)}
        onLoadFromHistory={loadFromHistory}
        onDeleteFromHistory={deleteFromHistory}
        onSelectCuratedTopic={(c) => { setCurriculum(c); setRefinementMessages([]); setView('CURRICULUM_REVIEW'); }}
      />
    );
  }

  if (view === 'CLARIFICATION') {
    return (
      <ClarificationView
        messages={clarificationMessages}
        isConsulting={isConsulting} isLoading={isLoading}
        voiceChat={consultantVoice}
        onBack={() => setView('HOME')}
        onSend={curriculumFlow.handleClarificationSend}
        onGenerateCurriculum={() => curriculumFlow.handleGenerateFromChat()}
      />
    );
  }

  if (view === 'CURRICULUM_REVIEW' && curriculum) {
    return (
      <CurriculumReviewView
        curriculum={curriculum}
        refinementMessages={refinementMessages}
        adjustPrompt={adjustPrompt} setAdjustPrompt={setAdjustPrompt}
        isChatMode={isChatMode} isRefiningCurriculum={isRefiningCurriculum}
        isLoading={isLoading} loadingText={loadingText}
        onBack={() => setView('HOME')}
        onGenerateExperience={courseGeneration.handleGenerateExperience}
        onRefinementSend={curriculumFlow.handleRefinementSend}
        onAdjustCurriculum={() => curriculumFlow.handleAdjustCurriculum(adjustPrompt, setAdjustPrompt)}
      />
    );
  }

  if (view === 'ARTICLE' && article) {
    return (
      <ArticleView
        article={article}
        chatMessages={chatMessages} setChatMessages={setChatMessages}
        chatInput={chatInput} setChatInput={setChatInput}
        isChatLoading={isChatLoading} setIsChatLoading={setIsChatLoading}
        showChatPane={showChatPane} setShowChatPane={setShowChatPane}
        onBack={() => { setView('HOME'); setArticle(null); }}
      />
    );
  }

  if (view === 'PRESENTATION' && presentation) {
    return (
      <PresentationView
        presentation={presentation}
        activePresentationSlide={activePresentationSlide}
        setActivePresentationSlide={setActivePresentationSlide}
        chatMessages={chatMessages}
        showChatPane={showChatPane} setShowChatPane={setShowChatPane}
        voiceChat={learningVoice}
        onBack={() => { setView('HOME'); setPresentation(null); }}
      />
    );
  }

  if (view === 'LEARNING' && course) {
    return (
      <LearningView
        course={course}
        activeModuleIndex={activeModuleIndex} activeSlideIndex={activeSlideIndex}
        isGeneratingModule={isGeneratingModule}
        showCurriculumSidebar={showCurriculumSidebar} setShowCurriculumSidebar={setShowCurriculumSidebar}
        curriculumSidebarWidth={curriculumSidebarWidth} setCurriculumSidebarWidth={setCurriculumSidebarWidth}
        showChatPane={showChatPane} setShowChatPane={setShowChatPane}
        chatPaneWidth={chatPaneWidth} setChatPaneWidth={setChatPaneWidth}
        chatMessages={chatMessages} setChatMessages={setChatMessages}
        chatInput={chatInput} setChatInput={setChatInput}
        isChatLoading={isChatLoading} setIsChatLoading={setIsChatLoading}
        voiceChat={learningVoice}
        onJumpToSlide={courseNavigation.jumpToSlide}
        onNavigateSlide={courseNavigation.navigateSlide}
        onBack={() => setView('HOME')}
      />
    );
  }

  return null;
}

export default App;
