import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertOctagon } from 'lucide-react';

export function PanelLoading({ span2 }: { span2?: boolean }) {
  return (
    <Card className={span2 ? 'lg:col-span-2' : ''}>
      <CardContent className="flex justify-center p-8">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export function PanelError({ message, span2 }: { message?: string; span2?: boolean }) {
  return (
    <Card className={span2 ? 'lg:col-span-2' : ''}>
      <CardContent className="flex items-start gap-2 p-6 text-sm text-destructive">
        <AlertOctagon className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">Không tải được dữ liệu</p>
          {message && <p className="text-xs opacity-80 mt-0.5 break-all">{message}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
