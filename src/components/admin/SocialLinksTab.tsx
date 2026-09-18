import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Search, Download, ChevronDown, ChevronRight, Link2, Users, ExternalLink } from "lucide-react";
import { PLATFORM_PRESETS } from "@/components/profile/SocialLinksEditor";
import { format } from "date-fns";

interface SocialLink {
  platform: string;
  label: string;
  url: string;
  color?: string;
  favicon?: string;
  avatarUrl?: string;
}

interface UserWithLinks {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  created_at: string;
  social_links: SocialLink[];
}

const PLATFORM_KEYS = Object.keys(PLATFORM_PRESETS);

const SocialLinksTab = () => {
  const [users, setUsers] = useState<UserWithLinks[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, is_banned, created_at, social_links")
        .not("social_links", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const filtered = (data || [])
        .map((p) => ({
          ...p,
          social_links: (Array.isArray(p.social_links) ? p.social_links : []) as unknown as SocialLink[],
        }))
        .filter((p) => p.social_links.length > 0);

      setUsers(filtered);
    } catch (err) {
      console.error("SocialLinksTab error:", err);
      toast.error("Lỗi tải dữ liệu social links");
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    let result = users;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.username?.toLowerCase().includes(q) ||
          u.full_name?.toLowerCase().includes(q)
      );
    }
    if (platformFilter) {
      result = result.filter((u) =>
        u.social_links.some((l) => l.platform === platformFilter)
      );
    }
    return result;
  }, [users, search, platformFilter]);

  const totalLinks = useMemo(
    () => users.reduce((sum, u) => sum + u.social_links.length, 0),
    [users]
  );

  const platformStats = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) =>
      u.social_links.forEach((l) => {
        counts[l.platform] = (counts[l.platform] || 0) + 1;
      })
    );
    return counts;
  }, [users]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCSV = () => {
    const rows = [["Username", "Họ tên", "Số link", "Platforms", "URLs", "Trạng thái", "Ngày tạo"]];
    filteredUsers.forEach((u) => {
      rows.push([
        u.username,
        u.full_name || "",
        String(u.social_links.length),
        u.social_links.map((l) => l.platform).join(", "),
        u.social_links.map((l) => l.url).join(", "),
        u.is_banned ? "Banned" : "Active",
        format(new Date(u.created_at), "dd/MM/yyyy"),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `social-links-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã xuất CSV");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold uppercase tracking-wide text-primary">
        Danh sách những user đã liên kết với các platform
      </h2>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">User đã liên kết</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng số link</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLinks}</div>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Theo platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_KEYS.map((p) => {
                const preset = PLATFORM_PRESETS[p];
                const count = platformStats[p] || 0;
                if (count === 0) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(platformFilter === p ? null : p)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                      platformFilter === p
                        ? "ring-2 ring-primary bg-primary/10"
                        : "hover:bg-muted"
                    }`}
                  >
                    <img src={preset.favicon} alt="" className="w-4 h-4 rounded-full" />
                    <span>{preset.label}</span>
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {count}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Export */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm username hoặc họ tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {platformFilter && (
          <Button variant="ghost" size="sm" onClick={() => setPlatformFilter(null)}>
            Bỏ lọc: {PLATFORM_PRESETS[platformFilter]?.label}
            <span className="ml-1">✕</span>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 ml-auto">
          <Download className="w-4 h-4" />
          Xuất CSV
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>User</TableHead>
                <TableHead>Họ tên</TableHead>
                <TableHead className="text-center">Số link</TableHead>
                <TableHead>Platforms</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Không tìm thấy user nào
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  const isExpanded = expandedRows.has(user.id);
                  return (
                    <Collapsible key={user.id} open={isExpanded} onOpenChange={() => toggleRow(user.id)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="cursor-pointer">
                            <TableCell>
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </TableCell>
                            <TableCell>
                              <div
                                className="flex items-center gap-2 cursor-pointer group"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/profile/${user.id}`);
                                }}
                              >
                                <img
                                  src={user.avatar_url || "/default-avatar.png"}
                                  alt=""
                                  className="w-8 h-8 rounded-full object-cover hover:ring-2 hover:ring-primary transition-all"
                                />
                                <span className="font-medium group-hover:text-primary group-hover:underline transition-colors">{user.username}</span>
                              </div>
                            </TableCell>
                            <TableCell>{user.full_name || "—"}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{user.social_links.length}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {user.social_links.map((l, i) => (
                                  <img
                                    key={i}
                                    src={PLATFORM_PRESETS[l.platform]?.favicon || l.favicon}
                                    alt={l.platform}
                                    className="w-5 h-5 rounded-full"
                                    title={PLATFORM_PRESETS[l.platform]?.label || l.platform}
                                  />
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(user.created_at), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell>
                              {user.is_banned ? (
                                <Badge variant="destructive">Banned</Badge>
                              ) : (
                                <Badge variant="secondary">Active</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={6}>
                              <div className="py-2 space-y-2">
                                {user.social_links.map((link, i) => {
                                  const preset = PLATFORM_PRESETS[link.platform];
                                  return (
                                    <div key={i} className="flex items-center gap-3 text-sm">
                                      <img
                                        src={link.avatarUrl || preset?.favicon || link.favicon}
                                        alt=""
                                        className="w-6 h-6 rounded-full"
                                      />
                                      <span className="font-medium min-w-[80px]">
                                        {preset?.label || link.platform}
                                      </span>
                                      <span className="text-muted-foreground">{link.label}</span>
                                      <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline flex items-center gap-1 truncate max-w-md"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {link.url}
                                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                      </a>
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SocialLinksTab;
