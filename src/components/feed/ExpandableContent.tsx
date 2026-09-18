import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { linkifyText } from '@/utils/linkifyText';


interface ExpandableContentProps {
  content: string;
  maxLength?: number;
  maxLines?: number;
  className?: string;
  renderText?: (text: string) => React.ReactNode;
}

export const ExpandableContent = ({ 
  content, 
  maxLength = 300, 
  maxLines = 5,
  className,
  renderText,
}: ExpandableContentProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useLanguage();
  // Check if content exceeds limits
  const lineCount = content.split('\n').length;
  const isLongContent = content.length > maxLength || lineCount > maxLines;

  // If content is short, just render it directly
  const render = renderText || linkifyText;

  if (!isLongContent) {
    return (
      <div className={cn("", className)}>
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed select-text cursor-text">
          {render(content)}
        </p>
      </div>
    );
  }

  // Truncate content for collapsed view
  const getTruncatedContent = () => {
    const lines = content.split('\n');
    
    // If too many lines, truncate by lines first
    if (lines.length > maxLines) {
      const truncatedByLines = lines.slice(0, maxLines).join('\n');
      // Also check character limit on truncated lines
      if (truncatedByLines.length > maxLength) {
        return truncatedByLines.substring(0, maxLength);
      }
      return truncatedByLines;
    }
    
    // Otherwise truncate by character count
    return content.substring(0, maxLength);
  };

  const truncatedContent = getTruncatedContent();

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          !isExpanded && "max-h-[200px]"
        )}
      >
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed select-text cursor-text">
          {isExpanded ? render(content) : render(truncatedContent)}
          {!isExpanded && (
            <span className="text-muted-foreground">...</span>
          )}
        </p>
      </div>
      
      {/* See More / Show Less Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "font-bold text-[15px] transition-colors duration-200 min-h-[44px] px-1",
          "text-amber-500 hover:text-amber-400 active:text-amber-600",
          "select-none touch-manipulation"
        )}
        style={{
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {isExpanded ? t('seeLess') : t('seeMore')}
      </button>

    </div>
  );
};

