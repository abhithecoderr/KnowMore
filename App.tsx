/**
 * KnowMore - AI Learning Platform
 * Main Application Component (Refactored - ~900 lines)
 *
 * All view components have been extracted to ./views/ folder
 */

import React, { useState, useEffect, useRef } from 'react';
import { Course, Module, Slide, ViewState, ChatMessage, CurriculumData, LearningPreferences, LearningMode, Article, ArticleSection, Presentation, PresentationSlide } from './types';
import {
  generateCurriculum,
  generateModuleContent,
  generateConsultantReply,
  generateChatResponse,
  refineCurriculum,
  adjustCurriculum,
  generateTTSForModule,
  ConsultantResult,
  LIVE_VOICE_ENABLED,
  generateArticle,
  generatePresentation,
  fetchArticleImages,
  fetchPresentationImages,
  selectImagesForModule
} from './services/geminiService';
import { Icons } from './constants';
import { useGeminiLive } from './hooks/useGeminiLive';

// Import View Components
import { HomeView } from './views/HomeView';
import { ClarificationView } from './views/ClarificationView';
import { CurriculumReviewView } from './views/CurriculumReviewView';
import { ArticleView } from './views/ArticleView';
import { PresentationView } from './views/PresentationView';
import { LearningView } from './views/LearningView';

function App() {
  // View state
  const [view, setView] = useState<ViewState>('HOME');
  const [topic, setTopic] = useState('');

  // Chat/Clarification mode
  const [isChatMode, setIsChatMode] = useState(true);
  const [clarificationMessages, setClarificationMessages] = useState<ChatMessage[]>([]);
  const [isConsulting, setIsConsulting] = useState(false);

  // Save custom instructions for future queries (default unchecked)
  const [saveCustomInstructions, setSaveCustomInstructions] = useState(false);

  // Curriculum state (new - for two-phase flow)
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [isRefiningCurriculum, setIsRefiningCurriculum] = useState(false);
  const [refinementMessages, setRefinementMessages] = useState<ChatMessage[]>([]);
  const [adjustPrompt, setAdjustPrompt] = useState('');

  // Course state
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [history, setHistory] = useState<Course[]>([]);

  // Learning mode selection
  const [learningMode, setLearningMode] = useState<LearningMode>('curriculum');

  // Article mode state
  const [article, setArticle] = useState<Article | null>(null);

  // Presentation mode state
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [activePresentationSlide, setActivePresentationSlide] = useState(0);

  // Navigation
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isGeneratingModule, setIsGeneratingModule] = useState(false);

  // On-demand image selection tracking
  const [imagesSelectedForModule, setImagesSelectedForModule] = useState<boolean[]>([]);

  // UI Panels State
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [showCurriculumSidebar, setShowCurriculumSidebar] = useState(true);
  const [showChatPane, setShowChatPane] = useState(false);
  const [curriculumSidebarWidth, setCurriculumSidebarWidth] = useState(280);
  const [chatPaneWidth, setChatPaneWidth] = useState(350);

  // Inline chat state for LEARNING view
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Voice chat for Learning View - with full slide context
  const currentSlideForVoice = course?.modules[activeModuleIndex]?.slides[activeSlideIndex];
  const slideContentForVoice = currentSlideForVoice?.blocks
    ?.filter((b: any) => ['text', 'fun_fact', 'notes_summary'].includes(b.type))
    ?.map((b: any) => {
      if (b.type === 'text') return b.content;
      if (b.type === 'fun_fact') return `Fun fact: ${b.fact}`;
      if (b.type === 'notes_summary') return b.summary || b.points?.join('. ');
      return '';
    })
    ?.join('\n\n') || '';

  const learningVoice = useGeminiLive({
    onMessage: (msg) => {
      setChatMessages(prev => [...prev, { role: msg.role, text: msg.text, timestamp: Date.now() }]);
    },
    initialContext: course ? `[CONTEXT: You are a friendly, enthusiastic AI tutor. The student is learning about "${course.topic}".

CURRENT SLIDE: "${currentSlideForVoice?.title || 'Introduction'}"

SLIDE CONTENT:
${slideContentForVoice}

YOUR TASK: Start with an engaging, brief greeting that shows excitement about what they're exploring. Something like "Oh cool, you're looking at [topic]! That's fascinating because..." - make them feel curious and engaged. Then be ready to answer any questions they have. Keep all responses conversational and brief since this is voice chat.]` : undefined
  });

  // Build conversation context for consultant voice
  const conversationContextForVoice = clarificationMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Consultant'}: ${m.text}`)
    .join('\n');

  // Voice chat for Consultant View - with exploration context and function calling
  const consultantVoice = useGeminiLive({
    onMessage: (msg) => {
      setClarificationMessages(prev => [...prev, { role: msg.role, text: msg.text, timestamp: Date.now() }]);
    },
    onGenerateCurriculum: () => {
      console.log('🎯 Curriculum generation requested via function call');
      consultantVoice.stop();
      setTimeout(() => {
        if (!isLoading && clarificationMessages.length >= 2) {
          handleGenerateFromChat();
        }
      }, 500);
    },
    initialContext: conversationContextForVoice
      ? `[CONTEXT: You are a friendly learning consultant continuing a conversation about what the user wants to learn.

CONVERSATION SO FAR:
${conversationContextForVoice}

YOUR TASK: Continue this natural conversation to help the user clarify what they want to learn. When you feel you have enough information, offer to create a personalized curriculum. If the user agrees (says yes, sure, ok, go ahead, create it, etc.), call the request_curriculum_generation function. Keep responses conversational and brief since this is voice chat.]`
      : `[CONTEXT: You are a friendly learning consultant. Start by warmly greeting the user and asking what they'd like to learn about today. Ask follow-up questions to understand:
- What topic interests them
- Their current knowledge level
- What they want to achieve

When you feel you have enough information, offer to create a personalized curriculum. ONLY call the request_curriculum_generation function when the user explicitly agrees or asks you to create it. Keep responses conversational and brief since this is voice chat.]`
  });

  // Learning preferences state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [preferences, setPreferences] = useState<LearningPreferences>({
    knowledgeLevel: 'intermediate',
    preferredDepth: 'standard',
    customInstructions: ''
  });

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('omni_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); }
      catch (e) { console.error("Failed to parse history", e); }
    }
  }, []);

  // Load preferences on mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem('omni_preferences');
    if (savedPrefs) {
      try { setPreferences(JSON.parse(savedPrefs)); }
      catch (e) { console.error("Failed to parse preferences", e); }
    }
  }, []);

  // On-demand TTS generation when switching modules
  useEffect(() => {
    if (course && view === 'LEARNING') {
      const module = course.modules[activeModuleIndex];
      if (module && module.isLoaded && !module.ttsGenerated) {
        generateModuleTTS(course, activeModuleIndex);
      }
    }
  }, [activeModuleIndex, course, view]);

  // Save preferences when changed
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

  // ============================================
  // INITIAL FLOW
  // ============================================

  const handleInitialSubmit = async () => {
    if (!topic.trim()) return;

    if (isChatMode) {
      setView('CLARIFICATION');
      const initialMsg: ChatMessage = { role: 'user', text: topic, timestamp: Date.now() };
      setClarificationMessages([initialMsg]);

      if (LIVE_VOICE_ENABLED) {
        setTimeout(() => consultantVoice.start(), 500);
      } else {
        setIsConsulting(true);
        try {
          const result = await generateConsultantReply([], topic, true);
          setClarificationMessages(prev => [...prev, { role: 'model', text: result.text, timestamp: Date.now() }]);
          if (result.shouldGenerateCurriculum) {
            await handleGenerateFromChat(result.curriculumContext);
          }
        } catch (e) { console.error(e); }
        finally { setIsConsulting(false); }
      }
      return;
    }

    // Direct mode - generate based on learning mode
    if (learningMode === 'article') {
      setIsLoading(true);
      setLoadingText('Generating article...');
      try {
        const articleData = await generateArticle(topic);
        const newArticle = { id: `article-${Date.now()}`, topic, title: articleData.title, overview: articleData.overview, sections: articleData.sections.map(s => ({ ...s, imageUrl: null })), createdAt: Date.now() };
        setArticle(newArticle);
        setView('ARTICLE');
        setIsLoading(false);
        fetchArticleImages(articleData.sections).then(imageMap => {
          setArticle(prev => prev ? { ...prev, sections: prev.sections.map(s => ({ ...s, imageUrl: imageMap[s.id] || null })) } : null);
        });
      } catch (e) { console.error('Article generation error:', e); setIsLoading(false); }
    } else if (learningMode === 'presentation') {
      setIsLoading(true);
      setLoadingText('Creating presentation...');
      try {
        const presData = await generatePresentation(topic);
        const newPresentation = { id: `pres-${Date.now()}`, topic, title: presData.title, totalSlides: presData.totalSlides || presData.slides.length, slides: presData.slides.map(s => ({ ...s, imageUrls: [] })), createdAt: Date.now() };
        setPresentation(newPresentation);
        setActivePresentationSlide(0);
        setView('PRESENTATION');
        setIsLoading(false);
        fetchPresentationImages(presData.slides).then(imageMap => {
          setPresentation(prev => prev ? { ...prev, slides: prev.slides.map(s => ({ ...s, imageUrls: imageMap[s.id] || [] })) } : null);
        });
      } catch (e) { console.error('Presentation generation error:', e); setIsLoading(false); }
    } else {
      await handleGenerateCurriculumOnly(topic, "", true);
    }
  };

  const handleClarificationSend = async (text: string) => {
    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    setClarificationMessages(prev => [...prev, userMsg]);
    setIsConsulting(true);

    try {
      const apiHistory = clarificationMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const result = await generateConsultantReply(apiHistory, text, false);
      setClarificationMessages(prev => [...prev, { role: 'model', text: result.text, timestamp: Date.now() }]);
      if (result.shouldGenerateCurriculum) {
        setIsConsulting(false);
        await handleGenerateFromChat(result.curriculumContext);
      }
    } catch (e) { console.error(e); }
    finally { setIsConsulting(false); }
  };

  // ============================================
  // CURRICULUM GENERATION
  // ============================================

  const handleGenerateCurriculumOnly = async (topicStr: string, context: string, usePreferences = false) => {
    setIsLoading(true);
    setLoadingText('Designing your learning path...');

    try {
      const curriculumData = await generateCurriculum(topicStr, context, usePreferences ? preferences : undefined);
      setCurriculum(curriculumData);
      setRefinementMessages([]);
      setView('CURRICULUM_REVIEW');
      if (!saveCustomInstructions) { updatePreferences({ customInstructions: '' }); }
    } catch (error) {
      console.error(error);
      alert("Failed to generate curriculum. Please try again.");
    } finally { setIsLoading(false); }
  };

  const handleGenerateFromChat = async (context?: { topic: string; interests?: string[]; knowledgeLevel?: string; goals?: string }) => {
    consultantVoice.stop();
    let contextStr = clarificationMessages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

    if (context) {
      const structuredContext = [ `TOPIC: ${context.topic || topic}`, context.interests?.length ? `INTERESTS: ${context.interests.join(', ')}` : '', context.knowledgeLevel ? `LEVEL: ${context.knowledgeLevel}` : '', context.goals ? `GOALS: ${context.goals}` : '' ].filter(Boolean).join('\n');
      contextStr = structuredContext + '\n\n--- CONVERSATION ---\n' + contextStr;
    }

    const topicToUse = context?.topic || topic;

    if (learningMode === 'article') {
      setIsLoading(true);
      setLoadingText('Generating article...');
      try {
        const articleData = await generateArticle(topicToUse, contextStr);
        setArticle({ id: `article-${Date.now()}`, topic: topicToUse, title: articleData.title, overview: articleData.overview, sections: articleData.sections.map(s => ({ ...s, imageUrl: null })), createdAt: Date.now() });
        setView('ARTICLE'); setIsLoading(false);
        fetchArticleImages(articleData.sections).then(imageMap => { setArticle(prev => prev ? { ...prev, sections: prev.sections.map(s => ({ ...s, imageUrl: imageMap[s.id] || null })) } : null); });
      } catch (e) { console.error('Article generation error:', e); setIsLoading(false); }
    } else if (learningMode === 'presentation') {
      setIsLoading(true);
      setLoadingText('Creating presentation...');
      try {
        const presData = await generatePresentation(topicToUse, contextStr);
        setPresentation({ id: `pres-${Date.now()}`, topic: topicToUse, title: presData.title, totalSlides: presData.totalSlides || presData.slides.length, slides: presData.slides.map(s => ({ ...s, imageUrls: [] })), createdAt: Date.now() });
        setActivePresentationSlide(0); setView('PRESENTATION'); setIsLoading(false);
        fetchPresentationImages(presData.slides).then(imageMap => { setPresentation(prev => prev ? { ...prev, slides: prev.slides.map(s => ({ ...s, imageUrls: imageMap[s.id] || [] })) } : null); });
      } catch (e) { console.error('Presentation generation error:', e); setIsLoading(false); }
    } else {
      await handleGenerateCurriculumOnly(topicToUse, contextStr);
    }
  };

  // ============================================
  // CURRICULUM REFINEMENT
  // ============================================

  const handleRefinementSend = async (text: string) => {
    if (!curriculum) return;
    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    setRefinementMessages(prev => [...prev, userMsg]);
    setIsRefiningCurriculum(true);

    try {
      const result = await refineCurriculum(curriculum, text);
      setCurriculum(result.curriculum);
      setRefinementMessages(prev => [...prev, { role: 'model', text: result.response, timestamp: Date.now() }]);
    } catch (e) {
      console.error(e);
      setRefinementMessages(prev => [...prev, { role: 'model', text: "Sorry, I had trouble making those changes. Please try again.", timestamp: Date.now() }]);
    }
    finally { setIsRefiningCurriculum(false); }
  };

  const handleAdjustCurriculum = async () => {
    if (!curriculum || !adjustPrompt.trim()) return;
    setIsRefiningCurriculum(true);

    try {
      const adjusted = await adjustCurriculum(curriculum, adjustPrompt);
      setCurriculum(adjusted);
      setAdjustPrompt('');
    } catch (e) {
      console.error(e);
      alert("Failed to adjust curriculum. Please try again.");
    }
    finally { setIsRefiningCurriculum(false); }
  };

  // ============================================
  // TTS GENERATION
  // ============================================

  const generateModuleTTS = async (courseData: Course, moduleIndex: number) => {
    const module = courseData.modules[moduleIndex];
    if (!module || module.ttsGenerated || !module.isLoaded) return;

    try {
      const audioUrls = await generateTTSForModule(module.slides);
      setCourse(prevCourse => {
        if (!prevCourse) return prevCourse;
        const updatedModules = prevCourse.modules.map((m, idx) => {
          if (idx !== moduleIndex) return m;
          const updatedSlides = m.slides.map((slide, sIdx) => ({ ...slide, audioUrl: audioUrls[sIdx] || undefined }));
          return { ...m, slides: updatedSlides, ttsGenerated: true };
        });
        return { ...prevCourse, modules: updatedModules };
      });
    } catch (error) { console.error(`TTS generation failed for module ${moduleIndex}:`, error); }
  };

  // ============================================
  // CONTENT GENERATION
  // ============================================

  const handleGenerateExperience = async () => {
    if (!curriculum) return;
    setIsLoading(true);
    setLoadingText('Generating your learning experience...');

    try {
      const newCourse: Course = {
        id: crypto.randomUUID(), topic: topic, title: curriculum.title, description: curriculum.description,
        modules: curriculum.modules.map(m => ({ id: m.id, title: m.title, description: m.description, slides: m.slides.map(s => ({ id: s.id, title: s.title, blocks: [] })), isLoaded: false })),
        createdAt: Date.now(), lastAccessed: Date.now()
      };

      setCourse(newCourse);
      setLoadingText('Generating first module...');

      const module1 = newCourse.modules[0];
      const module1Content = await generateModuleContent(newCourse.title, module1.title, module1.description, module1.slides.map(s => s.title), "", undefined, true);

      const updatedCourse: Course = { ...newCourse, modules: newCourse.modules.map((m, idx) => idx === 0 ? { ...m, slides: module1Content.slides as unknown as Slide[], isLoaded: true } : m) };

      setCourse(updatedCourse);
      saveToHistory(updatedCourse);
      setActiveModuleIndex(0);
      setActiveSlideIndex(0);

      const initialImageTracking = new Array(updatedCourse.modules.length).fill(false);
      initialImageTracking[0] = true;
      setImagesSelectedForModule(initialImageTracking);

      setView('LEARNING');
      setIsLoading(false);

      const handleModule1ImageReady = (slideIdx: number, blockIdx: number, imageUrl: string) => {
        setCourse(prevCourse => {
          if (!prevCourse) return prevCourse;
          const updatedModules = prevCourse.modules.map((mod, modIdx) => {
            if (modIdx !== 0) return mod;
            const updatedSlides = mod.slides.map((slide, sIdx) => {
              if (sIdx !== slideIdx) return slide;
              const updatedBlocks = slide.blocks.map((block, bIdx) => {
                if (bIdx !== blockIdx || block.type !== 'image') return block;
                return { ...block, imageUrl };
              });
              return { ...slide, blocks: updatedBlocks };
            });
            return { ...mod, slides: updatedSlides };
          });
          return { ...prevCourse, modules: updatedModules };
        });
      };

      selectImagesForModule(module1Content.slides as any, handleModule1ImageReady);
      generateRemainingModules(updatedCourse, 1);
      generateModuleTTS(updatedCourse, 0);

    } catch (error) {
      console.error(error);
      alert("Failed to generate course content. Please try again.");
      setIsLoading(false);
    }
  };

  const generateRemainingModules = async (currentCourse: Course, startIndex: number) => {
    let updatedCourse = currentCourse;

    for (let i = startIndex; i < currentCourse.modules.length; i++) {
      const module = currentCourse.modules[i];
      if (module.isLoaded) continue;

      const previousContext = currentCourse.modules.slice(0, i).map(m => `Module "${m.title}": ${m.slides.map(s => s.title).join(', ')}`).join('\n');

      try {
        if (i > startIndex) { await new Promise(r => setTimeout(r, 5000)); }

        const moduleContent = await generateModuleContent(currentCourse.title, module.title, module.description, module.slides.map(s => s.title), previousContext, undefined, true);

        setCourse(prevCourse => {
          if (!prevCourse) return prevCourse;
          const currentSlides = prevCourse.modules[i]?.slides || [];
          const mergedSlides = moduleContent.slides.map((newSlide, sIdx) => {
            const currentSlide = currentSlides[sIdx];
            if (!currentSlide) return newSlide;
            const mergedBlocks = newSlide.blocks.map((newBlock, bIdx) => {
              const currentBlock = currentSlide.blocks?.[bIdx];
              if (newBlock.type === 'image' && currentBlock?.type === 'image') { return currentBlock.imageUrl ? currentBlock : newBlock; }
              return newBlock;
            });
            return { ...newSlide, blocks: mergedBlocks };
          });
          return { ...prevCourse, modules: prevCourse.modules.map((m, idx) => idx === i ? { ...m, slides: mergedSlides as unknown as Slide[], isLoaded: true } : m) };
        });

        updatedCourse = { ...updatedCourse, modules: updatedCourse.modules.map((m, idx) => idx === i ? { ...m, slides: moduleContent.slides as unknown as Slide[], isLoaded: true } : m) };
        saveToHistory(updatedCourse);
      } catch (error) { console.error(`Failed to generate module ${i + 1}:`, error); }
    }
  };

  // ============================================
  // NAVIGATION
  // ============================================

  const loadModuleIfNeeded = async (moduleIndex: number) => {
    if (!course) return;
    const module = course.modules[moduleIndex];

    if (!module.isLoaded) {
      setIsGeneratingModule(true);
      const previousContext = course.modules.slice(0, moduleIndex).filter(m => m.isLoaded).map(m => `Module "${m.title}": ${m.slides.map(s => s.title).join(', ')}`).join('\n');

      try {
        const moduleContent = await generateModuleContent(course.title, module.title, module.description, module.slides.map(s => s.title), previousContext, undefined, true);
        const updatedCourse: Course = { ...course, modules: course.modules.map((m, idx) => idx === moduleIndex ? { ...m, slides: moduleContent.slides, isLoaded: true } : m) };
        setCourse(updatedCourse);
        saveToHistory(updatedCourse);
      } catch (error) {
        console.error("Failed to load module:", error);
        alert("Failed to load module content.");
      } finally { setIsGeneratingModule(false); }
    }
  };

  const navigateSlide = async (direction: 'next' | 'prev') => {
    if (!course) return;
    let newMod = activeModuleIndex;
    let newSlide = activeSlideIndex;
    const currentModule = course.modules[newMod];

    if (direction === 'next') {
      if (newSlide < currentModule.slides.length - 1) { newSlide++; }
      else if (newMod < course.modules.length - 1) { newMod++; newSlide = 0; await loadModuleIfNeeded(newMod); }
      else { return; }
    } else {
      if (newSlide > 0) { newSlide--; }
      else if (newMod > 0) { newMod--; newSlide = course.modules[newMod].slides.length - 1; }
      else { return; }
    }

    setActiveModuleIndex(newMod);
    setActiveSlideIndex(newSlide);
    if (newMod !== activeModuleIndex) { triggerImageSelectionForModule(newMod); }
  };

  const triggerImageSelectionForModule = async (moduleIndex: number) => {
    if (!course) return;
    if (imagesSelectedForModule[moduleIndex]) return;

    const module = course.modules[moduleIndex];
    if (!module || !module.isLoaded) return;

    setImagesSelectedForModule(prev => { const updated = [...prev]; updated[moduleIndex] = true; return updated; });

    const handleImageReady = (slideIdx: number, blockIdx: number, imageUrl: string) => {
      setCourse(prevCourse => {
        if (!prevCourse) return prevCourse;
        const updatedModules = prevCourse.modules.map((mod, modIdx) => {
          if (modIdx !== moduleIndex) return mod;
          const updatedSlides = mod.slides.map((slide, sIdx) => {
            if (sIdx !== slideIdx) return slide;
            const updatedBlocks = slide.blocks.map((block, bIdx) => {
              if (bIdx !== blockIdx || block.type !== 'image') return block;
              return { ...block, imageUrl };
            });
            return { ...slide, blocks: updatedBlocks };
          });
          return { ...mod, slides: updatedSlides };
        });
        return { ...prevCourse, modules: updatedModules };
      });
    };

    await selectImagesForModule(module.slides as any, handleImageReady);
  };

  const jumpToSlide = async (modIdx: number, slideIdx: number) => {
    await loadModuleIfNeeded(modIdx);
    setActiveModuleIndex(modIdx);
    setActiveSlideIndex(slideIdx);
    triggerImageSelectionForModule(modIdx);
  };

  const loadFromHistory = (item: Course) => {
    setCourse(item);
    setActiveModuleIndex(0);
    setActiveSlideIndex(0);
    const hasContent = item.modules.some(m => m.isLoaded);
    setView(hasContent ? 'LEARNING' : 'PLANNER');
  };

  // ============================================
  // VIEWS
  // ============================================

  // HOME VIEW
  if (view === 'HOME') {
    const deleteFromHistory = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newHistory = history.filter(h => h.id !== id);
      setHistory(newHistory);
      localStorage.setItem('omni_history', JSON.stringify(newHistory));
    };

    return (
      <HomeView
        topic={topic}
        setTopic={setTopic}
        isChatMode={isChatMode}
        setIsChatMode={setIsChatMode}
        learningMode={learningMode}
        setLearningMode={setLearningMode}
        isLoading={isLoading}
        loadingText={loadingText}
        history={history}
        preferences={preferences}
        updatePreferences={updatePreferences}
        saveCustomInstructions={saveCustomInstructions}
        setSaveCustomInstructions={setSaveCustomInstructions}
        showHistorySidebar={showHistorySidebar}
        setShowHistorySidebar={setShowHistorySidebar}
        showSettingsModal={showSettingsModal}
        setShowSettingsModal={setShowSettingsModal}
        onSubmit={handleInitialSubmit}
        onLoadFromHistory={loadFromHistory}
        onDeleteFromHistory={deleteFromHistory}
        onSelectCuratedTopic={(curriculum) => { setCurriculum(curriculum); setRefinementMessages([]); setView('CURRICULUM_REVIEW'); }}
      />
    );
  }

  // CLARIFICATION VIEW
  if (view === 'CLARIFICATION') {
    return (
      <ClarificationView
        messages={clarificationMessages}
        isConsulting={isConsulting}
        isLoading={isLoading}
        voiceChat={consultantVoice}
        onBack={() => setView('HOME')}
        onSend={handleClarificationSend}
        onGenerateCurriculum={() => handleGenerateFromChat()}
      />
    );
  }

  // CURRICULUM_REVIEW VIEW
  if (view === 'CURRICULUM_REVIEW' && curriculum) {
    return (
      <CurriculumReviewView
        curriculum={curriculum}
        refinementMessages={refinementMessages}
        adjustPrompt={adjustPrompt}
        setAdjustPrompt={setAdjustPrompt}
        isChatMode={isChatMode}
        isRefiningCurriculum={isRefiningCurriculum}
        isLoading={isLoading}
        loadingText={loadingText}
        onBack={() => setView('HOME')}
        onGenerateExperience={handleGenerateExperience}
        onRefinementSend={handleRefinementSend}
        onAdjustCurriculum={handleAdjustCurriculum}
      />
    );
  }

  // ARTICLE VIEW
  if (view === 'ARTICLE' && article) {
    return (
      <ArticleView
        article={article}
        chatMessages={chatMessages}
        setChatMessages={setChatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        isChatLoading={isChatLoading}
        setIsChatLoading={setIsChatLoading}
        showChatPane={showChatPane}
        setShowChatPane={setShowChatPane}
        onBack={() => { setView('HOME'); setArticle(null); }}
      />
    );
  }

  // PRESENTATION VIEW
  if (view === 'PRESENTATION' && presentation) {
    return (
      <PresentationView
        presentation={presentation}
        activePresentationSlide={activePresentationSlide}
        setActivePresentationSlide={setActivePresentationSlide}
        chatMessages={chatMessages}
        showChatPane={showChatPane}
        setShowChatPane={setShowChatPane}
        voiceChat={learningVoice}
        onBack={() => { setView('HOME'); setPresentation(null); }}
      />
    );
  }

  // LEARNING VIEW
  if (view === 'LEARNING' && course) {
    return (
      <LearningView
        course={course}
        activeModuleIndex={activeModuleIndex}
        activeSlideIndex={activeSlideIndex}
        isGeneratingModule={isGeneratingModule}
        showCurriculumSidebar={showCurriculumSidebar}
        setShowCurriculumSidebar={setShowCurriculumSidebar}
        curriculumSidebarWidth={curriculumSidebarWidth}
        setCurriculumSidebarWidth={setCurriculumSidebarWidth}
        showChatPane={showChatPane}
        setShowChatPane={setShowChatPane}
        chatPaneWidth={chatPaneWidth}
        setChatPaneWidth={setChatPaneWidth}
        chatMessages={chatMessages}
        setChatMessages={setChatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        isChatLoading={isChatLoading}
        setIsChatLoading={setIsChatLoading}
        voiceChat={learningVoice}
        onJumpToSlide={jumpToSlide}
        onNavigateSlide={navigateSlide}
        onBack={() => setView('HOME')}
      />
    );
  }

  return null;
}

export default App;
