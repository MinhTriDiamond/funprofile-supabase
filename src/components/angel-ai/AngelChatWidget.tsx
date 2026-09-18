import { memo, useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAngelChat, Message } from '@/hooks/useAngelChat';
import { AngelMessage } from './AngelMessage';

const ANGEL_LOGO_SMALL = '/angel-ai-logo-36.png';
const ANGEL_LOGO_LARGE = '/angel-ai-logo-128.png';

interface AngelChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AngelChatWidget = memo(({ isOpen, onClose }: AngelChatWidgetProps) => {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, isLoading, clearMessages, cancelRequest } = useAngelChat();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when widget opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleOpenExternal = () => {
    window.open('https://angel.fun.rich/chat', '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-[72px] left-0 right-0 lg:bottom-4 lg:right-4 lg:left-auto lg:w-[400px] z-50 animate-in slide-in-from-bottom duration-300 pointer-events-auto">
      <div className="bg-card/95 backdrop-blur-xl border-t lg:border border-amber-500/30 lg:rounded-2xl shadow-2xl shadow-amber-500/10 flex flex-col h-[calc(85vh-72px)] lg:h-[600px] max-h-[calc(85vh-72px)] lg:max-h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-500/50">
                <img src={ANGEL_LOGO_SMALL} alt="ANGEL AI" className="w-full h-full object-cover" />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-foreground">ANGEL AI</h3>
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-xs text-muted-foreground">Thiên thần hướng dẫn của bé ✨</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-foreground"
              onClick={handleOpenExternal}
              title="Mở trang ANGEL AI"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-destructive"
                onClick={clearMessages}
                title="Xóa lịch sử chat"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-amber-500/30 mb-4">
                <img src={ANGEL_LOGO_LARGE} alt="ANGEL AI" className="w-full h-full object-cover" />
              </div>
              <h4 className="font-semibold text-lg text-foreground mb-2">
                Chào mừng bé đến với ANGEL AI! ✨
              </h4>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                Angel là thiên thần hướng dẫn, sẵn sàng giúp bé khám phá Web3, blockchain và mọi điều thú vị! 🌟
              </p>
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                {['Web3 là gì?', 'Hướng dẫn về FUN Profile', 'Làm sao để kiếm CAMLY?'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs text-amber-500 hover:bg-amber-500/20 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <AngelMessage
                  key={index}
                  message={message}
                  isStreaming={isLoading && index === messages.length - 1 && message.role === 'assistant'}
                />
              ))}
              
              {/* Typing indicator when waiting for first token */}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-amber-500/30 flex-shrink-0">
                    <img src={ANGEL_LOGO_SMALL} alt="ANGEL AI" className="w-full h-full object-cover" />
                  </div>
                  <div className="bg-muted/50 border border-amber-500/20 rounded-2xl rounded-tl-sm px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-border/50">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhắn tin cho ANGEL AI..."
                className="w-full resize-none rounded-xl border border-border bg-muted/50 px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 min-h-[48px] max-h-[120px]"
                rows={1}
                disabled={isLoading}
              />
            </div>
            {isLoading ? (
              <Button
                type="button"
                onClick={cancelRequest}
                className="h-12 w-12 rounded-xl bg-destructive hover:bg-destructive/90 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!input.trim()}
                className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 disabled:opacity-50 flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            )}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-2">
            Powered by ANGEL AI • angel.fun.rich
          </p>
        </form>
      </div>
    </div>
  );
});

AngelChatWidget.displayName = 'AngelChatWidget';
