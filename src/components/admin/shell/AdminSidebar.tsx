import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, Search, Shield } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ADMIN_NAV,
  findAdminItem,
  type AdminNavGroup,
  type AdminNavItem,
} from "@/config/adminNav";
import { cn } from "@/lib/utils";
import StatusPill from "./StatusPill";
import { useAdminGroupStatus } from "./useAdminGroupStatus";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function filterGroups(groups: AdminNavGroup[], q: string): AdminNavGroup[] {
  if (!q.trim()) return groups;
  const needle = normalize(q.trim());
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          normalize(i.label).includes(needle) ||
          normalize(i.slug).includes(needle) ||
          normalize(g.label).includes(needle),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const status = useAdminGroupStatus();

  const groups = useMemo(() => filterGroups(ADMIN_NAV, query), [query]);

  // Exact-match để parent (vd `federation`) không sáng cùng child (`federation/backfill`).
  const isActive = (slug: string) => pathname === `/admin/${slug}`;

  // Active group id — dò theo slug dài nhất khớp pathname.
  const activeGroupId = useMemo(() => {
    const rest = pathname.replace(/^\/admin\/?/, "").replace(/\/$/, "") || "overview";
    // thử full path trước, rồi cắt dần segment
    const segs = rest.split("/");
    for (let i = segs.length; i > 0; i--) {
      const candidate = segs.slice(0, i).join("/");
      const f = findAdminItem(candidate);
      if (f) return f.group.id;
    }
    return "dashboard";
  }, [pathname]);

  // State open/close mỗi nhóm
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    [activeGroupId]: true,
  }));

  // Khi route đổi → mở nhóm active, không đóng các nhóm user đã mở thủ công
  useEffect(() => {
    setOpenGroups((prev) => ({ ...prev, [activeGroupId]: true }));
  }, [activeGroupId]);

  // Khi có search → override: tất cả nhóm match đều mở
  const searching = query.trim().length > 0;

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-1 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Shield className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Admin Console</p>
              <p className="truncate text-[11px] text-muted-foreground">FUN Profile</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="relative px-1 pb-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm trong menu..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => {
          const open = searching ? true : !!openGroups[group.id];
          const groupActive = group.items.some((i) => isActive(i.slug));

          // Khi sidebar collapsed: bỏ accordion, render phẳng (chỉ icon)
          if (collapsed) {
            return (
              <SidebarGroup key={group.id}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <AdminMenuItem
                        key={item.slug}
                        item={item}
                        active={isActive(item.slug)}
                        collapsed
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          const GroupIcon = group.icon;
          return (
            <SidebarGroup
              key={group.id}
              className={cn(
                "py-0.5",
                // separator phía trên mỗi group (trừ group đầu tiên)
                "border-t border-sidebar-border/60 first:border-t-0 mt-1 first:mt-0 pt-1 first:pt-0",
              )}
            >
              <Collapsible
                open={open}
                onOpenChange={(v) =>
                  setOpenGroups((prev) => ({ ...prev, [group.id]: v }))
                }
              >
                <CollapsibleTrigger
                  className={cn(
                    "group/header relative flex w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors",
                    "min-h-[40px] py-2",
                    "text-foreground/70 hover:bg-sidebar-accent/70 hover:text-foreground",
                    groupActive &&
                      "bg-sidebar-accent text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-primary",
                  )}
                >
                  <GroupIcon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 opacity-80",
                      groupActive && "text-primary opacity-100",
                    )}
                  />
                  <span className="truncate">{group.label}</span>
                  {group.statusKey && (
                    <StatusPill
                      level={status.groups[group.statusKey]}
                      mock
                      className="ml-1"
                    />
                  )}
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0 opacity-60 transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <AdminMenuItem
                          key={item.slug}
                          item={item}
                          active={isActive(item.slug)}
                          collapsed={false}
                        />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroup>
          );
        })}

        {groups.length === 0 && !collapsed && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Không tìm thấy mục nào.
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

function AdminMenuItem({
  item,
  active,
  collapsed,
}: {
  item: AdminNavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <NavLink
          to={`/admin/${item.slug}`}
          aria-label={item.label}
          className={cn(
            "flex items-center text-[13px] font-normal",
            collapsed ? "justify-center gap-0" : "gap-2 pl-6",
            item.status === "coming-soon" && "text-muted-foreground",
            active && "font-medium",
          )}
        >
          <Icon
            className={cn(
              "shrink-0 opacity-80",
              collapsed ? "h-[18px] w-[18px]" : "h-[15px] w-[15px]",
              active && "opacity-100",
            )}
          />
          {!collapsed && (
            <>
              <span className="truncate">{item.label}</span>
              {item.status === "coming-soon" && (
                <Badge
                  variant="outline"
                  className="ml-auto h-4 px-1.5 text-[9px] font-normal uppercase tracking-wide"
                >
                  Soon
                </Badge>
              )}
            </>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}


export default AdminSidebar;
