import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Construction } from "lucide-react";

export interface RoadmapItem {
  label: string;
  done?: boolean;
}

interface ComingSoonPanelProps {
  title: string;
  description?: string;
  /** Hiển thị card roadmap thay vì placeholder rỗng. */
  roadmap?: {
    status?: string;
    completed?: RoadmapItem[];
    next?: RoadmapItem[];
  };
}

/**
 * Placeholder cho item trong sidebar chưa có panel thật.
 * Khi có `roadmap`, hiển thị thẻ Roadmap (Completed / Next) thay vì khoảng trắng.
 */
const ComingSoonPanel = ({ title, description, roadmap }: ComingSoonPanelProps) => {
  if (!roadmap) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="rounded-full bg-muted p-3">
            <Construction className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {description ??
                "Module này đang được phát triển. Chưa hoạt động — chỉ là chỗ giữ trong menu để dễ tìm sau khi triển khai."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {roadmap.status && (
          <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
            {roadmap.status}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        {roadmap.completed && roadmap.completed.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Completed
            </p>
            <ul className="space-y-1.5">
              {roadmap.completed.map((it) => (
                <li key={it.label} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-foreground">{it.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {roadmap.next && roadmap.next.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Next
            </p>
            <ul className="space-y-1.5">
              {roadmap.next.map((it) => (
                <li key={it.label} className="flex items-start gap-2 text-sm">
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{it.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
};

export default ComingSoonPanel;
