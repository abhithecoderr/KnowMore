
export type AppStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface ConversationTurn {
  speaker: 'user' | 'model';
  text: string;
  isFinal: boolean;
}
