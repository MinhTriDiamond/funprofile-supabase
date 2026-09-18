/**
 * Curated GIF collection — public Giphy URLs (no API key needed).
 * Each entry has a tag array for search filtering.
 */

export interface CuratedGif {
  url: string;
  tags: string[];
  alt: string;
}

export const CURATED_GIFS: CuratedGif[] = [
  // Reactions - Happy
  { url: 'https://i.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', tags: ['happy', 'dance', 'celebrate'], alt: 'Happy dance' },
  { url: 'https://i.giphy.com/media/3o7TKu8RvQuomFfUUU/giphy.gif', tags: ['happy', 'excited', 'yes'], alt: 'Excited yes' },
  { url: 'https://i.giphy.com/media/5GoVLqeAOo6PK/giphy.gif', tags: ['happy', 'excited', 'yay'], alt: 'Yay excited' },
  { url: 'https://i.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif', tags: ['happy', 'celebrate', 'party'], alt: 'Party celebrate' },
  { url: 'https://i.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif', tags: ['happy', 'celebrate', 'confetti'], alt: 'Confetti celebration' },
  // Reactions - Love
  { url: 'https://i.giphy.com/media/3oEjI4sFlp73fvEYgw/giphy.gif', tags: ['love', 'heart', 'romance'], alt: 'Heart love' },
  { url: 'https://i.giphy.com/media/l4pTdcifPZLpDjL1e/giphy.gif', tags: ['love', 'heart', 'cute'], alt: 'Cute heart' },
  { url: 'https://i.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif', tags: ['love', 'kiss', 'romance'], alt: 'Blowing kiss' },
  { url: 'https://i.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif', tags: ['love', 'hug', 'cute'], alt: 'Warm hug' },
  { url: 'https://i.giphy.com/media/M90mJvfWfd5mbUuULX/giphy.gif', tags: ['love', 'heart', 'thank'], alt: 'Thank you heart' },
  // Reactions - Laugh
  { url: 'https://i.giphy.com/media/10JhviFuU2gWD6/giphy.gif', tags: ['laugh', 'funny', 'lol'], alt: 'LOL laugh' },
  { url: 'https://i.giphy.com/media/Q7ozWVYCR0nyW2rvPW/giphy.gif', tags: ['laugh', 'funny', 'haha'], alt: 'Haha funny' },
  { url: 'https://i.giphy.com/media/3oEjHAUOqG3lSS0f1C/giphy.gif', tags: ['laugh', 'rofl', 'funny'], alt: 'ROFL' },
  { url: 'https://i.giphy.com/media/ZqlvCTNHpqrio/giphy.gif', tags: ['laugh', 'funny', 'lmao'], alt: 'Laughing hard' },
  { url: 'https://i.giphy.com/media/xUA7aM09ByyR1w5YWc/giphy.gif', tags: ['laugh', 'comedy', 'hilarious'], alt: 'Comedy laugh' },
  // Reactions - Sad
  { url: 'https://i.giphy.com/media/d2lcHJTG5Tscg/giphy.gif', tags: ['sad', 'cry', 'tears'], alt: 'Crying sad' },
  { url: 'https://i.giphy.com/media/OPU6wzx8JrHna/giphy.gif', tags: ['sad', 'disappointed', 'sigh'], alt: 'Disappointed sigh' },
  { url: 'https://i.giphy.com/media/3o6wrvdHFbwBrUFenu/giphy.gif', tags: ['sad', 'cry', 'upset'], alt: 'Upset crying' },
  // Reactions - Wow
  { url: 'https://i.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif', tags: ['wow', 'surprised', 'shock'], alt: 'Surprised wow' },
  { url: 'https://i.giphy.com/media/3kzJvEciJa94SMW3hN/giphy.gif', tags: ['wow', 'amazing', 'impressed'], alt: 'Impressed wow' },
  { url: 'https://i.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', tags: ['wow', 'mindblown', 'shock'], alt: 'Mind blown' },
  // Reactions - Angry
  { url: 'https://i.giphy.com/media/l1J9u3TZfpmeDLkD6/giphy.gif', tags: ['angry', 'mad', 'frustrated'], alt: 'Frustrated angry' },
  { url: 'https://i.giphy.com/media/l4FGGafcOHBRc1WZq/giphy.gif', tags: ['angry', 'rage', 'furious'], alt: 'Rage mode' },
  // Greetings
  { url: 'https://i.giphy.com/media/3ornk57KwDXf81rjWM/giphy.gif', tags: ['hi', 'hello', 'wave', 'greet'], alt: 'Wave hello' },
  { url: 'https://i.giphy.com/media/xUPGGDNsLvqsBOhuU0/giphy.gif', tags: ['hi', 'hello', 'hey'], alt: 'Hey there' },
  { url: 'https://i.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif', tags: ['hi', 'wave', 'greeting'], alt: 'Friendly wave' },
  { url: 'https://i.giphy.com/media/3oEjI5VtIhHvK37WYo/giphy.gif', tags: ['bye', 'goodbye', 'wave'], alt: 'Goodbye wave' },
  // Thumbs up / Approval
  { url: 'https://i.giphy.com/media/111ebonMs90YLu/giphy.gif', tags: ['thumbsup', 'approve', 'yes', 'ok'], alt: 'Thumbs up' },
  { url: 'https://i.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif', tags: ['thumbsup', 'great', 'nice'], alt: 'Great job' },
  { url: 'https://i.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif', tags: ['clap', 'bravo', 'applause'], alt: 'Applause' },
  // Animals
  { url: 'https://i.giphy.com/media/mlvseq9yvZhba/giphy.gif', tags: ['cat', 'cute', 'animal'], alt: 'Cute cat' },
  { url: 'https://i.giphy.com/media/4Zo41lhzKt6iZ8xff9/giphy.gif', tags: ['dog', 'cute', 'animal'], alt: 'Cute dog' },
  { url: 'https://i.giphy.com/media/BzyTuYCmvSORqs1ABM/giphy.gif', tags: ['cat', 'typing', 'work'], alt: 'Cat typing' },
  { url: 'https://i.giphy.com/media/ICOgUNjpvO0PC/giphy.gif', tags: ['dog', 'happy', 'animal'], alt: 'Happy dog' },
  // Think / Confused
  { url: 'https://i.giphy.com/media/a5viI92PAF89q/giphy.gif', tags: ['think', 'thinking', 'hmm'], alt: 'Thinking' },
  { url: 'https://i.giphy.com/media/3o7TKTDn976rzVgky4/giphy.gif', tags: ['think', 'confused', 'what'], alt: 'Confused thinking' },
  { url: 'https://i.giphy.com/media/lkdH8FmImcGoylv3t3/giphy.gif', tags: ['think', 'calculating', 'math'], alt: 'Calculating' },
  // Food
  { url: 'https://i.giphy.com/media/nKFXQkxLRiEhy/giphy.gif', tags: ['food', 'eat', 'hungry', 'pizza'], alt: 'Eating pizza' },
  { url: 'https://i.giphy.com/media/gw3IWyGkC0rsazTi/giphy.gif', tags: ['food', 'eat', 'delicious'], alt: 'Delicious food' },
  // Thank you
  { url: 'https://i.giphy.com/media/3oEdva9BUHPIs2SkGk/giphy.gif', tags: ['thanks', 'thank', 'grateful'], alt: 'Thank you' },
  { url: 'https://i.giphy.com/media/osjgQPWRx3cac/giphy.gif', tags: ['thanks', 'bow', 'respect'], alt: 'Bow thank you' },
  // Cool / Sunglasses
  { url: 'https://i.giphy.com/media/62PP2yEIAZF6g/giphy.gif', tags: ['cool', 'sunglasses', 'deal'], alt: 'Deal with it' },
  { url: 'https://i.giphy.com/media/3o85xIO33l7RlmLR4I/giphy.gif', tags: ['cool', 'mic', 'drop'], alt: 'Mic drop' },
  // Facepalm / Cringe
  { url: 'https://i.giphy.com/media/XsUtdIeJ0MWMo/giphy.gif', tags: ['facepalm', 'cringe', 'omg'], alt: 'Facepalm' },
  { url: 'https://i.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif', tags: ['facepalm', 'really', 'sigh'], alt: 'Really facepalm' },
  // Shrug
  { url: 'https://i.giphy.com/media/JRhS6WoswF8FxE0g2R/giphy.gif', tags: ['shrug', 'idk', 'whatever'], alt: 'Shrug IDK' },
  // Fire / Lit
  { url: 'https://i.giphy.com/media/l0IykG0AM7911MrCM/giphy.gif', tags: ['fire', 'lit', 'hot', 'flame'], alt: 'Fire lit' },
  { url: 'https://i.giphy.com/media/26BRzozg4TCBXv6QU/giphy.gif', tags: ['fire', 'burn', 'hot'], alt: 'Hot fire' },
  // Money
  { url: 'https://i.giphy.com/media/l0HFkA6omUyjVYqw8/giphy.gif', tags: ['money', 'rich', 'cash'], alt: 'Money rain' },
  { url: 'https://i.giphy.com/media/67ThRZlYBvibtdF9JH/giphy.gif', tags: ['money', 'crypto', 'bitcoin'], alt: 'Crypto money' },
  // Popcorn
  { url: 'https://i.giphy.com/media/pUeXcg80cO8I8/giphy.gif', tags: ['popcorn', 'watching', 'drama'], alt: 'Eating popcorn' },
];

/**
 * Get all unique tags from curated GIFs
 */
export function getGifTags(): string[] {
  const tagSet = new Set<string>();
  CURATED_GIFS.forEach(gif => gif.tags.forEach(t => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

/**
 * Search GIFs by query (matches against tags and alt text)
 */
export function searchGifs(query: string): CuratedGif[] {
  if (!query.trim()) return CURATED_GIFS;
  const q = query.toLowerCase().trim();
  return CURATED_GIFS.filter(
    gif => gif.tags.some(t => t.includes(q)) || gif.alt.toLowerCase().includes(q)
  );
}
