# 🎨 UI Patterns - Các Mẫu Giao Diện Phổ Biến

> Copy-paste code patterns để xây dựng UI nhanh chóng và nhất quán với Fun Profile.

---

## 📖 Mục Lục

1. [Card Grid](#1-card-grid)
2. [Modal Dialog](#2-modal-dialog)
3. [Tab Navigation](#3-tab-navigation)
4. [Empty State](#4-empty-state)
5. [Loading Skeleton](#5-loading-skeleton)
6. [Infinite Scroll](#6-infinite-scroll)
7. [Search & Filter](#7-search--filter)
8. [Toast Notifications](#8-toast-notifications)

---

## 1. Card Grid

Grid responsive cho danh sách items:

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/pdk/core/components/ui/card";

interface ItemCardProps {
  title: string;
  description: string;
}

function ItemCard({ title, description }: ItemCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// Sử dụng trong page
function ItemGrid({ items }: { items: ItemCardProps[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item, index) => (
        <ItemCard key={index} {...item} />
      ))}
    </div>
  );
}
```

---

## 2. Modal Dialog

Dialog với form:

```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/pdk/core/components/ui/dialog";
import { Button } from "@/pdk/core/components/ui/button";
import { Input } from "@/pdk/core/components/ui/input";
import { Label } from "@/pdk/core/components/ui/label";

function CreateItemDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = () => {
    // Xử lý submit
    console.log("Created:", name);
    setOpen(false);
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Tạo mới</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo Item Mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Tên</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button onClick={handleSubmit}>Tạo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 3. Tab Navigation

Tabs cho các sections:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/pdk/core/components/ui/tabs";

function FeatureTabs() {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Tổng quan</TabsTrigger>
        <TabsTrigger value="stats">Thống kê</TabsTrigger>
        <TabsTrigger value="settings">Cài đặt</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview" className="mt-4">
        <p>Nội dung tổng quan...</p>
      </TabsContent>
      
      <TabsContent value="stats" className="mt-4">
        <p>Nội dung thống kê...</p>
      </TabsContent>
      
      <TabsContent value="settings" className="mt-4">
        <p>Nội dung cài đặt...</p>
      </TabsContent>
    </Tabs>
  );
}
```

---

## 4. Empty State

Hiển thị khi không có data:

```tsx
import { Card, CardContent } from "@/pdk/core/components/ui/card";
import { Button } from "@/pdk/core/components/ui/button";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground text-center mb-4 max-w-sm">
          {description}
        </p>
        {actionLabel && onAction && (
          <Button onClick={onAction}>{actionLabel}</Button>
        )}
      </CardContent>
    </Card>
  );
}

// Sử dụng
<EmptyState
  title="Chưa có dữ liệu"
  description="Bạn chưa có item nào. Hãy tạo item đầu tiên!"
  actionLabel="Tạo ngay"
  onAction={() => console.log("Create")}
/>
```

---

## 5. Loading Skeleton

Skeleton loading:

```tsx
import { Skeleton } from "@/pdk/core/components/ui/skeleton";
import { Card, CardHeader, CardContent } from "@/pdk/core/components/ui/card";

function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
```

---

## 6. Infinite Scroll

Load thêm khi scroll:

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/pdk/core/components/ui/button";

interface UseInfiniteScrollOptions<T> {
  fetchItems: (page: number) => Promise<T[]>;
  initialPage?: number;
}

function useInfiniteScroll<T>({ fetchItems, initialPage = 1 }: UseInfiniteScrollOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const newItems = await fetchItems(page);
      if (newItems.length === 0) {
        setHasMore(false);
      } else {
        setItems(prev => [...prev, ...newItems]);
        setPage(prev => prev + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, loading, hasMore, fetchItems]);

  return { items, loading, hasMore, loadMore };
}

// Component sử dụng
function InfiniteList() {
  const { items, loading, hasMore, loadMore } = useInfiniteScroll({
    fetchItems: async (page) => {
      // Fetch từ API
      return [];
    },
  });

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i}>Item {i}</div>
      ))}
      
      {hasMore && (
        <Button 
          onClick={loadMore} 
          disabled={loading}
          variant="outline"
          className="w-full"
        >
          {loading ? "Đang tải..." : "Tải thêm"}
        </Button>
      )}
    </div>
  );
}
```

---

## 7. Search & Filter

Tìm kiếm và lọc:

```tsx
import { useState, useMemo } from "react";
import { Input } from "@/pdk/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/pdk/core/components/ui/select";
import { Search } from "lucide-react";

interface SearchFilterProps<T> {
  items: T[];
  searchKey: keyof T;
  filterKey?: keyof T;
  filterOptions?: { value: string; label: string }[];
  onFiltered: (filtered: T[]) => void;
}

function SearchFilter<T extends Record<string, any>>({
  items,
  searchKey,
  filterKey,
  filterOptions,
  onFiltered,
}: SearchFilterProps<T>) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  useMemo(() => {
    let filtered = items;

    // Search
    if (search) {
      filtered = filtered.filter((item) =>
        String(item[searchKey]).toLowerCase().includes(search.toLowerCase())
      );
    }

    // Filter
    if (filter !== "all" && filterKey) {
      filtered = filtered.filter((item) => item[filterKey] === filter);
    }

    onFiltered(filtered);
  }, [items, search, filter, searchKey, filterKey, onFiltered]);

  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm kiếm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      
      {filterOptions && (
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Lọc theo..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {filterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
```

---

## 8. Toast Notifications

Hiển thị thông báo:

```tsx
import { useToast } from "@/pdk/core/hooks/use-toast";
import { Button } from "@/pdk/core/components/ui/button";

function ToastExamples() {
  const { toast } = useToast();

  const showSuccess = () => {
    toast({
      title: "Thành công!",
      description: "Dữ liệu đã được lưu.",
    });
  };

  const showError = () => {
    toast({
      title: "Lỗi!",
      description: "Không thể thực hiện thao tác.",
      variant: "destructive",
    });
  };

  const showWithAction = () => {
    toast({
      title: "Đã xóa",
      description: "Item đã được xóa.",
      action: (
        <Button variant="outline" size="sm" onClick={() => console.log("Undo")}>
          Hoàn tác
        </Button>
      ),
    });
  };

  return (
    <div className="space-x-2">
      <Button onClick={showSuccess}>Success</Button>
      <Button onClick={showError} variant="destructive">Error</Button>
      <Button onClick={showWithAction} variant="outline">With Action</Button>
    </div>
  );
}
```

---

## 💡 Tips

1. **Responsive**: Luôn dùng `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` cho grids
2. **Spacing**: Dùng `space-y-4` hoặc `gap-4` cho consistent spacing
3. **Colors**: Dùng semantic colors như `text-muted-foreground`, `bg-card`
4. **Loading**: Luôn có loading state cho async operations
5. **Empty**: Luôn có empty state khi không có data
