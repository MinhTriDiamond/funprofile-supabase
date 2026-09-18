import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Check, X, RefreshCw, Users, ArrowRight, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Json } from '@/integrations/supabase/types';

interface MergeRequest {
  id: string;
  email: string;
  source_platform: string;
  source_user_id: string | null;
  source_username: string | null;
  target_platform: string;
  target_user_id: string | null;
  platform_data: Json;
  status: string;
  merge_type: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  webhook_sent: boolean;
  created_at: string;
}

export function MergeRequestsTab() {
  const [requests, setRequests] = useState<MergeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<MergeRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('pending');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Use edge function to bypass RLS and ensure admin access
      const { data: response, error } = await supabase.functions.invoke('admin-list-merge-requests', {
        body: { status: filter }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (response?.error) {
        console.error('API error:', response.error);
        if (response.error === 'Forbidden - Admin access required') {
          toast.error('Bạn không có quyền admin');
        } else {
          toast.error('Không thể tải danh sách yêu cầu merge');
        }
        return;
      }

      setRequests(response?.data || []);
    } catch (error) {
      console.error('Error fetching merge requests:', error);
      toast.error('Không thể tải danh sách yêu cầu merge');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const handleAction = async () => {
    if (!selectedRequest || !actionType) return;

    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Vui lòng đăng nhập lại');
        return;
      }

      const response = await supabase.functions.invoke('sso-merge-approve', {
        body: {
          request_id: selectedRequest.id,
          action: actionType,
          admin_note: adminNote || undefined
        }
      });

      if (response.error) throw response.error;

      toast.success(
        actionType === 'approve' 
          ? 'Đã approve merge request thành công!' 
          : 'Đã reject merge request'
      );

      setSelectedRequest(null);
      setActionType(null);
      setAdminNote('');
      fetchRequests();
    } catch (error) {
      console.error('Error processing merge request:', error);
      toast.error('Không thể xử lý yêu cầu');
    } finally {
      setProcessing(false);
    }
  };

  const handleResendWebhook = async (requestId: string) => {
    setResending(requestId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Vui lòng đăng nhập lại');
        return;
      }

      const response = await supabase.functions.invoke('sso-resend-webhook', {
        body: { request_id: requestId }
      });

      if (response.error) throw response.error;

      const result = response.data;
      if (result.webhook_sent || result.email_sent) {
        toast.success(
          `Đã gửi lại thành công! Webhook: ${result.webhook_sent ? '✓' : '✗'}, Email: ${result.email_sent ? '✓' : '✗'}`
        );
        fetchRequests();
      } else {
        toast.warning('Không gửi được webhook hoặc email');
      }
    } catch (error) {
      console.error('Error resending webhook:', error);
      toast.error('Không thể gửi lại webhook');
    } finally {
      setResending(null);
    }
  };

  const getMergeTypeBadge = (type: string) => {
    switch (type) {
      case 'both_exist':
        return <Badge variant="secondary">Cả 2 platform</Badge>;
      case 'farm_only':
        return <Badge variant="outline">Chỉ có Farm</Badge>;
      case 'profile_only':
        return <Badge variant="default">Chỉ có Profile</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500">Chờ duyệt</Badge>;
      case 'completed':
        return <Badge className="bg-green-500">Hoàn thành</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Từ chối</Badge>;
      case 'approved':
        return <Badge className="bg-blue-500">Đã duyệt</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getWebhookBadge = (request: MergeRequest) => {
    if (request.status !== 'completed') return null;
    
    if (request.webhook_sent) {
      return <Badge variant="outline" className="text-green-600 border-green-600">✓ Đã gửi webhook</Badge>;
    } else {
      return <Badge variant="outline" className="text-amber-600 border-amber-600">⚠ Chưa gửi webhook</Badge>;
    }
  };

  const formatPlatformData = (data: Json) => {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) return 'Không có dữ liệu';
    return (
      <pre className="text-xs bg-muted p-2 rounded max-h-32 max-w-full overflow-auto whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Yêu cầu Merge User
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={filter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('pending')}
            >
              Chờ duyệt
            </Button>
            <Button
              variant={filter === 'completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('completed')}
            >
              Hoàn thành
            </Button>
            <Button
              variant={filter === 'rejected' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('rejected')}
            >
              Từ chối
            </Button>
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              Tất cả
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchRequests}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Không có yêu cầu merge nào
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Loại Merge</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead>Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{request.email}</div>
                      {request.source_username && (
                        <div className="text-sm text-muted-foreground">
                          @{request.source_username}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-medium">{request.source_platform}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{request.target_platform}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getMergeTypeBadge(request.merge_type)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {getStatusBadge(request.status)}
                      {getWebhookBadge(request)}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(request.created_at).toLocaleDateString('vi-VN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </TableCell>
                  <TableCell>
                    {request.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('approve');
                          }}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('reject');
                          }}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {request.status === 'completed' && !request.webhook_sent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResendWebhook(request.id)}
                            disabled={resending === request.id}
                          >
                            {resending === request.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-1" />
                                Gửi lại
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType(null);
                          }}
                        >
                          Chi tiết
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Detail/Action Dialog */}
        <Dialog 
          open={!!selectedRequest} 
          onOpenChange={(open) => {
            if (!open) {
              setSelectedRequest(null);
              setActionType(null);
              setAdminNote('');
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {actionType === 'approve' && 'Approve Merge Request'}
                {actionType === 'reject' && 'Reject Merge Request'}
                {!actionType && 'Chi tiết Merge Request'}
              </DialogTitle>
              <DialogDescription>
                {selectedRequest?.email}
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Source Platform</div>
                    <div className="font-medium">{selectedRequest.source_platform}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Source User ID</div>
                    <div className="font-mono text-xs">{selectedRequest.source_user_id || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Source Username</div>
                    <div className="font-medium">{selectedRequest.source_username || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Loại Merge</div>
                    <div>{getMergeTypeBadge(selectedRequest.merge_type)}</div>
                  </div>
                  {selectedRequest.target_user_id && (
                    <div className="col-span-2">
                      <div className="text-muted-foreground">Fun Profile User ID</div>
                      <div className="font-mono text-xs">{selectedRequest.target_user_id}</div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-muted-foreground text-sm mb-1">Platform Data</div>
                  {formatPlatformData(selectedRequest.platform_data)}
                </div>

                {selectedRequest.admin_note && (
                  <div>
                    <div className="text-muted-foreground text-sm mb-1">Admin Note</div>
                    <div className="text-sm">{selectedRequest.admin_note}</div>
                  </div>
                )}

                {actionType && (
                  <div>
                    <div className="text-muted-foreground text-sm mb-1">
                      Ghi chú của Admin (tùy chọn)
                    </div>
                    <Textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Nhập ghi chú..."
                      rows={3}
                    />
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {actionType ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActionType(null);
                      setAdminNote('');
                    }}
                    disabled={processing}
                  >
                    Hủy
                  </Button>
                  <Button
                    variant={actionType === 'approve' ? 'default' : 'destructive'}
                    onClick={handleAction}
                    disabled={processing}
                  >
                    {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {actionType === 'approve' ? 'Xác nhận Approve' : 'Xác nhận Reject'}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setSelectedRequest(null)}
                >
                  Đóng
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
