/**
 * useCurriculumFlow Hook
 * Handles curriculum generation, refinement, and content mode switching
 */

import React from 'react';
import { ChatMessage, CurriculumData, LearningPreferences, LearningMode, Article, Presentation, ViewState } from '../types';
import {
  generateCurriculum,
  generateConsultantReply,
  refineCurriculum,
  adjustCurriculum,
  generateArticle,
  generatePresentation,
  fetchArticleImages,
  fetchPresentationImages,
  LIVE_VOICE_ENABLED,
} from '../services/geminiService';

interface UseCurriculumFlowProps {
  topic: string;
  learningMode: LearningMode;
  preferences: LearningPreferences;
  saveCustomInstructions: boolean;
  curriculum: CurriculumData | null;
  clarificationMessages: ChatMessage[];
  setCurriculum: React.Dispatch<React.SetStateAction<CurriculumData | null>>;
  setClarificationMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setRefinementMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsLoading: (loading: boolean) => void;
  setLoadingText: (text: string) => void;
  setIsConsulting: (consulting: boolean) => void;
  setIsRefiningCurriculum: (refining: boolean) => void;
  setView: (view: ViewState) => void;
  setArticle: React.Dispatch<React.SetStateAction<Article | null>>;
  setPresentation: React.Dispatch<React.SetStateAction<Presentation | null>>;
  setActivePresentationSlide: (idx: number) => void;
  updatePreferences: (prefs: Partial<LearningPreferences>) => void;
  consultantVoice: { start: () => void; stop: () => void };
}

export function useCurriculumFlow({
  topic,
  learningMode,
  preferences,
  saveCustomInstructions,
  curriculum,
  clarificationMessages,
  setCurriculum,
  setClarificationMessages,
  setRefinementMessages,
  setIsLoading,
  setLoadingText,
  setIsConsulting,
  setIsRefiningCurriculum,
  setView,
  setArticle,
  setPresentation,
  setActivePresentationSlide,
  updatePreferences,
  consultantVoice,
}: UseCurriculumFlowProps) {

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

  const handleAdjustCurriculum = async (adjustPrompt: string, setAdjustPrompt: (s: string) => void) => {
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

  const handleInitialSubmit = async (isChatMode: boolean) => {
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

  return {
    handleInitialSubmit,
    handleClarificationSend,
    handleGenerateCurriculumOnly,
    handleGenerateFromChat,
    handleRefinementSend,
    handleAdjustCurriculum,
  };
}
