import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Search, X, Clock } from 'lucide-react';

interface LocationCheckinProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: string | null;
  onSelectLocation: (location: string | null) => void;
}

// Popular locations for suggestions
const POPULAR_LOCATIONS = [
  { name: 'TP. Hồ Chí Minh', icon: '🏙️' },
  { name: 'Hà Nội', icon: '🏛️' },
  { name: 'Đà Nẵng', icon: '🏖️' },
  { name: 'Nha Trang', icon: '🌊' },
  { name: 'Đà Lạt', icon: '🌸' },
  { name: 'Phú Quốc', icon: '🏝️' },
  { name: 'Hội An', icon: '🏮' },
  { name: 'Huế', icon: '🏯' },
  { name: 'Vũng Tàu', icon: '⛱️' },
  { name: 'Cần Thơ', icon: '🌾' },
];

export const LocationCheckin = ({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation,
}: LocationCheckinProps) => {
  const [searchQuery, setSearchQuery] = useState(currentLocation || '');
  const [recentLocations] = useState<string[]>(() => {
    const saved = localStorage.getItem('recentLocations');
    return saved ? JSON.parse(saved) : [];
  });

  const filteredLocations = POPULAR_LOCATIONS.filter(loc =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectLocation = (location: string) => {
    // Save to recent locations
    const updated = [location, ...recentLocations.filter(l => l !== location)].slice(0, 5);
    localStorage.setItem('recentLocations', JSON.stringify(updated));
    
    onSelectLocation(location);
    onClose();
  };

  const handleCustomLocation = () => {
    if (searchQuery.trim()) {
      handleSelectLocation(searchQuery.trim());
    }
  };

  const handleRemoveLocation = () => {
    onSelectLocation(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
      <DialogContent className="sm:max-w-[425px] p-0 max-h-[80vh] flex flex-col z-[200]">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="text-center">Check in</DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm hoặc nhập vị trí..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* Custom location button */}
          {searchQuery.trim() && !filteredLocations.some(l => l.name.toLowerCase() === searchQuery.toLowerCase()) && (
            <Button
              variant="outline"
              className="w-full mt-2 justify-start gap-2"
              onClick={handleCustomLocation}
            >
              <MapPin className="w-4 h-4 text-[#E74852]" />
              <span>Thêm "{searchQuery}"</span>
            </Button>
          )}
        </div>

        {/* Current location display */}
        {currentLocation && (
          <div className="px-4 py-2 border-b border-border bg-secondary/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#E74852]" />
                <span className="text-sm font-medium">{currentLocation}</span>
              </div>
              <button
                onClick={handleRemoveLocation}
                className="text-xs text-destructive hover:underline"
              >
                Xóa
              </button>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 max-h-[350px]">
          <div className="p-2">
            {/* Recent Locations */}
            {recentLocations.length > 0 && !searchQuery && (
              <div className="mb-4">
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>Gần đây</span>
                </div>
                {recentLocations.map((location, index) => (
                  <button
                    key={`recent-${index}`}
                    onClick={() => handleSelectLocation(location)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-[#E74852]" />
                    </div>
                    <span className="font-medium">{location}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Popular Locations */}
            <div>
              {!searchQuery && (
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  Địa điểm phổ biến
                </div>
              )}
              {filteredLocations.length > 0 ? (
                filteredLocations.map((location, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectLocation(location.name)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
                      {location.icon}
                    </div>
                    <span className="font-medium">{location.name}</span>
                  </button>
                ))
              ) : searchQuery ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Không tìm thấy địa điểm</p>
                  <p className="text-xs mt-1">Bạn có thể nhập vị trí tùy chỉnh</p>
                </div>
              ) : null}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
