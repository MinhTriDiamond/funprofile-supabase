import { Button } from "@/pdk/core/components/ui/button";
import { Skeleton } from "@/pdk/core/components/ui/skeleton";
import { ExampleCard } from "../components/ExampleCard";
import { useExampleFeature } from "../hooks/useExampleFeature";

/**
 * ExamplePage - Full page component
 * Đổi tên thành {Feature}Page
 * 
 * Đây là page chính của feature, có thể được route từ App.tsx
 */
export function ExamplePage() {
  const { items, isLoading, error, createItem } = useExampleFeature();

  const handleCreateNew = async () => {
    await createItem({
      title: "New Item",
      description: "Description for new item",
      status: "pending",
    });
  };

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-8">
          <p className="text-destructive mb-4">Đã xảy ra lỗi: {error}</p>
          <Button onClick={() => window.location.reload()}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Example Feature</h1>
          <p className="text-muted-foreground">Mô tả ngắn về feature</p>
        </div>
        <Button onClick={handleCreateNew} disabled={isLoading}>
          Tạo mới
        </Button>
      </div>

      {/* Content */}
      {isLoading && items.length === 0 ? (
        // Loading skeleton
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        // Empty state
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Chưa có dữ liệu nào</p>
          <Button onClick={handleCreateNew}>
            Tạo mới ngay
          </Button>
        </div>
      ) : (
        // Items grid
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <ExampleCard
              key={item.id}
              title={item.title}
              description={item.description}
              status={item.status}
              onAction={() => console.log("View item:", item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
