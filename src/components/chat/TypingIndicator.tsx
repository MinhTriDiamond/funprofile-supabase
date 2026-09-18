import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TypingUser {
  userId: string;
  username: string;
  avatar_url?: string;
}

interface TypingIndicatorProps {
  users: TypingUser[];
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  const displayText = users.length === 1
    ? `${users[0].username} đang nhập...`
    : users.length === 2
    ? `${users[0].username} và ${users[1].username} đang nhập...`
    : `${users[0].username} và ${users.length - 1} người khác đang nhập...`;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {users.slice(0, 3).map((user) => (
          <Avatar key={user.userId} className="h-6 w-6 border-2 border-background">
            <AvatarImage src={user.avatar_url} alt={user.username} />
            <AvatarFallback className="text-xs">
              {user.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      
      <div className="bg-muted rounded-2xl px-4 py-2 flex items-center gap-1">
        <span className="text-sm text-muted-foreground">{displayText}</span>
        <div className="flex gap-0.5 ml-1">
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
