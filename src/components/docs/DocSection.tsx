import React from 'react';
import { cn } from '@/lib/utils';

interface DocSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const DocSection: React.FC<DocSectionProps> = ({ id, title, children, className }) => {
  return (
    <section id={id} className={cn("scroll-mt-20 py-8 border-b border-border last:border-0", className)}>
      <h2 className="text-2xl font-bold text-foreground mb-6">{title}</h2>
      <div className="prose prose-slate dark:prose-invert max-w-none">
        {children}
      </div>
    </section>
  );
};

interface DocSubSectionProps {
  title: string;
  children: React.ReactNode;
}

export const DocSubSection: React.FC<DocSubSectionProps> = ({ title, children }) => {
  return (
    <div className="mt-6">
      <h3 className="text-xl font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
};

interface DocParagraphProps {
  children: React.ReactNode;
}

export const DocParagraph: React.FC<DocParagraphProps> = ({ children }) => {
  return <p className="text-muted-foreground leading-relaxed mb-4">{children}</p>;
};

interface DocListProps {
  items: string[];
  ordered?: boolean;
}

export const DocList: React.FC<DocListProps> = ({ items, ordered = false }) => {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={cn("mb-4 space-y-2", ordered ? "list-decimal" : "list-disc", "list-inside")}>
      {items.map((item, index) => (
        <li key={index} className="text-muted-foreground">{item}</li>
      ))}
    </Tag>
  );
};

interface DocTableProps {
  headers: string[];
  rows: string[][];
}

export const DocTable: React.FC<DocTableProps> = ({ headers, rows }) => {
  return (
    <div className="my-4 -mx-2 px-2 overflow-x-auto">
      <table className="w-full min-w-[400px] border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-border bg-muted/50">
            {headers.map((header, index) => (
              <th key={index} className="px-2 sm:px-4 py-2 text-left font-semibold text-foreground whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/50 hover:bg-muted/30">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 sm:px-4 py-2 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface DocAlertProps {
  type: 'info' | 'warning' | 'success';
  children: React.ReactNode;
}

export const DocAlert: React.FC<DocAlertProps> = ({ type, children }) => {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200',
  };

  return (
    <div className={cn("border rounded-lg p-4 my-4", styles[type])}>
      {children}
    </div>
  );
};
