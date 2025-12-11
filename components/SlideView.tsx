import React, { useState, useRef } from 'react';
import { Slide, ContentBlock, TextBlock as TextBlockType, ImageBlock as ImageBlockType, QuizBlock as QuizBlockType, FunFactBlock as FunFactBlockType, TableBlock as TableBlockType } from '../types';
import { Icons } from '../constants';
import { generateSpeech } from '../services/geminiService';

// ============================================
// TEXT BLOCK
// ============================================
const TextBlock: React.FC<{ block: TextBlockType }> = ({ block }) => {
  if (!block.content) return null;

  return (
    <div className="prose prose-invert prose-lg max-w-none mb-6 prose-headings:font-semibold prose-p:text-zinc-300 prose-headings:text-zinc-100 prose-strong:text-white prose-li:text-zinc-300">
      {block.content.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i} className="text-xl font-bold mt-6 mb-3 text-white">{line.replace(/^### /, '')}</h3>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-2xl font-bold mt-8 mb-4 text-white">{line.replace(/^## /, '')}</h2>;
        if (line.startsWith('# ')) return <h1 key={i} className="text-3xl font-bold mt-10 mb-5 text-white">{line.replace(/^# /, '')}</h1>;
        if (line.startsWith('- ')) return <li key={i} className="ml-4 list-disc mb-2">{line.replace(/^- /, '')}</li>;
        if (line.trim() === '') return <br key={i} />;

        // Handle bold text
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={i} className="mb-4 leading-relaxed">
            {parts.map((part, idx) =>
              idx % 2 === 1 ? <strong key={idx} className="text-white font-semibold">{part}</strong> : part
            )}
          </p>
        );
      })}
    </div>
  );
};

// ============================================
// IMAGE BLOCK (Clean Layout System)
// Positions: hero (centered), intro (left at start), grid (row of images)
// Using object-contain to show full images without clipping
// Supports loading state when imageUrl is null
// ============================================
const ImageBlock: React.FC<{ block: ImageBlockType }> = ({ block }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const { imageUrl, keywords, caption, position = 'hero' } = block;

  const placeholderUrl = `https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords?.slice(0, 15) || 'Image')}`;

  // null = loading in background, undefined/error = use placeholder
  const isLoading = imageUrl === null;
  const src = imgError ? placeholderUrl : (imageUrl || placeholderUrl);

  // Common image style - object-contain to preserve full image
  const imgClassName = `w-full h-full object-contain transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`;

  // Loading skeleton component
  const LoadingSkeleton = ({ height }: { height: string }) => (
    <div className={`w-full ${height} bg-zinc-800 rounded-xl animate-pulse flex items-center justify-center`}>
      <div className="flex flex-col items-center gap-2 text-zinc-600">
        <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-xs">Loading image...</span>
      </div>
    </div>
  );

  // HERO: Centered image, moderate width (not full), standalone section
  if (position === 'hero') {
    return (
      <div className="w-full max-w-2xl mx-auto my-8">
        {isLoading ? (
          <LoadingSkeleton height="h-[300px]" />
        ) : (
          <div className="bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800 shadow-lg flex items-center justify-center relative" style={{ minHeight: '200px', maxHeight: '350px' }}>
            {!imgLoaded && <div className="absolute inset-0 bg-zinc-800 animate-pulse" />}
            <img
              src={src}
              alt={caption || keywords || 'Illustration'}
              className={imgClassName}
              style={{ maxHeight: '350px' }}
              referrerPolicy="no-referrer"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </div>
        )}
        {caption && (
          <p className="text-center text-xs text-zinc-500 mt-2 italic">{caption}</p>
        )}
      </div>
    );
  }

  // INTRO: Left-aligned image (for slide start), smaller size
  if (position === 'intro') {
    return (
      <div className="float-left mr-6 mb-4 w-[35%] max-w-xs">
        {isLoading ? (
          <LoadingSkeleton height="h-[200px]" />
        ) : (
          <div className="bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800 shadow-lg flex items-center justify-center relative" style={{ minHeight: '150px', maxHeight: '250px' }}>
            {!imgLoaded && <div className="absolute inset-0 bg-zinc-800 animate-pulse" />}
            <img
              src={src}
              alt={caption || keywords || 'Illustration'}
              className={imgClassName}
              style={{ maxHeight: '250px' }}
              referrerPolicy="no-referrer"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </div>
        )}
        {caption && (
          <p className="text-center text-xs text-zinc-500 mt-2 italic">{caption}</p>
        )}
      </div>
    );
  }

  // GRID: Inline images for galleries (multiple images in a row)
  return (
    <div className="inline-block w-[32%] mx-[0.5%] mb-4 align-top">
      {isLoading ? (
        <LoadingSkeleton height="h-[160px]" />
      ) : (
        <div className="bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800 shadow-lg flex items-center justify-center relative" style={{ minHeight: '120px', maxHeight: '200px' }}>
          {!imgLoaded && <div className="absolute inset-0 bg-zinc-800 animate-pulse" />}
          <img
            src={src}
            alt={caption || keywords || 'Illustration'}
            className={imgClassName}
            style={{ maxHeight: '200px' }}
            referrerPolicy="no-referrer"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        </div>
      )}
      {caption && (
        <p className="text-center text-xs text-zinc-500 mt-1 italic">{caption}</p>
      )}
    </div>
  );
};

// ============================================
// QUIZ BLOCK
// ============================================
const QuizBlock: React.FC<{ block: QuizBlockType }> = ({ block }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  if (!block.question || !block.options) return null;

  const handleSelect = (idx: number) => {
    setSelectedIndex(idx);
    setShowExplanation(true);
  };

  return (
    <div className="bg-zinc-900 rounded-2xl p-8 border border-zinc-800 my-8 clear-both">
      <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
        <Icons.CheckCircle /> Quick Check
      </h3>
      <p className="text-xl font-medium mb-6 text-white">{block.question}</p>
      <div className="space-y-3">
        {block.options.map((option, idx) => {
          const isSelected = selectedIndex === idx;
          const isCorrect = option.isCorrect;

          let btnClass = 'bg-zinc-950 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 text-zinc-300';
          if (showExplanation) {
            if (isCorrect) btnClass = 'bg-emerald-900/20 border-emerald-700 text-emerald-200';
            else if (isSelected) btnClass = 'bg-red-900/20 border-red-700 text-red-200';
            else btnClass = 'bg-zinc-900/50 border-zinc-800 text-zinc-500';
          }

          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={showExplanation}
              className={`w-full text-left p-4 rounded-xl border transition-all flex justify-between items-center ${btnClass}`}
            >
              {option.text}
              {showExplanation && isCorrect && <span className="text-emerald-400 text-sm">✓ Correct</span>}
              {showExplanation && isSelected && !isCorrect && <span className="text-red-400 text-sm">✗ Incorrect</span>}
            </button>
          );
        })}
      </div>
      {showExplanation && block.explanation && (
        <div className="mt-6 p-5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 text-sm leading-relaxed">
          <strong className="text-white block mb-1">Explanation</strong>
          {block.explanation}
        </div>
      )}
    </div>
  );
};

// ============================================
// FUN FACT BLOCK
// ============================================
const FunFactBlock: React.FC<{ block: FunFactBlockType }> = ({ block }) => {
  if (!block.fact) return null;

  return (
    <div className="bg-zinc-900/50 border-l-4 border-amber-400 p-6 rounded-r-lg my-6 clear-both">
      <div className="flex items-start gap-4">
        <div className="text-amber-400 mt-1 flex-shrink-0"><Icons.Sparkles /></div>
        <div>
          <h4 className="font-bold text-zinc-200 mb-1">Did You Know?</h4>
          <p className="text-zinc-400">{block.fact}</p>
        </div>
      </div>
    </div>
  );
};

// ============================================
// TABLE BLOCK
// ============================================
const TableBlock: React.FC<{ block: TableBlockType }> = ({ block }) => {
  if (!block.markdown) return null;

  const lines = block.markdown.trim().split('\n');
  if (lines.length < 2) return <p className="text-zinc-400">{block.markdown}</p>;

  const headers = lines[0].split('|').map(h => h.trim()).filter(h => h);
  const bodyRows = lines.slice(2).map(row =>
    row.split('|').map(cell => cell.trim()).filter(c => c)
  );

  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-zinc-800 clear-both">
      <table className="w-full text-sm text-left text-zinc-400">
        <thead className="text-xs text-zinc-300 uppercase bg-zinc-900">
          <tr>
            {headers.map((header, i) => (
              <th key={i} scope="col" className="px-6 py-3">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, i) => (
            <tr key={i} className="bg-zinc-950/50 border-t border-zinc-800 hover:bg-zinc-900">
              {row.map((cell, j) => (
                <td key={j} className="px-6 py-4">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============================================
// MAIN SLIDE VIEW
// ============================================
interface SlideViewProps {
  slide: Slide;
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length;
  const buffer = ctx.createBuffer(1, frameCount, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

export const SlideView: React.FC<SlideViewProps> = ({ slide }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getTextForSpeech = () => {
    return slide.blocks
      .filter((b): b is TextBlockType => b.type === 'text')
      .map(b => b.content)
      .join(' ')
      .substring(0, 500);
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const playAudio = async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = await decodeAudioData(decode(base64Data), ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      audioSourceRef.current = source;
      source.start();
      setIsPlaying(true);
    } catch (err) {
      console.error("Audio playback error", err);
      setIsPlaying(false);
    }
  };

  const toggleAudio = async () => {
    if (isPlaying) {
      stopAudio();
    } else {
      if (!audioBase64) {
        setAudioLoading(true);
        try {
          const text = getTextForSpeech();
          const base64 = await generateSpeech(text);
          setAudioBase64(base64);
          await playAudio(base64);
        } catch (error) {
          console.error("TTS Error", error);
        } finally {
          setAudioLoading(false);
        }
      } else {
        await playAudio(audioBase64);
      }
    }
  };

  // Filter valid blocks
  const validBlocks = slide.blocks.filter(block => block && block.type);

  return (
    <div className="flex flex-col h-full overflow-y-auto pr-2 pb-32">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 border-b border-zinc-900 pb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">{slide.title}</h1>
        <button
          onClick={toggleAudio}
          disabled={audioLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800 transition-colors disabled:opacity-50"
        >
          {audioLoading ? (
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
          ) : isPlaying ? <Icons.Pause /> : <Icons.Play />}
          <span className="text-sm font-medium">{isPlaying ? 'Pause' : 'Listen'}</span>
        </button>
      </div>

      {/* Content Blocks */}
      <div>
        {validBlocks.map((block, index) => {
          const key = `${slide.id}-${index}`;

          switch (block.type) {
            case 'text':
              return <TextBlock key={key} block={block as TextBlockType} />;
            case 'image':
              return <ImageBlock key={key} block={block as ImageBlockType} />;
            case 'quiz':
              return <QuizBlock key={key} block={block as QuizBlockType} />;
            case 'fun_fact':
              return <FunFactBlock key={key} block={block as FunFactBlockType} />;
            case 'table':
              return <TableBlock key={key} block={block as TableBlockType} />;
            default:
              return null;
          }
        })}
        {/* Clear floats from left/right positioned images */}
        <div className="clear-both" />
      </div>
    </div>
  );
};