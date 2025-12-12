import React, { useState, useEffect, useRef } from 'react';
import { Course, Module, Slide, ViewState, ChatMessage, CurriculumData, LearningPreferences } from './types';
import {
  generateCurriculum,
  generateModuleContent,
  generateConsultantReply,
  generateChatResponse,
  refineCurriculum,
  adjustCurriculum,
  generateTTSForModule,
  ConsultantResult
} from './services/geminiService';
import { Icons } from './constants';
import { SlideView } from './components/SlideView';
import { ChatWidget } from './components/ChatWidget';
import ScrollingBackground from './components/ScrollingBackground';
import { CURATED_TOPICS, CuratedTopic } from './data/curatedTopics';

// Curated Topic Card Component with Wikimedia API image loading
const CuratedTopicCard: React.FC<{ topic: CuratedTopic; onClick: () => void }> = ({ topic, onClick }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
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
          const info = pages[0]?.imageinfo?.[0];
          if (info?.thumburl || info?.url) {
            setImageUrl(info.thumburl || info.url);
          }
        }
      } catch {
        // Use placeholder on error
      }
    };

    fetchImage();
  }, [topic.imageKeyword]);

  const placeholderUrl = `https://placehold.co/400x300/27272a/71717a?text=${encodeURIComponent(topic.title.slice(0, 15))}`;

  return (
    <button
      onClick={onClick}
      className="group text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
    >
      <div className="aspect-[4/3] relative overflow-hidden bg-zinc-800">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={topic.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            onError={(e) => { (e.target as HTMLImageElement).src = placeholderUrl; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      </div>
      <div className="p-5">
        <h4 className="font-bold text-white text-base mb-2 group-hover:text-amber-400 transition-colors">{topic.title}</h4>
        <p className="text-zinc-500 text-sm leading-relaxed">{topic.tagline}</p>
      </div>
    </button>
  );
};

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

  // Navigation
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isGeneratingModule, setIsGeneratingModule] = useState(false);

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
  const chatEndRef = useRef<HTMLDivElement>(null);

  const clarificationEndRef = useRef<HTMLDivElement>(null);
  const refinementEndRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

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

  // Scroll to top when view, module, or slide changes
  useEffect(() => {
    // Scroll both window and content container to top
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [view, activeModuleIndex, activeSlideIndex]);

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

  // Auto-scroll clarification chat
  useEffect(() => {
    if (view === 'CLARIFICATION') {
      clarificationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [clarificationMessages, view]);

  // Auto-scroll refinement chat
  useEffect(() => {
    if (view === 'CURRICULUM_REVIEW') {
      refinementEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [refinementMessages, view]);

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
      // Chat mode: Start consultation
      setView('CLARIFICATION');
      const initialMsg: ChatMessage = { role: 'user', text: topic, timestamp: Date.now() };
      setClarificationMessages([initialMsg]);
      setIsConsulting(true);

      try {
        // Note: Not using streaming for JSON responses - would show raw JSON
        const result = await generateConsultantReply([], topic, true);

        // Add AI response
        setClarificationMessages(prev => [...prev, {
          role: 'model',
          text: result.text,
          timestamp: Date.now()
        }]);

        if (result.shouldGenerateCurriculum) {
          await handleGenerateFromChat(result.curriculumContext);
        }
      } catch (e) { console.error(e); }
      finally { setIsConsulting(false); }
    } else {
      // Direct mode: Generate curriculum immediately with user preferences
      await handleGenerateCurriculumOnly(topic, "", true);
    }
  };

  const handleClarificationSend = async (text: string) => {
    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    setClarificationMessages(prev => [...prev, userMsg]);
    setIsConsulting(true);

    try {
      const apiHistory = clarificationMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      // Note: Not using streaming for JSON responses
      const result = await generateConsultantReply(apiHistory, text, false);

      // Add AI response
      setClarificationMessages(prev => [...prev, {
        role: 'model',
        text: result.text,
        timestamp: Date.now()
      }]);

      // If AI confirms we should generate, do it now
      if (result.shouldGenerateCurriculum) {
        setIsConsulting(false);
        await handleGenerateFromChat(result.curriculumContext);
      }
    } catch (e) { console.error(e); }
    finally { setIsConsulting(false); }
  };

  // ============================================
  // CURRICULUM GENERATION (Phase 1 - Structure Only)
  // ============================================

  const handleGenerateCurriculumOnly = async (topicStr: string, context: string, usePreferences = false) => {
    setIsLoading(true);
    setLoadingText('Designing your learning path...');

    try {
      // Pass preferences only when using Quick Generate mode (not chat mode)
      const curriculumData = await generateCurriculum(
        topicStr,
        context,
        usePreferences ? preferences : undefined
      );
      setCurriculum(curriculumData);
      setRefinementMessages([]);
      setView('CURRICULUM_REVIEW');

      // Clear custom instructions after generation if not saving
      if (!saveCustomInstructions) {
        updatePreferences({ customInstructions: '' });
      }
    } catch (error) {
      console.error(error);
      alert("Failed to generate curriculum. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateFromChat = async (context?: { topic: string; interests?: string[]; knowledgeLevel?: string; goals?: string }) => {
    // Build context string from consultant's extracted info + conversation
    let contextStr = clarificationMessages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

    if (context) {
      const structuredContext = [
        `TOPIC: ${context.topic || topic}`,
        context.interests?.length ? `INTERESTS: ${context.interests.join(', ')}` : '',
        context.knowledgeLevel ? `LEVEL: ${context.knowledgeLevel}` : '',
        context.goals ? `GOALS: ${context.goals}` : ''
      ].filter(Boolean).join('\n');

      contextStr = structuredContext + '\n\n--- CONVERSATION ---\n' + contextStr;
    }

    await handleGenerateCurriculumOnly(context?.topic || topic, contextStr);
  };

  // ============================================
  // CURRICULUM REFINEMENT (Chat Mode)
  // ============================================

  const handleRefinementSend = async (text: string) => {
    if (!curriculum) return;

    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    setRefinementMessages(prev => [...prev, userMsg]);
    setIsRefiningCurriculum(true);

    try {
      const result = await refineCurriculum(curriculum, text);
      setCurriculum(result.curriculum);
      setRefinementMessages(prev => [...prev, {
        role: 'model',
        text: result.response,
        timestamp: Date.now()
      }]);
    } catch (e) {
      console.error(e);
      setRefinementMessages(prev => [...prev, {
        role: 'model',
        text: "Sorry, I had trouble making those changes. Please try again.",
        timestamp: Date.now()
      }]);
    }
    finally { setIsRefiningCurriculum(false); }
  };

  // ============================================
  // CURRICULUM ADJUSTMENT (Direct Mode)
  // ============================================

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
  // TTS GENERATION (Background Audio)
  // ============================================

  const generateModuleTTS = async (courseData: Course, moduleIndex: number) => {
    const module = courseData.modules[moduleIndex];
    if (!module || module.ttsGenerated || !module.isLoaded) return;

    console.log(`🔊 Starting TTS generation for Module ${moduleIndex + 1}: ${module.title}`);

    try {
      const audioUrls = await generateTTSForModule(module.slides);

      // Update course with audio URLs
      setCourse(prevCourse => {
        if (!prevCourse) return prevCourse;

        const updatedModules = prevCourse.modules.map((m, idx) => {
          if (idx !== moduleIndex) return m;

          const updatedSlides = m.slides.map((slide, sIdx) => ({
            ...slide,
            audioUrl: audioUrls[sIdx] || undefined
          }));

          return { ...m, slides: updatedSlides, ttsGenerated: true };
        });

        return { ...prevCourse, modules: updatedModules };
      });

    } catch (error) {
      console.error(`TTS generation failed for module ${moduleIndex}:`, error);
    }
  };

  // ============================================
  // CONTENT GENERATION (Phase 2 - Full Course)
  // ============================================

  const handleGenerateExperience = async () => {
    if (!curriculum) return;

    setIsLoading(true);
    setLoadingText('Generating your learning experience...');

    try {
      // Create course structure from curriculum
      const newCourse: Course = {
        id: crypto.randomUUID(),
        topic: topic,
        title: curriculum.title,
        description: curriculum.description,
        modules: curriculum.modules.map(m => ({
          id: m.id,
          title: m.title,
          description: m.description,
          slides: m.slides.map(s => ({ id: s.id, title: s.title, blocks: [] })),
          isLoaded: false
        })),
        createdAt: Date.now(),
        lastAccessed: Date.now()
      };

      setCourse(newCourse);
      setLoadingText('Generating first module...');

      // Create a ref to track the current course state for callbacks
      let currentCourse = newCourse;

      // Callback to update image in course state when ready
      // IMPORTANT: Capture MODULE_INDEX (0) in closure to prevent affecting other modules
      const MODULE_INDEX = 0;
      const handleImageReady = (slideIdx: number, blockIdx: number, imageUrl: string) => {
        setCourse(prevCourse => {
          if (!prevCourse) return prevCourse;

          // Update the specific image block ONLY in this module
          const updatedModules = prevCourse.modules.map((mod, modIdx) => {
            if (modIdx !== MODULE_INDEX) return mod; // Don't touch other modules

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

          const updated = { ...prevCourse, modules: updatedModules };
          currentCourse = updated;

          // Save updated course to history to persist image URLs
          const newHistory = [updated, ...history.filter(h => h.id !== updated.id)].slice(0, 10);
          localStorage.setItem('omni_history', JSON.stringify(newHistory));

          return updated;
        });
      };

      // Generate Module 1 content with progressive image loading
      const module1 = newCourse.modules[0];
      const module1Content = await generateModuleContent(
        newCourse.title,
        module1.title,
        module1.description,
        module1.slides.map(s => s.title),
        "",
        handleImageReady // Pass callback for progressive loading
      );

      // Update course with Module 1 content (images will be null initially, loaded progressively)
      const updatedCourse: Course = {
        ...newCourse,
        modules: newCourse.modules.map((m, idx) =>
          idx === 0
            ? { ...m, slides: module1Content.slides as unknown as Slide[], isLoaded: true }
            : m
        )
      };

      currentCourse = updatedCourse;
      setCourse(updatedCourse);
      saveToHistory(updatedCourse);
      setActiveModuleIndex(0);
      setActiveSlideIndex(0);

      // Switch to LEARNING view immediately - images will load progressively
      setView('LEARNING');
      setIsLoading(false);

      // Generate remaining modules in background
      generateRemainingModules(updatedCourse, 1);

      // Generate TTS for Module 1 in background (don't await)
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

      const previousContext = currentCourse.modules
        .slice(0, i)
        .map(m => `Module "${m.title}": ${m.slides.map(s => s.title).join(', ')}`)
        .join('\n');

      try {
        console.log(`\n🔄 Background: Generating module ${i + 1}/${currentCourse.modules.length}...`);

        // Rate limiting: wait 5s between modules to respect API limits
        if (i > startIndex) {
          console.log('   ⏳ Waiting 5s before next module...');
          await new Promise(r => setTimeout(r, 5000));
        }

        // Callback for progressive loading of this specific module
        const MODULE_INDEX = i;
        const handleImageReady = (slideIdx: number, blockIdx: number, imageUrl: string) => {
          setCourse(prevCourse => {
            if (!prevCourse) return prevCourse;

            const updatedModules = prevCourse.modules.map((mod, modIdx) => {
              if (modIdx !== MODULE_INDEX) return mod;

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

            const updated = { ...prevCourse, modules: updatedModules };

            // Save updated course to history to persist image URLs
            const savedHistory = localStorage.getItem('omni_history');
            const existingHistory = savedHistory ? JSON.parse(savedHistory) : [];
            const newHistory = [updated, ...existingHistory.filter((h: Course) => h.id !== updated.id)].slice(0, 10);
            localStorage.setItem('omni_history', JSON.stringify(newHistory));

            return updated;
          });
        };

        const moduleContent = await generateModuleContent(
          currentCourse.title,
          module.title,
          module.description,
          module.slides.map(s => s.title),
          previousContext,
          handleImageReady // Enable progressive loading for background modules too
        );

        // Merge slides: use structure from moduleContent but preserve imageUrls from state
        setCourse(prevCourse => {
          if (!prevCourse) return prevCourse;

          const currentSlides = prevCourse.modules[i]?.slides || [];

          // Merge: keep imageUrls from current state if they exist
          const mergedSlides = moduleContent.slides.map((newSlide, sIdx) => {
            const currentSlide = currentSlides[sIdx];
            if (!currentSlide) return newSlide;

            // Merge blocks, preserving imageUrls that were loaded
            const mergedBlocks = newSlide.blocks.map((newBlock, bIdx) => {
              const currentBlock = currentSlide.blocks?.[bIdx];
              if (newBlock.type === 'image' && currentBlock?.type === 'image') {
                // Preserve imageUrl if already loaded (not null)
                return currentBlock.imageUrl ? currentBlock : newBlock;
              }
              return newBlock;
            });

            return { ...newSlide, blocks: mergedBlocks };
          });

          return {
            ...prevCourse,
            modules: prevCourse.modules.map((m, idx) =>
              idx === i
                ? { ...m, slides: mergedSlides as unknown as Slide[], isLoaded: true }
                : m
            )
          };
        });

        // Update local reference for next iteration
        updatedCourse = {
          ...updatedCourse,
          modules: updatedCourse.modules.map((m, idx) =>
            idx === i
              ? { ...m, slides: moduleContent.slides as unknown as Slide[], isLoaded: true }
              : m
          )
        };

        saveToHistory(updatedCourse);

      } catch (error) {
        console.error(`Failed to generate module ${i + 1}:`, error);
      }
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

      const previousContext = course.modules
        .slice(0, moduleIndex)
        .filter(m => m.isLoaded)
        .map(m => `Module "${m.title}": ${m.slides.map(s => s.title).join(', ')}`)
        .join('\n');

      try {
        const moduleContent = await generateModuleContent(
          course.title,
          module.title,
          module.description,
          module.slides.map(s => s.title),
          previousContext
        );

        const updatedCourse: Course = {
          ...course,
          modules: course.modules.map((m, idx) =>
            idx === moduleIndex
              ? { ...m, slides: moduleContent.slides, isLoaded: true }
              : m
          )
        };

        setCourse(updatedCourse);
        saveToHistory(updatedCourse);
      } catch (error) {
        console.error("Failed to load module:", error);
        alert("Failed to load module content.");
      } finally {
        setIsGeneratingModule(false);
      }
    }
  };

  const navigateSlide = async (direction: 'next' | 'prev') => {
    if (!course) return;

    let newMod = activeModuleIndex;
    let newSlide = activeSlideIndex;
    const currentModule = course.modules[newMod];

    if (direction === 'next') {
      if (newSlide < currentModule.slides.length - 1) {
        newSlide++;
      } else if (newMod < course.modules.length - 1) {
        newMod++;
        newSlide = 0;
        await loadModuleIfNeeded(newMod);
      } else {
        return;
      }
    } else {
      if (newSlide > 0) {
        newSlide--;
      } else if (newMod > 0) {
        newMod--;
        newSlide = course.modules[newMod].slides.length - 1;
      } else {
        return;
      }
    }

    setActiveModuleIndex(newMod);
    setActiveSlideIndex(newSlide);
  };

  const jumpToSlide = async (modIdx: number, slideIdx: number) => {
    await loadModuleIfNeeded(modIdx);
    setActiveModuleIndex(modIdx);
    setActiveSlideIndex(slideIdx);
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

  // HOME VIEW - Redesigned with sidebar
  if (view === 'HOME') {
    const deleteFromHistory = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newHistory = history.filter(h => h.id !== id);
      setHistory(newHistory);
      localStorage.setItem('omni_history', JSON.stringify(newHistory));
    };

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
                  <h1 className="font-bold text-white text-lg">OmniLearn</h1>
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
                      onClick={() => loadFromHistory(item)}
                      className="group p-3 rounded-lg bg-zinc-800/30 border border-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-zinc-300 text-sm font-medium group-hover:text-white transition-colors line-clamp-2">
                          {item.title || item.topic}
                        </span>
                        <button
                          onClick={(e) => deleteFromHistory(item.id, e)}
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
                <h1 className="font-bold text-white text-2xl">OmniLearn</h1>
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

            {/* Input Section */}
            <div className="space-y-6">
              <div className="relative group">
                {/* Glow effect behind input */}
                <div className="absolute -inset-2 bg-gradient-to-r from-amber-400/20 via-orange-500/20 to-amber-400/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInitialSubmit()}
                  placeholder={isChatMode ? "Describe what you want to learn..." : "Enter a topic..."}
                  className="relative w-full bg-zinc-900/90 border-2 border-zinc-700 text-white text-lg md:text-xl px-8 py-6 rounded-2xl shadow-2xl focus:outline-none focus:ring-4 focus:ring-amber-400/30 focus:border-amber-400 transition-all placeholder-zinc-500"
                />
                <button
                  onClick={handleInitialSubmit}
                  disabled={isLoading || !topic.trim()}
                  className="absolute right-3 top-3 bottom-3 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-zinc-950 rounded-xl px-8 flex items-center gap-2 transition-all disabled:opacity-50 font-bold text-lg shadow-lg"
                >
                  {isLoading ? (
                    <span className="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                  ) : (
                    <>Start<Icons.ArrowRight /></>
                  )}
                </button>
              </div>

              {/* Mode Toggle and Settings */}
              <div className="flex justify-center items-center gap-4 text-sm">
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

              <p className="text-zinc-600 text-sm">
                {isChatMode
                  ? "I'll ask a few questions to personalize your learning experience"
                  : "Generate a curriculum instantly based on your topic"}
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
                    onClick={() => {
                      setCurriculum(curatedTopic.curriculum);
                      // Don't set topic to avoid filling home page prompt bar
                      setRefinementMessages([]);
                      setView('CURRICULUM_REVIEW');
                    }}
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
                    onClick={() => loadFromHistory(item)}
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

  // CLARIFICATION VIEW (Chat Mode Consultation)
  if (view === 'CLARIFICATION') {
    return (
      <div className="h-screen bg-zinc-950 flex flex-col p-4 md:p-8">
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col min-h-0 bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('HOME')}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <Icons.ArrowLeft />
              </button>
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Icons.Brain /> Learning Buddy
              </h2>
            </div>
            <button
              onClick={handleGenerateFromChat}
              disabled={isLoading || clarificationMessages.length < 2}
              className="bg-amber-400 text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Generating...' : 'Create Curriculum'}
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {clarificationMessages.map((msg, idx) => (
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
            <input
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-700 disabled:opacity-50"
              placeholder={isLoading ? "Generating curriculum..." : "Type your answer..."}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleClarificationSend(e.currentTarget.value);
                  e.currentTarget.value = '';
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // CURRICULUM_REVIEW VIEW (Clean, minimal redesign)
  if (view === 'CURRICULUM_REVIEW' && curriculum) {
    return (
      <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
        {/* Minimal Header */}
        <div className="flex-shrink-0 border-b border-zinc-900 bg-zinc-950 px-6 py-4">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <button
              onClick={() => setView('HOME')}
              className="text-zinc-500 hover:text-white text-sm flex items-center gap-2 transition-colors"
            >
              <Icons.ArrowLeft /> Back
            </button>
            <button
              onClick={handleGenerateExperience}
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isRefiningCurriculum) {
                          if (isChatMode) {
                            handleRefinementSend(e.currentTarget.value);
                            e.currentTarget.value = '';
                          } else {
                            handleAdjustCurriculum();
                          }
                        }
                      }}
                    />
                    <button
                      onClick={isChatMode ? () => {
                        const input = document.querySelector('input[placeholder*="Add more examples"]') as HTMLInputElement;
                        if (input?.value) {
                          handleRefinementSend(input.value);
                          input.value = '';
                        }
                      } : handleAdjustCurriculum}
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

  // LEARNING VIEW with toggleable/resizable sidebars
  if (view === 'LEARNING' && course) {
    const currentModule = course.modules[activeModuleIndex];
    const currentSlide = currentModule.slides[activeSlideIndex];
    const isFirst = activeModuleIndex === 0 && activeSlideIndex === 0;
    const isLast = activeModuleIndex === course.modules.length - 1 &&
                   activeSlideIndex === currentModule.slides.length - 1;

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

    // Chat context - minimal for token efficiency
    const chatContext = {
      topic: course.topic,
      modules: course.modules.map(m => m.title),
      currentSlide: currentSlide?.title || ''
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
                <button
                  onClick={() => setShowCurriculumSidebar(false)}
                  className="text-zinc-500 hover:text-white p-1"
                  title="Hide sidebar"
                >
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
                          onClick={() => jumpToSlide(modIdx, slideIdx)}
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
                <button onClick={() => setView('HOME')} className="text-sm text-zinc-500 hover:text-white flex items-center gap-2 transition-colors">
                  <Icons.ArrowLeft /> Exit
                </button>
              </div>
              {/* Resize handle */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-amber-400/50 transition-colors"
                onMouseDown={handleCurriculumDrag}
              />
            </>
          ) : (
            <div className="flex flex-col items-center h-full py-4">
              <button
                onClick={() => setShowCurriculumSidebar(true)}
                className="text-zinc-500 hover:text-white p-2"
                title="Show curriculum"
              >
                <Icons.BookOpen />
              </button>
              <div className="flex-1"></div>
              <button onClick={() => setView('HOME')} className="text-zinc-500 hover:text-white p-2 mb-2" title="Exit">
                <Icons.ArrowLeft />
              </button>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full relative bg-zinc-950">
          {/* Desktop Header with Ask AI button */}
          <div className="hidden md:flex h-14 border-b border-zinc-800 items-center justify-between px-6 bg-zinc-950">
            <div className="flex items-center gap-3 text-zinc-400 text-sm">
              <span className="text-zinc-600">Module {activeModuleIndex + 1}</span>
              <span className="text-zinc-700">•</span>
              <span className="text-white font-medium truncate max-w-md">{currentSlide?.title}</span>
            </div>
            <button
              onClick={() => setShowChatPane(!showChatPane)}
              className={`p-2 rounded-lg transition-colors ${showChatPane ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
              title="Ask AI"
            >
              <Icons.MessageCircle />
            </button>
          </div>

          {/* Mobile Header */}
          <div className="md:hidden h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950">
            <button onClick={() => setView('HOME')} className="text-zinc-400"><Icons.ArrowLeft /></button>
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
            <button
              disabled={isFirst}
              onClick={() => navigateSlide('prev')}
              className="flex items-center gap-2 text-zinc-500 hover:text-white disabled:opacity-20 transition-colors"
            >
              <Icons.ArrowLeft /> Previous
            </button>

            <button
              disabled={isLast}
              onClick={() => navigateSlide('next')}
              className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-black px-6 py-2.5 rounded-full font-semibold transition-all disabled:opacity-30"
            >
              Next <Icons.ArrowRight />
            </button>
          </div>
        </div>

        {/* Right Chat Pane (toggleable + resizable) */}
        {showChatPane && (
          <div
            className="bg-black border-l border-zinc-900 flex flex-col h-full relative transition-all duration-300"
            style={{ width: chatPaneWidth }}
          >
            {/* Resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-amber-400/50 transition-colors"
              onMouseDown={handleChatDrag}
            />

            {/* Chat Header */}
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-200 flex items-center gap-2">
                <Icons.MessageCircle /> AI Tutor
              </h3>
              <button
                onClick={() => setShowChatPane(false)}
                className="text-zinc-500 hover:text-white"
              >
                <Icons.X />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center text-zinc-600 text-sm py-8">
                  <p className="mb-2">Hi! I'm here to help.</p>
                  <p>Ask me anything about <span className="text-zinc-400">{currentSlide?.title}</span></p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-400 text-black'
                      : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
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
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!chatInput.trim() || isChatLoading) return;

                const userMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: Date.now() };
                setChatMessages(prev => [...prev, userMsg]);
                setChatInput('');
                setIsChatLoading(true);

                try {
                  const history = chatMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
                  const contextPrompt = `Context: Topic is "${course.topic}", current slide is "${currentSlide?.title}". `;
                  const response = await generateChatResponse(history, contextPrompt + chatInput);
                  setChatMessages(prev => [...prev, { role: 'model', text: response, timestamp: Date.now() }]);
                } catch (err) {
                  console.error('Chat error:', err);
                  setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I had trouble responding. Please try again.", timestamp: Date.now() }]);
                } finally {
                  setIsChatLoading(false);
                }
              }}
              className="p-3 bg-zinc-950 border-t border-zinc-900"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isChatLoading}
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

  return null;
}

export default App;
