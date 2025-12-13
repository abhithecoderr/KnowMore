/**
 * KnowMore - Course Context
 * Provides shared state management for course data, navigation, and preferences
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Course, CurriculumData, ChatMessage, LearningPreferences, LearningMode, Article, Presentation, ViewState } from '../types';

// ============================================
// TYPES
// ============================================

export interface CourseContextValue {
  // View state
  view: ViewState;
  setView: (view: ViewState) => void;
  topic: string;
  setTopic: (topic: string) => void;

  // Chat/Clarification
  isChatMode: boolean;
  setIsChatMode: (v: boolean) => void;
  clarificationMessages: ChatMessage[];
  setClarificationMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isConsulting: boolean;
  setIsConsulting: (v: boolean) => void;

  // Curriculum state
  curriculum: CurriculumData | null;
  setCurriculum: (c: CurriculumData | null) => void;
  isRefiningCurriculum: boolean;
  setIsRefiningCurriculum: (v: boolean) => void;
  refinementMessages: ChatMessage[];
  setRefinementMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  adjustPrompt: string;
  setAdjustPrompt: (s: string) => void;

  // Course state
  course: Course | null;
  setCourse: (c: Course | null) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  loadingText: string;
  setLoadingText: (s: string) => void;
  history: Course[];
  setHistory: React.Dispatch<React.SetStateAction<Course[]>>;

  // Learning mode
  learningMode: LearningMode;
  setLearningMode: (m: LearningMode) => void;

  // Article/Presentation
  article: Article | null;
  setArticle: (a: Article | null) => void;
  presentation: Presentation | null;
  setPresentation: (p: Presentation | null) => void;
  activePresentationSlide: number;
  setActivePresentationSlide: (n: number) => void;

  // Navigation
  activeModuleIndex: number;
  setActiveModuleIndex: (n: number) => void;
  activeSlideIndex: number;
  setActiveSlideIndex: (n: number) => void;
  isGeneratingModule: boolean;
  setIsGeneratingModule: (v: boolean) => void;

  // On-demand image tracking
  imagesSelectedForModule: boolean[];
  setImagesSelectedForModule: React.Dispatch<React.SetStateAction<boolean[]>>;

  // UI Panels
  showHistorySidebar: boolean;
  setShowHistorySidebar: (v: boolean) => void;
  showCurriculumSidebar: boolean;
  setShowCurriculumSidebar: (v: boolean) => void;
  showChatPane: boolean;
  setShowChatPane: (v: boolean) => void;
  curriculumSidebarWidth: number;
  setCurriculumSidebarWidth: (n: number) => void;
  chatPaneWidth: number;
  setChatPaneWidth: (n: number) => void;

  // Inline chat for LEARNING view
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  chatInput: string;
  setChatInput: (s: string) => void;
  isChatLoading: boolean;
  setIsChatLoading: (v: boolean) => void;

  // Preferences
  preferences: LearningPreferences;
  updatePreferences: (prefs: Partial<LearningPreferences>) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (v: boolean) => void;
  saveCustomInstructions: boolean;
  setSaveCustomInstructions: (v: boolean) => void;

  // History management
  saveToHistory: (c: Course) => void;
  loadFromHistory: (c: Course) => void;
  deleteFromHistory: (id: string) => void;

  // Navigation helpers
  navigateSlide: (direction: 'next' | 'prev') => void;
  jumpToSlide: (moduleIdx: number, slideIdx: number) => void;
}

const CourseContext = createContext<CourseContextValue | null>(null);

// ============================================
// PROVIDER
// ============================================

interface CourseProviderProps {
  children: ReactNode;
}

export function CourseProvider({ children }: CourseProviderProps) {
  // View state
  const [view, setView] = useState<ViewState>('HOME');
  const [topic, setTopic] = useState('');

  // Chat/Clarification
  const [isChatMode, setIsChatMode] = useState(true);
  const [clarificationMessages, setClarificationMessages] = useState<ChatMessage[]>([]);
  const [isConsulting, setIsConsulting] = useState(false);
  const [saveCustomInstructions, setSaveCustomInstructions] = useState(false);

  // Curriculum state
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [isRefiningCurriculum, setIsRefiningCurriculum] = useState(false);
  const [refinementMessages, setRefinementMessages] = useState<ChatMessage[]>([]);
  const [adjustPrompt, setAdjustPrompt] = useState('');

  // Course state
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [history, setHistory] = useState<Course[]>([]);

  // Learning mode
  const [learningMode, setLearningMode] = useState<LearningMode>('curriculum');

  // Article/Presentation
  const [article, setArticle] = useState<Article | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [activePresentationSlide, setActivePresentationSlide] = useState(0);

  // Navigation
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isGeneratingModule, setIsGeneratingModule] = useState(false);
  const [imagesSelectedForModule, setImagesSelectedForModule] = useState<boolean[]>([]);

  // UI Panels
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [showCurriculumSidebar, setShowCurriculumSidebar] = useState(true);
  const [showChatPane, setShowChatPane] = useState(false);
  const [curriculumSidebarWidth, setCurriculumSidebarWidth] = useState(280);
  const [chatPaneWidth, setChatPaneWidth] = useState(350);

  // Inline chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Preferences
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [preferences, setPreferences] = useState<LearningPreferences>({
    knowledgeLevel: 'intermediate',
    preferredDepth: 'standard',
    customInstructions: ''
  });

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('omni_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); }
      catch (e) { console.error("Failed to parse history", e); }
    }
  }, []);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem('omni_preferences');
    if (savedPrefs) {
      try { setPreferences(JSON.parse(savedPrefs)); }
      catch (e) { console.error("Failed to parse preferences", e); }
    }
  }, []);

  // Update preferences and save to localStorage
  const updatePreferences = useCallback((newPrefs: Partial<LearningPreferences>) => {
    setPreferences(prev => {
      const updated = { ...prev, ...newPrefs };
      localStorage.setItem('omni_preferences', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Save course to history
  const saveToHistory = useCallback((c: Course) => {
    setHistory(prev => {
      const newHistory = [c, ...prev.filter(h => h.id !== c.id)].slice(0, 10);
      localStorage.setItem('omni_history', JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  // Load course from history
  const loadFromHistory = useCallback((item: Course) => {
    setCourse(item);
    setActiveModuleIndex(0);
    setActiveSlideIndex(0);
    setView('LEARNING');
  }, []);

  // Delete from history
  const deleteFromHistory = useCallback((id: string) => {
    setHistory(prev => {
      const newHistory = prev.filter(h => h.id !== id);
      localStorage.setItem('omni_history', JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  // Navigate between slides
  const navigateSlide = useCallback((direction: 'next' | 'prev') => {
    if (!course) return;

    const currentModule = course.modules[activeModuleIndex];
    if (!currentModule) return;

    if (direction === 'next') {
      if (activeSlideIndex < currentModule.slides.length - 1) {
        setActiveSlideIndex(activeSlideIndex + 1);
      } else if (activeModuleIndex < course.modules.length - 1) {
        setActiveModuleIndex(activeModuleIndex + 1);
        setActiveSlideIndex(0);
      }
    } else {
      if (activeSlideIndex > 0) {
        setActiveSlideIndex(activeSlideIndex - 1);
      } else if (activeModuleIndex > 0) {
        const prevModule = course.modules[activeModuleIndex - 1];
        setActiveModuleIndex(activeModuleIndex - 1);
        setActiveSlideIndex(prevModule.slides.length - 1);
      }
    }
  }, [course, activeModuleIndex, activeSlideIndex]);

  // Jump to specific slide
  const jumpToSlide = useCallback((moduleIdx: number, slideIdx: number) => {
    setActiveModuleIndex(moduleIdx);
    setActiveSlideIndex(slideIdx);
  }, []);

  const value: CourseContextValue = {
    // View
    view, setView,
    topic, setTopic,

    // Chat
    isChatMode, setIsChatMode,
    clarificationMessages, setClarificationMessages,
    isConsulting, setIsConsulting,

    // Curriculum
    curriculum, setCurriculum,
    isRefiningCurriculum, setIsRefiningCurriculum,
    refinementMessages, setRefinementMessages,
    adjustPrompt, setAdjustPrompt,

    // Course
    course, setCourse,
    isLoading, setIsLoading,
    loadingText, setLoadingText,
    history, setHistory,

    // Mode
    learningMode, setLearningMode,

    // Article/Presentation
    article, setArticle,
    presentation, setPresentation,
    activePresentationSlide, setActivePresentationSlide,

    // Navigation
    activeModuleIndex, setActiveModuleIndex,
    activeSlideIndex, setActiveSlideIndex,
    isGeneratingModule, setIsGeneratingModule,
    imagesSelectedForModule, setImagesSelectedForModule,

    // UI
    showHistorySidebar, setShowHistorySidebar,
    showCurriculumSidebar, setShowCurriculumSidebar,
    showChatPane, setShowChatPane,
    curriculumSidebarWidth, setCurriculumSidebarWidth,
    chatPaneWidth, setChatPaneWidth,

    // Chat
    chatMessages, setChatMessages,
    chatInput, setChatInput,
    isChatLoading, setIsChatLoading,

    // Preferences
    preferences, updatePreferences,
    showSettingsModal, setShowSettingsModal,
    saveCustomInstructions, setSaveCustomInstructions,

    // Actions
    saveToHistory,
    loadFromHistory,
    deleteFromHistory,
    navigateSlide,
    jumpToSlide,
  };

  return (
    <CourseContext.Provider value={value}>
      {children}
    </CourseContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useCourse(): CourseContextValue {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error('useCourse must be used within a CourseProvider');
  }
  return context;
}

export default CourseContext;
