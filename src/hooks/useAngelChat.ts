import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/angel-chat`;

interface StreamChatOptions {
  message: string;
  onDelta: (deltaText: string) => void;
  onDone: () => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

async function streamChat({ message, onDelta, onDone, onError, signal }: StreamChatOptions) {
  try {
    // Get user's session token for authenticated requests
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
      signal,
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP error ${resp.status}`;
      
      if (resp.status === 429) {
        throw new Error("ANGEL AI đang bận, vui lòng thử lại sau ít phút ạ! 🙏");
      }
      if (resp.status === 402) {
        throw new Error("Cần nạp thêm credits cho ANGEL AI ạ! 💫");
      }
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("API Key không hợp lệ, vui lòng kiểm tra lại ạ! 🔑");
      }
      throw new Error(errorMessage);
    }

    if (!resp.body) {
      throw new Error("No response body");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      
      textBuffer += decoder.decode(value, { stream: true });

      // Process line-by-line as data arrives
      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1); // handle CRLF
        if (line.startsWith(":") || line.trim() === "") continue; // SSE comments/keepalive
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          // Support multiple response formats
          const content = parsed.content || parsed.text || parsed.delta?.content || parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          // Incomplete JSON split across chunks: put it back and wait for more data
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Final flush in case remaining buffered lines arrived without trailing newline
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.content || parsed.text || parsed.delta?.content || parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          /* ignore partial leftovers */
        }
      }
    }

    onDone();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // Request was cancelled, don't treat as error
      onDone();
      return;
    }
    onError?.(error instanceof Error ? error : new Error("Unknown error"));
  }
}

export const useAngelChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMsg: Message = { role: 'user', content: content.trim() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let assistantContent = '';
    abortControllerRef.current = new AbortController();

    const upsertAssistant = (nextChunk: string) => {
      assistantContent += nextChunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          // Replace content of the last assistant message
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
        }
        // First assistant token: create the assistant message
        return [...prev, { role: 'assistant', content: assistantContent }];
      });
    };

    await streamChat({
      message: content.trim(),
      onDelta: upsertAssistant,
      onDone: () => {
        setIsLoading(false);
        abortControllerRef.current = null;
      },
      onError: (error) => {
        setIsLoading(false);
        abortControllerRef.current = null;
        toast.error(error.message || "Có lỗi khi kết nối với ANGEL AI ạ! 🙏");
        // Remove the user message if no response was received
        if (!assistantContent) {
          setMessages(prev => prev.slice(0, -1));
        }
      },
      signal: abortControllerRef.current.signal,
    });
  }, [isLoading]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    clearMessages,
    cancelRequest,
  };
};
