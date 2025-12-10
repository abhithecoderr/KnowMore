import React, { useState, useEffect, useRef } from 'react';
import { Course, Module, ViewState, ChatMessage, CurriculumData } from './types';
import {
  generateCurriculum,
  generateModuleContent,
  generateConsultantReply,
  refineCurriculum,
  adjustCurriculum,
  ConsultantResult
} from './services/geminiService';
import { Icons } from './constants';
import { SlideView } from './components/SlideView';
import { ChatWidget } from './components/ChatWidget';

function App() {
  // View state
  const [view, setView] = useState<ViewState>('HOME');
  const [topic, setTopic] = useState('');

  // Chat/Clarification mode
  const [isChatMode, setIsChatMode] = useState(true);
  const [clarificationMessages, setClarificationMessages] = useState<ChatMessage[]>([]);
  const [isConsulting, setIsConsulting] = useState(false);

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

  const clarificationEndRef = useRef<HTMLDivElement>(null);
  const refinementEndRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('omni_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); }
      catch (e) { console.error("Failed to parse history", e); }
    }
  }, []);

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
        const result = await generateConsultantReply([], topic, true);
        setClarificationMessages(prev => [...prev, { role: 'model', text: result.text, timestamp: Date.now() }]);

        if (result.shouldGenerateCurriculum) {
          await handleGenerateFromChat();
        }
      } catch (e) { console.error(e); }
      finally { setIsConsulting(false); }
    } else {
      // Direct mode: Generate curriculum immediately
      await handleGenerateCurriculumOnly(topic, "");
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
      const result = await generateConsultantReply(apiHistory, text, false);
      setClarificationMessages(prev => [...prev, { role: 'model', text: result.text, timestamp: Date.now() }]);

      // Auto-trigger curriculum generation if AI decides to
      if (result.shouldGenerateCurriculum) {
        // Small delay so user sees the message
        setTimeout(() => handleGenerateFromChat(), 500);
      }
    } catch (e) { console.error(e); }
    finally { setIsConsulting(false); }
  };

  // ============================================
  // CURRICULUM GENERATION (Phase 1 - Structure Only)
  // ============================================

  const handleGenerateCurriculumOnly = async (topicStr: string, context: string) => {
    setIsLoading(true);
    setLoadingText('Designing your learning path...');

    try {
      const curriculumData = await generateCurriculum(topicStr, context);
      setCurriculum(curriculumData);
      setRefinementMessages([]);
      setView('CURRICULUM_REVIEW');
    } catch (error) {
      console.error(error);
      alert("Failed to generate curriculum. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateFromChat = async () => {
    const context = clarificationMessages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    await handleGenerateCurriculumOnly(topic, context);
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

      // Generate Module 1 content
      const module1 = newCourse.modules[0];
      const module1Content = await generateModuleContent(
        newCourse.title,
        module1.title,
        module1.description,
        module1.slides.map(s => s.title),
        ""
      );

      // Update course with Module 1 content
      const updatedCourse: Course = {
        ...newCourse,
        modules: newCourse.modules.map((m, idx) =>
          idx === 0
            ? { ...m, slides: module1Content.slides, isLoaded: true }
            : m
        )
      };

      setCourse(updatedCourse);
      saveToHistory(updatedCourse);
      setActiveModuleIndex(0);
      setActiveSlideIndex(0);
      setView('LEARNING');

      // Generate remaining modules in background
      generateRemainingModules(updatedCourse, 1);

    } catch (error) {
      console.error(error);
      alert("Failed to generate course content. Please try again.");
    } finally {
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

        const moduleContent = await generateModuleContent(
          currentCourse.title,
          module.title,
          module.description,
          module.slides.map(s => s.title),
          previousContext
        );

        updatedCourse = {
          ...updatedCourse,
          modules: updatedCourse.modules.map((m, idx) =>
            idx === i
              ? { ...m, slides: moduleContent.slides, isLoaded: true }
              : m
          )
        };

        setCourse(updatedCourse);
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

  // HOME VIEW
  if (view === 'HOME') {
    return (
      <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-y-auto">
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[20%] w-[60%] h-[60%] bg-zinc-900/30 rounded-full blur-[120px] opacity-50"></div>
        </div>

        <div className="z-10 max-w-2xl w-full text-center space-y-10 animate-fade-in-up py-10">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl text-white">
               <Icons.Brain />
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight">OmniLearn AI</h1>
          <p className="text-zinc-400 text-lg md:text-xl font-light">
            Master any topic. Structured deep dives, generated specifically for you.
          </p>

          <div className="w-full max-w-xl mx-auto space-y-4">
            <div className="relative group">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInitialSubmit()}
                placeholder={isChatMode ? "Let's discuss what you want to learn..." : "What do you want to learn today?"}
                className="w-full bg-zinc-900 border border-zinc-800 text-white text-lg px-6 py-5 rounded-xl shadow-lg focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all placeholder-zinc-500"
              />
              <button
                onClick={handleInitialSubmit}
                disabled={isLoading || !topic.trim()}
                className="absolute right-3 top-3 bottom-3 bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-lg px-5 flex items-center gap-2 transition-all disabled:opacity-50 font-medium"
              >
                {isLoading ? 'Thinking...' : <Icons.ArrowRight />}
              </button>
            </div>

            <div className="flex justify-center items-center gap-4 text-sm">
              <span className={`transition-colors ${!isChatMode ? 'text-white font-medium' : 'text-zinc-500'}`}>Direct Mode</span>
              <button
                onClick={() => setIsChatMode(!isChatMode)}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${isChatMode ? 'bg-amber-400' : 'bg-zinc-800'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-black transition-transform ${isChatMode ? 'translate-x-6' : 'translate-x-0'}`}></div>
              </button>
              <span className={`transition-colors ${isChatMode ? 'text-white font-medium' : 'text-zinc-500'}`}>Chat Mode</span>
            </div>
          </div>

          {isLoading && (
            <div className="text-zinc-500 text-sm animate-pulse tracking-wide">{loadingText}</div>
          )}

          {history.length > 0 && (
            <div className="mt-16 text-left w-full max-w-lg mx-auto">
              <h3 className="text-zinc-600 uppercase text-xs font-bold tracking-widest mb-4">Library</h3>
              <div className="space-y-3">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadFromHistory(item)}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-900 hover:border-zinc-700 transition-all group"
                  >
                    <span className="text-zinc-300 font-medium group-hover:text-white transition-colors">{item.topic}</span>
                    <span className="text-zinc-600 group-hover:text-zinc-300 transition-colors"><Icons.ArrowRight /></span>
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
          <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Icons.Brain /> Learning Consultant
            </h2>
            <button
              onClick={handleGenerateFromChat}
              disabled={isLoading}
              className="bg-amber-400 text-black px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Generating...' : 'Create Curriculum'}
            </button>
          </div>

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
            {isConsulting && (
              <div className="flex justify-start">
                <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl text-zinc-500 text-sm animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={clarificationEndRef} />
          </div>

          <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
            <input
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-700"
              placeholder="Type your answer..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
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

  // CURRICULUM_REVIEW VIEW (New - Two-phase flow)
  if (view === 'CURRICULUM_REVIEW' && curriculum) {
    return (
      <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-zinc-800 bg-zinc-900/50 p-4 md:p-6">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div>
              <button
                onClick={() => setView('HOME')}
                className="text-zinc-500 hover:text-white text-sm flex items-center gap-2 mb-2 transition-colors"
              >
                <Icons.ArrowLeft /> Back
              </button>
              <h1 className="text-2xl md:text-3xl font-bold text-white">{curriculum.title}</h1>
            </div>
            <button
              onClick={handleGenerateExperience}
              disabled={isLoading}
              className="bg-amber-400 hover:bg-amber-500 text-black px-6 py-3 rounded-full font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full"></span>
                  Generating...
                </>
              ) : (
                <>
                  <Icons.Sparkles /> Generate Experience
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20 space-y-8">
            {/* Overview */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-3">What You'll Learn</h2>
              <p className="text-zinc-400 leading-relaxed">{curriculum.overview}</p>
            </div>

            {/* Learning Goals */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Learning Goals</h2>
              <ul className="space-y-3">
                {curriculum.learningGoals.map((goal, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center flex-shrink-0 text-sm font-bold">
                      {idx + 1}
                    </div>
                    <span className="text-zinc-300">{goal}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Modules */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Curriculum Modules</h2>
              {curriculum.modules.map((module, modIdx) => (
                <div key={module.id} className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-zinc-800/50">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Module {modIdx + 1}</span>
                    </div>
                    <h3 className="text-white font-medium mt-1">{module.title}</h3>
                    <p className="text-zinc-500 text-sm mt-1">{module.description}</p>
                  </div>
                  <div className="p-4 space-y-2">
                    {module.slides.map((slide, slideIdx) => (
                      <div key={slide.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-800/30 transition-colors">
                        <div className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          {slideIdx + 1}
                        </div>
                        <div>
                          <div className="text-zinc-300 text-sm font-medium">{slide.title}</div>
                          <div className="text-zinc-600 text-xs mt-0.5">{slide.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Refinement Section - Mode specific */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                {isChatMode ? 'Refine Your Curriculum' : 'Adjust Curriculum'}
              </h2>

              {isChatMode ? (
                // Chat mode: Conversation-based refinement
                <div className="space-y-4">
                  {refinementMessages.length > 0 && (
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {refinementMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                            msg.role === 'user'
                            ? 'bg-zinc-800 text-white'
                            : 'bg-zinc-950 border border-zinc-700 text-zinc-300'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      {isRefiningCurriculum && (
                        <div className="flex justify-start">
                          <div className="bg-zinc-950 border border-zinc-700 p-3 rounded-xl text-zinc-500 text-sm animate-pulse">
                            Updating curriculum...
                          </div>
                        </div>
                      )}
                      <div ref={refinementEndRef} />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-zinc-700"
                      placeholder="e.g., Add more examples, focus on practical applications..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isRefiningCurriculum) {
                          handleRefinementSend(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>
                  <p className="text-zinc-600 text-xs">
                    Chat with AI to adjust the curriculum. When you're happy, click "Generate Experience" above.
                  </p>
                </div>
              ) : (
                // Direct mode: Prompt-based adjustment
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={adjustPrompt}
                      onChange={(e) => setAdjustPrompt(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-zinc-700"
                      placeholder="e.g., Add a module on advanced topics, remove the basics..."
                      onKeyDown={(e) => e.key === 'Enter' && handleAdjustCurriculum()}
                    />
                    <button
                      onClick={handleAdjustCurriculum}
                      disabled={isRefiningCurriculum || !adjustPrompt.trim()}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {isRefiningCurriculum ? 'Adjusting...' : 'Adjust'}
                    </button>
                  </div>
                  <p className="text-zinc-600 text-xs">
                    Describe how you'd like to modify the curriculum. When you're happy, click "Generate Experience" above.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="fixed inset-0 bg-zinc-950/80 flex items-center justify-center z-50">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <Icons.Sparkles />
              </div>
              <p className="text-white font-medium">{loadingText}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // LEARNING VIEW
  if (view === 'LEARNING' && course) {
    const currentModule = course.modules[activeModuleIndex];
    const currentSlide = currentModule.slides[activeSlideIndex];
    const isFirst = activeModuleIndex === 0 && activeSlideIndex === 0;
    const isLast = activeModuleIndex === course.modules.length - 1 &&
                   activeSlideIndex === currentModule.slides.length - 1;

    return (
      <div className="flex h-screen bg-zinc-950 overflow-hidden text-white">
        {/* Sidebar */}
        <div className="w-80 bg-black border-r border-zinc-900 flex-col hidden md:flex">
          <div className="p-6 border-b border-zinc-900">
            <h2 className="font-semibold text-lg text-zinc-200 truncate">{course.title}</h2>
            <p className="text-xs text-zinc-500 mt-2 font-medium tracking-wide">MODULES</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {course.modules.map((mod, modIdx) => (
              <div key={mod.id}>
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 px-3 flex items-center gap-2">
                  Module {modIdx + 1}
                  {!mod.isLoaded && <span className="text-amber-400 text-[10px] normal-case">(loading...)</span>}
                </div>
                <div className="text-sm text-zinc-400 px-3 mb-2">{mod.title}</div>
                <div className="space-y-1">
                  {mod.slides.map((slide, slideIdx) => (
                    <button
                      key={slide.id}
                      onClick={() => jumpToSlide(modIdx, slideIdx)}
                      disabled={!mod.isLoaded}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-3 disabled:opacity-50 ${
                        modIdx === activeModuleIndex && slideIdx === activeSlideIndex
                        ? 'bg-zinc-900 text-white font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
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
          <div className="p-4 border-t border-zinc-900">
            <button onClick={() => setView('HOME')} className="text-sm text-zinc-500 hover:text-white flex items-center gap-2 transition-colors">
              <Icons.ArrowLeft /> Exit Course
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full relative bg-zinc-950">
          {/* Mobile Header */}
          <div className="md:hidden h-16 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950">
            <button onClick={() => setView('HOME')} className="text-zinc-400"><Icons.ArrowLeft /></button>
            <div className="flex flex-col overflow-hidden text-center">
              <span className="font-bold truncate text-sm text-white">{currentSlide?.title}</span>
              <span className="truncate text-xs text-zinc-500">{currentModule.title}</span>
            </div>
            <div className="w-6"></div>
          </div>

          <div className="flex-1 overflow-hidden relative p-4 md:p-12 max-w-4xl mx-auto w-full">
            {isGeneratingModule ? (
              <div className="flex flex-col items-center justify-center h-full space-y-6 animate-pulse">
                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-white">
                  <Icons.Sparkles />
                </div>
                <h2 className="text-xl font-medium text-zinc-300">Loading module...</h2>
                <p className="text-zinc-600 text-center text-sm">Generating content for "{currentModule.title}"</p>
              </div>
            ) : currentSlide && currentSlide.blocks.length > 0 ? (
              <SlideView slide={currentSlide} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-zinc-500">No content available for this slide.</p>
              </div>
            )}
          </div>

          {/* Bottom Nav */}
          <div className="h-24 bg-zinc-950/80 backdrop-blur border-t border-zinc-900 flex items-center justify-between px-6 md:px-12 absolute bottom-0 w-full z-20">
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
              className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-black px-8 py-3 rounded-full font-semibold transition-all disabled:opacity-30"
            >
              Next <Icons.ArrowRight />
            </button>
          </div>

          <ChatWidget contextTopic={`${course.topic} - ${currentModule.title}: ${currentSlide?.title}`} />
        </div>
      </div>
    );
  }

  return null;
}

export default App;
