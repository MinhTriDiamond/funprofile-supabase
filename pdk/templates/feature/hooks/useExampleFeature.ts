import { useState, useEffect } from "react";
import { useToast } from "@/pdk/core/hooks/use-toast";

/**
 * Interface cho data item
 * Đổi tên thành {Feature}Item
 */
interface ExampleItem {
  id: string;
  title: string;
  description: string;
  status: "active" | "inactive" | "pending";
  createdAt: string;
}

/**
 * Hook để quản lý feature data
 * Đổi tên thành use{Feature}
 * 
 * Ví dụ sử dụng:
 * const { items, isLoading, error, createItem, updateItem, deleteItem } = useExampleFeature();
 */
export function useExampleFeature() {
  const [items, setItems] = useState<ExampleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch items on mount
  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual Supabase query
      // const { data, error } = await supabase
      //   .from('example_items')
      //   .select('*')
      //   .order('created_at', { ascending: false });
      
      // Mock data for template
      const mockData: ExampleItem[] = [
        {
          id: "1",
          title: "Example Item 1",
          description: "This is an example item",
          status: "active",
          createdAt: new Date().toISOString(),
        },
      ];

      setItems(mockData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Đã xảy ra lỗi";
      setError(message);
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createItem = async (newItem: Omit<ExampleItem, "id" | "createdAt">) => {
    setIsLoading(true);

    try {
      // TODO: Replace with actual Supabase insert
      // const { data, error } = await supabase
      //   .from('example_items')
      //   .insert({ ...newItem, user_id: userId })
      //   .select()
      //   .single();

      const createdItem: ExampleItem = {
        ...newItem,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      };

      setItems((prev) => [createdItem, ...prev]);

      toast({
        title: "Thành công",
        description: "Đã tạo mới thành công",
      });

      return createdItem;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể tạo mới";
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateItem = async (id: string, updates: Partial<ExampleItem>) => {
    setIsLoading(true);

    try {
      // TODO: Replace with actual Supabase update
      // const { error } = await supabase
      //   .from('example_items')
      //   .update(updates)
      //   .eq('id', id);

      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );

      toast({
        title: "Thành công",
        description: "Đã cập nhật thành công",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể cập nhật";
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    setIsLoading(true);

    try {
      // TODO: Replace with actual Supabase delete
      // const { error } = await supabase
      //   .from('example_items')
      //   .delete()
      //   .eq('id', id);

      setItems((prev) => prev.filter((item) => item.id !== id));

      toast({
        title: "Thành công",
        description: "Đã xóa thành công",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể xóa";
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    items,
    isLoading,
    error,
    fetchItems,
    createItem,
    updateItem,
    deleteItem,
  };
}
