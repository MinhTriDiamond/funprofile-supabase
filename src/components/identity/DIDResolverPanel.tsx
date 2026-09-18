import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Globe, Copy, ExternalLink, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from '@/hooks/useDID';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const RESOLVER_BASE = `${SUPABASE_URL}/functions/v1/identity-did-resolve`;

export function DIDResolverPanel() {
  const { data: myDid } = useDID();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const targetDid = query.trim() || myDid?.did_id || '';
  const resolverUrl = targetDid ? `${RESOLVER_BASE}?did=${encodeURIComponent(targetDid)}` : '';

  const handleResolve = async () => {
    if (!targetDid) return toast.error('Cần DID để resolve');
    setLoading(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('identity-did-resolve', {
        body: { did: targetDid },
      });
      if (error) throw error;
      setResult(data);
    } catch (e: any) {
      toast.error('Resolve thất bại', { description: e.message });
    } finally { setLoading(false); }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(resolverUrl);
    toast.success('Đã copy URL resolver');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          DID Resolver (W3C)
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Endpoint công khai trả về DID Document chuẩn W3C cho mọi <code className="font-mono">did:fun:*</code>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1.5">
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={myDid?.did_id ?? 'did:fun:...'}
            className="text-xs font-mono" />
          <Button size="sm" onClick={handleResolve} disabled={loading} className="gap-1 shrink-0">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Resolve
          </Button>
        </div>

        {targetDid && (
          <div className="p-2 rounded-md border bg-muted/40 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">Public URL:</p>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copyUrl}>
                  <Copy className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" asChild>
                  <a href={resolverUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
            </div>
            <p className="text-[10px] font-mono break-all">{resolverUrl}</p>
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-[10px]">
                {result.didDocument?.id?.split(':')[2] ?? 'unknown'}
              </Badge>
              {result.funExtension?.did_level && (
                <Badge variant="outline" className="text-[10px]">{result.funExtension.did_level}</Badge>
              )}
              {result.funExtension?.trust?.tier && (
                <Badge variant="outline" className="text-[10px]">{result.funExtension.trust.tier}</Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {result.funExtension?.sbts?.length ?? 0} SBTs
              </Badge>
            </div>
            <pre className="text-[10px] bg-muted/50 p-2 rounded overflow-x-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t">
          <p><strong>W3C compliant:</strong> contentType=application/did+ld+json</p>
          <p><strong>Interop:</strong> Có thể verify từ Ceramic, Veramo, DIF resolver, custom dApp</p>
          <p><strong>Cache:</strong> 60s public CDN cache</p>
        </div>
      </CardContent>
    </Card>
  );
}
