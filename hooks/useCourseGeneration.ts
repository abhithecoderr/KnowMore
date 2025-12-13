/**
 * useCourseGeneration Hook
 * Handles course content generation, TTS, and background module loading
 */

import React from 'react';
import { Course, Slide, CurriculumData } from '../types';
import { generateModuleContent, generateTTSForModule, selectImagesForModule } from '../services/geminiService';

interface UseCourseGenerationProps {
  topic: string;
  curriculum: CurriculumData | null;
  setCourse: React.Dispatch<React.SetStateAction<Course | null>>;
  setView: (view: string) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingText: (text: string) => void;
  setActiveModuleIndex: (idx: number) => void;
  setActiveSlideIndex: (idx: number) => void;
  setImagesSelectedForModule: React.Dispatch<React.SetStateAction<boolean[]>>;
  saveToHistory: (course: Course) => void;
}

export function useCourseGeneration({
  topic,
  curriculum,
  setCourse,
  setView,
  setIsLoading,
  setLoadingText,
  setActiveModuleIndex,
  setActiveSlideIndex,
  setImagesSelectedForModule,
  saveToHistory,
}: UseCourseGenerationProps) {

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

  return {
    handleGenerateExperience,
    generateModuleTTS,
    generateRemainingModules,
  };
}
