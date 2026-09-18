import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { findAdminItem } from "@/config/adminNav";
import { invalidateAdminData } from "@/hooks/useAdminUsers";
import { toast } from "sonner";

export function AdminTopHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const slug = useMemo(
    () => pathname.replace(/^\/admin\/?/, "").replace(/\/$/, "") || "overview",
    [pathname],
  );
  const found = findAdminItem(slug);

  const handleRefresh = () => {
    invalidateAdminData();
    toast.success("Đã làm mới dữ liệu admin");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />

      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          <BreadcrumbItem>
            <BreadcrumbLink
              onClick={(e) => {
                e.preventDefault();
                navigate("/admin/overview");
              }}
              className="cursor-pointer"
            >
              Admin
            </BreadcrumbLink>
          </BreadcrumbItem>
          {found && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="hidden sm:inline-flex">
                <span className="text-muted-foreground">{found.group.label}</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate">{found.item.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="h-8 gap-1.5 px-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Làm mới</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="h-8 gap-1.5 px-2 text-xs"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Thoát</span>
        </Button>
      </div>
    </header>
  );
}

export default AdminTopHeader;
