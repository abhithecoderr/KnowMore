/**
 * KnowMore - Article View
 * Single scrollable article with AI chat pane
 */

import React from 'react';
import { Article, ChatMessage } from '../types';
import { Icons } from '../constants';
import { generateChatResponse } from '../services/geminiService';

interface ArticleViewProps {
  article: Article;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  isChatLoading: boolean;
  setIsChatLoading: React.Dispatch<React.SetStateAction<boolean>>;
  showChatPane: boolean;
  setShowChatPane: React.Dispatch<React.SetStateAction<boolean>>;
  onBack: () => void;
}

export function ArticleView({
  article,
  chatMessages,
  setChatMessages,
  chatInput,
  setChatInput,
  isChatLoading,
  setIsChatLoading,
  showChatPane,
  setShowChatPane,
  onBack,
}: ArticleViewProps) {

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    setChatMessages(prev => [...prev, { role: 'user', text: chatInput, timestamp: Date.now() }]);
    const input = chatInput;
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await generateChatResponse(
        chatMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        `Article: ${article.title}. Question: ${input}`
      );
      setChatMessages(prev => [...prev, { role: 'model', text: response, timestamp: Date.now() }]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="h-screen bg-zinc-950 flex overflow-hidden">
      {/* Main Article Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800 px-8 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
              <Icons.ArrowLeft /> Back
            </button>
            <button
              onClick={() => setShowChatPane(!showChatPane)}
              className={`p-2 rounded-lg transition-colors ${showChatPane ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
            >
              <Icons.MessageCircle />
            </button>
          </div>
        </div>

        {/* Article Content */}
        <article className="max-w-4xl mx-auto px-8 py-12">
          <header className="mb-12 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">{article.title}</h1>
            <p className="text-xl text-zinc-400">{article.overview}</p>
          </header>

          {article.sections.map((section) => (
            <section key={section.id} className="mb-12">
              <h2 className="text-2xl font-semibold text-amber-400 mb-4">{section.title}</h2>
              {section.imageUrl && (
                <div className="mb-6 rounded-xl overflow-hidden max-w-md">
                  <img src={section.imageUrl} alt={section.title} className="w-full max-h-[200px] object-cover" />
                </div>
              )}
              <div className="prose prose-invert prose-lg max-w-none">
                {section.content.split('\n\n').map((para, pIdx) => (
                  <p key={pIdx} className="text-zinc-300 leading-relaxed mb-4">{para}</p>
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>

      {/* Chat Pane */}
      {showChatPane && (
        <div className="w-[380px] border-l border-zinc-800 bg-zinc-950 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="font-semibold text-zinc-200 flex items-center gap-2"><Icons.MessageCircle /> AI Assistant</h3>
            <button onClick={() => setShowChatPane(false)} className="text-zinc-500 hover:text-white"><Icons.X /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center text-zinc-600 text-sm py-8">Ask me anything about this article!</div>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === 'user' ? 'bg-amber-400 text-black' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'}`}>{msg.text}</div>
              </div>
            ))}
          </div>
          <form onSubmit={handleChatSubmit} className="p-3 bg-zinc-950 border-t border-zinc-900">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a question..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <button type="submit" disabled={isChatLoading} className="bg-amber-400 hover:bg-amber-500 text-black rounded-xl px-3 py-2 disabled:opacity-50"><Icons.ArrowRight /></button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default ArticleView;
