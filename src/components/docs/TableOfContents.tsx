import React from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TocItem {
  id: string;
  title: string;
  level?: number;
}

interface TableOfContentsProps {
  items: TocItem[];
  activeId?: string;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({ items, activeId }) => {
  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="sticky top-20">
      <h4 className="font-semibold text-foreground mb-4 px-3">Mục Lục</h4>
      <ScrollArea className="h-[calc(100vh-160px)]">
        <div className="space-y-1 pr-4">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              className={cn(
                "block w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                item.level === 2 && "pl-6",
                activeId === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.title}
            </button>
          ))}
        </div>
      </ScrollArea>
    </nav>
  );
};