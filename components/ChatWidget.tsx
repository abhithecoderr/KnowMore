import React, { useState, useRef, useEffect } from 'react';
import { generateChatResponse } from '../services/geminiService';
import { Icons } from '../constants';
import { ChatMessage } from '../types';

interface ChatWidgetProps {
  contextTopic: string;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ contextTopic }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: `Hi! I'm here to help you learn about ${contextTopic}. Ask me anything!`, timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Prepare history for API
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      
      const responseText = await generateChatResponse(history, input);
      
      setMessages(prev => [...prev, {
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'model',
        text: "Sorry, I had trouble connecting. Please try again.",
        timestamp: Date.now()
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      {isOpen && (
        <div className="mb-4 w-80 md:w-96 h-[500px] bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col pointer-events-auto overflow-hidden">
          <div className="p-4 bg-zinc-950 flex justify-between items-center border-b border-zinc-900">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <span className="text-amber-400"><Icons.Brain /></span>
              AI Tutor
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white transition-colors">✕</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-amber-400 text-black' 
                    : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                }`}>
                  {/* Rudimentary Markdown rendering */}
                  {msg.text.split('\n').map((line, i) => (
                     <React.Fragment key={i}>
                       {line.startsWith('- ') ? <div className="ml-2">• {line.substring(2)}</div> : <div>{line}</div>}
                     </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-2xl text-zinc-500 text-sm animate-pulse">Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="p-3 bg-zinc-950 border-t border-zinc-900">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
              <button 
                type="submit" 
                disabled={loading}
                className="bg-amber-400 hover:bg-amber-500 text-black rounded-xl px-4 py-2 disabled:opacity-50 transition-colors"
              >
                <Icons.ArrowRight />
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-amber-400 hover:bg-amber-500 text-black rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 pointer-events-auto"
      >
        {isOpen ? <span className="text-xl">✕</span> : <Icons.MessageCircle />}
      </button>
    </div>
  );
};