import { useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';

export function isLiveCommentSubmitKey(event: KeyboardEvent<HTMLInputElement>) {
  return event.key === 'Enter' && !event.repeat && !event.nativeEvent.isComposing && event.keyCode !== 229;
}

/** Lock before the first await, and retain any new text typed during the request. */
export function useLiveCommentSubmit(text: string, setText: Dispatch<SetStateAction<string>>, send: (value: string) => Promise<void>) {
  const locked = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const submit = async () => {
    const value = text.trim();
    if (!value || locked.current) return false;
    locked.current = true;
    setIsSending(true);
    try {
      await send(value);
      setText(current => current === text ? '' : current);
      return true;
    } finally {
      locked.current = false;
      setIsSending(false);
    }
  };
  return { isSending, submit };
}
