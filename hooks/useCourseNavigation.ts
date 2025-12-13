/**
 * useCourseNavigation Hook
 * Handles slide/module navigation, lazy loading, and image selection
 */

import React from 'react';
import { Course, Slide } from '../types';
import { generateModuleContent, selectImagesForModule } from '../services/geminiService';

interface UseCourseNavigationProps {
  course: Course | null;
  activeModuleIndex: number;
  activeSlideIndex: number;
  imagesSelectedForModule: boolean[];
  setCourse: React.Dispatch<React.SetStateAction<Course | null>>;
  setActiveModuleIndex: (idx: number) => void;
  setActiveSlideIndex: (idx: number) => void;
  setIsGeneratingModule: (loading: boolean) => void;
  setImagesSelectedForModule: React.Dispatch<React.SetStateAction<boolean[]>>;
  saveToHistory: (course: Course) => void;
}

export function useCourseNavigation({
  course,
  activeModuleIndex,
  activeSlideIndex,
  imagesSelectedForModule,
  setCourse,
  setActiveModuleIndex,
  setActiveSlideIndex,
  setIsGeneratingModule,
  setImagesSelectedForModule,
  saveToHistory,
}: UseCourseNavigationProps) {

  const loadModuleIfNeeded = async (moduleIndex: number) => {
    if (!course) return;
    const module = course.modules[moduleIndex];

    if (!module.isLoaded) {
      setIsGeneratingModule(true);
      const previousContext = course.modules.slice(0, moduleIndex).filter(m => m.isLoaded).map(m => `Module "${m.title}": ${m.slides.map(s => s.title).join(', ')}`).join('\n');

      try {
        const moduleContent = await generateModuleContent(course.title, module.title, module.description, module.slides.map(s => s.title), previousContext, undefined, true);
        const updatedCourse: Course = { ...course, modules: course.modules.map((m, idx) => idx === moduleIndex ? { ...m, slides: moduleContent.slides as unknown as Slide[], isLoaded: true } : m) };
        setCourse(updatedCourse);
        saveToHistory(updatedCourse);
      } catch (error) {
        console.error("Failed to load module:", error);
        alert("Failed to load module content.");
      } finally { setIsGeneratingModule(false); }
    }
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

  const jumpToSlide = async (modIdx: number, slideIdx: number) => {
    await loadModuleIfNeeded(modIdx);
    setActiveModuleIndex(modIdx);
    setActiveSlideIndex(slideIdx);
    triggerImageSelectionForModule(modIdx);
  };

  return {
    navigateSlide,
    jumpToSlide,
    loadModuleIfNeeded,
    triggerImageSelectionForModule,
  };
}
