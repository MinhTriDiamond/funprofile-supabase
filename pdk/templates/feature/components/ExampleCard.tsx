import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/pdk/core/components/ui/card";
import { Button } from "@/pdk/core/components/ui/button";
import { Badge } from "@/pdk/core/components/ui/badge";

/**
 * Props interface cho ExampleCard
 * Đổi tên thành {Feature}CardProps
 */
interface ExampleCardProps {
  title: string;
  description: string;
  status?: "active" | "inactive" | "pending";
  onAction?: () => void;
}

/**
 * ExampleCard component
 * Đổi tên thành {Feature}Card
 * 
 * Ví dụ sử dụng:
 * <ExampleCard
 *   title="Card Title"
 *   description="Card description here"
 *   status="active"
 *   onAction={() => console.log("clicked")}
 * />
 */
export function ExampleCard({ title, description, status = "active", onAction }: ExampleCardProps) {
  const statusColors = {
    active: "default",
    inactive: "secondary",
    pending: "outline",
  } as const;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        <Badge variant={statusColors[status]}>
          {status === "active" ? "Hoạt động" : status === "pending" ? "Chờ xử lý" : "Không hoạt động"}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
      <CardFooter>
        <Button onClick={onAction} className="w-full">
          Xem chi tiết
        </Button>
      </CardFooter>
    </Card>
  );
}
