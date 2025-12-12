import React, { useState, useRef, useEffect } from 'react';
import { Slide, ContentBlock, TextBlock as TextBlockType, ImageBlock as ImageBlockType, QuizBlock as QuizBlockType, FunFactBlock as FunFactBlockType, TableBlock as TableBlockType, NotesSummaryBlock as NotesSummaryBlockType, FillBlankBlock as FillBlankBlockType, ShortAnswerBlock as ShortAnswerBlockType, ReflectionBlock as ReflectionBlockType, MatchFollowingBlock as MatchFollowingBlockType } from '../types';
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
// IMAGE BLOCK (Clean, Immersive Design)
// No heavy borders or dark backgrounds - images stand on their own
// ============================================
const ImageBlock: React.FC<{ block: ImageBlockType }> = ({ block }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const { imageUrl, keywords, caption, position = 'hero' } = block;

  const placeholderUrl = `https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords?.slice(0, 15) || 'Image')}`;

  const isLoading = imageUrl === null;
  const src = imgError ? placeholderUrl : (imageUrl || placeholderUrl);

  // Simple loading skeleton
  const LoadingSkeleton = ({ height }: { height: string }) => (
    <div className={`w-full ${height} bg-zinc-900 rounded-lg animate-pulse flex items-center justify-center`}>
      <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-500 rounded-full animate-spin" />
    </div>
  );

  // HERO: Large, centered, no container - image speaks for itself
  if (position === 'hero') {
    return (
      <figure className="w-full max-w-3xl mx-auto my-10">
        {isLoading ? (
          <LoadingSkeleton height="h-[280px]" />
        ) : (
          <div className="relative">
            {!imgLoaded && <div className="absolute inset-0 bg-zinc-900 rounded-lg animate-pulse" />}
            <img
              src={src}
              alt={caption || keywords || 'Illustration'}
              className={`w-full h-auto min-h-[200px] max-h-[350px] object-contain rounded-lg transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              referrerPolicy="no-referrer"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </div>
        )}
        {caption && (
          <figcaption className="text-center text-sm text-zinc-500 mt-4">{caption}</figcaption>
        )}
      </figure>
    );
  }

  // INTRO: Left-aligned, floating beside text
  if (position === 'intro') {
    return (
      <figure className="float-left mr-8 mb-6 w-[40%] max-w-sm">
        {isLoading ? (
          <LoadingSkeleton height="h-[180px]" />
        ) : (
          <div className="relative">
            {!imgLoaded && <div className="absolute inset-0 bg-zinc-900 rounded-lg animate-pulse" />}
            <img
              src={src}
              alt={caption || keywords || 'Illustration'}
              className={`w-full h-auto min-h-[200px] max-h-[280px] object-contain rounded-lg transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              referrerPolicy="no-referrer"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </div>
        )}
        {caption && (
          <figcaption className="text-center text-xs text-zinc-500 mt-2">{caption}</figcaption>
        )}
      </figure>
    );
  }

  // GRID: For image galleries
  return (
    <figure className="inline-block w-[32%] mx-[0.5%] mb-6 align-top">
      {isLoading ? (
        <LoadingSkeleton height="h-[140px]" />
      ) : (
        <div className="relative">
          {!imgLoaded && <div className="absolute inset-0 bg-zinc-900 rounded-lg animate-pulse" />}
          <img
            src={src}
            alt={caption || keywords || 'Illustration'}
            className={`w-full h-auto min-h-[200px] max-h-[200px] object-contain rounded-lg transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            referrerPolicy="no-referrer"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        </div>
      )}
      {caption && (
        <figcaption className="text-center text-xs text-zinc-500 mt-2">{caption}</figcaption>
      )}
    </figure>
  );
};

// ============================================
// QUIZ BLOCK (Clean, minimal design)
// ============================================
const QuizBlock: React.FC<{ block: QuizBlockType }> = ({ block }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  if (!block.question || !block.options || block.options.length === 0) {
    return (
      <div className="my-8 py-6 border-t border-zinc-800">
        <p className="text-zinc-500 italic">Quiz loading...</p>
      </div>
    );
  }

  const handleSelect = (idx: number) => {
    setSelectedIndex(idx);
    setShowExplanation(true);
  };

  return (
    <div className="my-10 py-8 border-t border-zinc-800 clear-both">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">Quick Check</p>
      <p className="text-xl font-medium mb-6 text-white leading-relaxed">{block.question}</p>
      <div className="space-y-3">
        {block.options.map((option, idx) => {
          const isSelected = selectedIndex === idx;
          const isCorrect = option.isCorrect;

          let btnClass = 'border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-white';
          if (showExplanation) {
            if (isCorrect) btnClass = 'border-emerald-600 text-emerald-300 bg-emerald-900/10';
            else if (isSelected) btnClass = 'border-red-600 text-red-300 bg-red-900/10';
            else btnClass = 'border-zinc-800 text-zinc-600';
          }

          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={showExplanation}
              className={`w-full text-left p-4 rounded-lg border transition-all flex justify-between items-center ${btnClass}`}
            >
              <span>{option.text}</span>
              {showExplanation && isCorrect && <span className="text-emerald-400 text-sm">✓</span>}
              {showExplanation && isSelected && !isCorrect && <span className="text-red-400 text-sm">✗</span>}
            </button>
          );
        })}
      </div>
      {showExplanation && block.explanation && (
        <p className="mt-6 text-zinc-400 text-sm leading-relaxed border-l-2 border-zinc-700 pl-4">
          {block.explanation}
        </p>
      )}
    </div>
  );
};

// ============================================
// FUN FACT BLOCK (Minimal callout)
// ============================================
const FunFactBlock: React.FC<{ block: FunFactBlockType }> = ({ block }) => {
  if (!block.fact) return null;

  return (
    <aside className="my-8 py-4 border-l-2 border-amber-400/60 pl-6 clear-both">
      <p className="text-xs font-medium text-amber-400/80 uppercase tracking-wide mb-2">Did you know?</p>
      <p className="text-zinc-300 leading-relaxed">{block.fact}</p>
    </aside>
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
// NOTES & SUMMARY BLOCK (Clean design)
// ============================================
const NotesSummaryBlock: React.FC<{ block: NotesSummaryBlockType }> = ({ block }) => {
  if (!block.points || block.points.length === 0) return null;

  return (
    <section className="my-10 py-8 border-t border-zinc-800">
      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
        <Icons.BookOpen /> Key Takeaways
      </h3>
      {block.summary && (
        <p className="text-zinc-400 mb-6 leading-relaxed border-l-2 border-zinc-700 pl-4">
          {block.summary}
        </p>
      )}
      <ul className="space-y-3">
        {block.points.map((point, idx) => (
          <li key={idx} className="flex items-start gap-3 text-zinc-300">
            <span className="text-emerald-400 mt-1">•</span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

// ============================================
// FILL IN THE BLANK BLOCK
// ============================================
const FillBlankBlock: React.FC<{ block: FillBlankBlockType }> = ({ block }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);

  if (!block.sentence) return null;

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 my-4">
      <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Fill in the Blank</h4>
      <p className="text-lg text-zinc-200 mb-4">{block.sentence.replace('___', '______')}</p>
      <div className="flex gap-3">
        <input
          type="text"
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          placeholder="Your answer..."
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
          disabled={showAnswer}
        />
        <button
          onClick={() => setShowAnswer(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          disabled={showAnswer}
        >
          Check
        </button>
      </div>
      {showAnswer && (
        <div className={`mt-4 p-4 rounded-lg ${userAnswer.toLowerCase().trim() === block.answer?.toLowerCase().trim() ? 'bg-emerald-900/30 border border-emerald-700' : 'bg-red-900/30 border border-red-700'}`}>
          <p className="text-zinc-200">
            <strong>Answer:</strong> {block.answer}
          </p>
          {block.explanation && <p className="text-zinc-400 text-sm mt-2">{block.explanation}</p>}
        </div>
      )}
    </div>
  );
};

// ============================================
// SHORT ANSWER BLOCK
// ============================================
const ShortAnswerBlock: React.FC<{ block: ShortAnswerBlockType }> = ({ block }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);

  if (!block.question) return null;

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 my-4">
      <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Short Answer</h4>
      <p className="text-lg text-zinc-200 mb-4">{block.question}</p>
      <textarea
        value={userAnswer}
        onChange={(e) => setUserAnswer(e.target.value)}
        placeholder="Write your answer..."
        rows={3}
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none resize-none"
        disabled={showAnswer}
      />
      <button
        onClick={() => setShowAnswer(true)}
        className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        disabled={showAnswer}
      >
        Show Expected Answer
      </button>
      {showAnswer && (
        <div className="mt-4 p-4 bg-zinc-950 border border-zinc-700 rounded-lg">
          <p className="text-zinc-300"><strong>Expected:</strong> {block.expectedAnswer}</p>
          {block.explanation && <p className="text-zinc-500 text-sm mt-2">{block.explanation}</p>}
        </div>
      )}
    </div>
  );
};

// ============================================
// REFLECTION BLOCK
// ============================================
const ReflectionBlock: React.FC<{ block: ReflectionBlockType }> = ({ block }) => {
  const [response, setResponse] = useState('');

  if (!block.prompt) return null;

  return (
    <div className="bg-gradient-to-r from-purple-900/20 to-indigo-900/20 rounded-2xl p-6 border border-purple-800/50 my-4">
      <h4 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
        <Icons.Sparkles /> Reflect
      </h4>
      <p className="text-lg text-zinc-200 mb-4">{block.prompt}</p>
      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Take a moment to think and write your thoughts..."
        rows={4}
        className="w-full bg-zinc-950/50 border border-purple-800/50 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none resize-none"
      />
    </div>
  );
};

// ============================================
// MATCH THE FOLLOWING BLOCK
// ============================================
const MatchFollowingBlock: React.FC<{ block: MatchFollowingBlockType }> = ({ block }) => {
  const [matches, setMatches] = useState<Record<number, number>>({});
  const [showAnswers, setShowAnswers] = useState(false);

  // Show placeholder if pairs are missing or empty
  if (!block.pairs || block.pairs.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 my-4">
        <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-2">Match the Following</h4>
        <p className="text-zinc-500 italic">Match content is loading or unavailable...</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 my-4">
      <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Match the Following</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {block.pairs.map((pair, idx) => (
            <div key={idx} className="bg-zinc-800 p-3 rounded-lg text-zinc-200">
              {idx + 1}. {pair.left}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {block.pairs.map((pair, idx) => (
            <div key={idx} className={`bg-zinc-950 p-3 rounded-lg text-zinc-300 border ${showAnswers ? 'border-emerald-600' : 'border-zinc-700'}`}>
              {String.fromCharCode(65 + idx)}. {pair.right}
            </div>
          ))}
        </div>
      </div>
      {!showAnswers && (
        <button
          onClick={() => setShowAnswers(true)}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        >
          Show Answers
        </button>
      )}
      {showAnswers && (
        <div className="mt-4 p-4 bg-emerald-900/20 border border-emerald-700 rounded-lg">
          <p className="text-emerald-300 font-medium">Correct matches:</p>
          <ul className="mt-2 text-zinc-300 text-sm">
            {block.pairs.map((pair, idx) => (
              <li key={idx}>{idx + 1} → {String.fromCharCode(65 + idx)}</li>
            ))}
          </ul>
        </div>
      )}
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
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Use pre-generated audio URL if available
  const preGeneratedAudio = slide.audioUrl;

  // Reset audio state when slide changes
  useEffect(() => {
    // Stop any playing audio
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    setIsPlaying(false);
    setAudioBase64(null);
  }, [slide.id]);

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
      // Stop any playing audio
      stopAudio();
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      }
    } else {
      // Use pre-generated audio if available
      if (preGeneratedAudio) {
        try {
          if (!audioElementRef.current) {
            audioElementRef.current = new Audio(preGeneratedAudio);
            audioElementRef.current.onended = () => setIsPlaying(false);
          }
          audioElementRef.current.currentTime = 0;
          await audioElementRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          console.error("Pre-generated audio playback error", error);
        }
      } else if (!audioBase64) {
        // Fallback to on-demand TTS generation
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
    <div className="flex flex-col h-full overflow-y-auto pb-24">
      {/* Header - Clean, minimal */}
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">{slide.title}</h1>
        <button
          onClick={toggleAudio}
          disabled={audioLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors disabled:opacity-50"
        >
          {audioLoading ? (
            <span className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
          ) : isPlaying ? <Icons.Pause /> : <Icons.Play />}
          <span className="text-sm hidden sm:inline">{isPlaying ? 'Pause' : 'Listen'}</span>
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
            case 'notes_summary':
              return <NotesSummaryBlock key={key} block={block as NotesSummaryBlockType} />;
            case 'fill_blank':
              return <FillBlankBlock key={key} block={block as FillBlankBlockType} />;
            case 'short_answer':
              return <ShortAnswerBlock key={key} block={block as ShortAnswerBlockType} />;
            case 'reflection':
              return <ReflectionBlock key={key} block={block as ReflectionBlockType} />;
            case 'match_following':
              return <MatchFollowingBlock key={key} block={block as MatchFollowingBlockType} />;
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