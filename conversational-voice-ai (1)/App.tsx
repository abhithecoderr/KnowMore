
import React, { useRef, useEffect } from 'react';
import { useGeminiLive } from './hooks/useGeminiLive';
import type { AppStatus, ConversationTurn } from './types';
import { BotIcon, MicIcon, StopIcon, UserIcon, VolumeIcon } from './components/icons';

const App: React.FC = () => {
  const { status, transcript, error, start, stop } = useGeminiLive();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const isConversationActive = status === 'listening' || status === 'speaking' || status === 'connecting';

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const getStatusIndicator = () => {
    switch (status) {
      case 'connecting':
        return <div className="text-sm text-blue-400">Connecting...</div>;
      case 'listening':
        return <div className="text-sm text-green-400 flex items-center gap-2">Listening <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span></div>;
      case 'speaking':
        return <div className="text-sm text-purple-400 flex items-center gap-2">Speaking <VolumeIcon className="w-4 h-4" /></div>;
      case 'error':
        return <div className="text-sm text-red-400">Error</div>;
      case 'idle':
      default:
        return <div className="text-sm text-gray-400">Press start to talk</div>;
    }
  };

  const renderTurn = (turn: ConversationTurn, index: number) => (
    <div key={index} className={`flex items-start gap-3 p-4 rounded-lg ${turn.speaker === 'user' ? 'bg-gray-800' : 'bg-gray-800/50'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${turn.speaker === 'user' ? 'bg-blue-600' : 'bg-purple-600'}`}>
        {turn.speaker === 'user' ? <UserIcon className="w-5 h-5 text-white" /> : <BotIcon className="w-5 h-5 text-white" />}
      </div>
      <div className="flex-1 pt-1">
        <p className="font-semibold capitalize">{turn.speaker}</p>
        <p className={`mt-1 text-gray-300 ${!turn.isFinal ? 'opacity-70' : ''}`}>
          {turn.text || '...'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl h-[85vh] flex flex-col bg-gray-800/30 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-100">Conversational AI</h1>
          <div className="h-6 flex items-center">{getStatusIndicator()}</div>
        </header>

        <main className="flex-1 p-4 overflow-y-auto space-y-4">
          {transcript.length === 0 && !isConversationActive && (
             <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                <MicIcon className="w-16 h-16 mb-4"/>
                <p className="text-lg">Your conversation will appear here.</p>
                <p>Click the "Start Conversation" button to begin.</p>
             </div>
          )}
          {transcript.map(renderTurn)}
          <div ref={transcriptEndRef} />
        </main>

        {error && (
          <div className="p-4 bg-red-900/50 text-red-300 border-t border-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        <footer className="p-4 border-t border-gray-700 flex flex-col items-center justify-center">
          <button
            onClick={isConversationActive ? stop : start}
            disabled={status === 'connecting'}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50
              ${isConversationActive ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400' 
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-400'}
              ${status === 'connecting' ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {isConversationActive ? <StopIcon className="w-8 h-8 text-white" /> : <MicIcon className="w-8 h-8 text-white" />}
          </button>
          <p className="mt-3 text-xs text-gray-400">
            {isConversationActive ? 'Stop Conversation' : 'Start Conversation'}
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
