import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Ban, CheckCircle, Calendar, Video, User } from 'lucide-react';

interface SlotPreviewProps {
  dayName: string;
  slotDuration: number;
  onlineEnabled: boolean;
  onlineStart: string;
  onlineEnd: string;
  inPersonEnabled: boolean;
  inPersonStart: string;
  inPersonEnd: string;
  inPersonLocation?: string;
  blockedSlots?: string[];
  onBlockSlot?: (slotTime: string, type: 'online' | 'inPerson') => void;
  onUnblockSlot?: (slotTime: string, type: 'online' | 'inPerson') => void;
}

const generateTimeSlots = (startTime: string, endTime: string, duration: number): string[] => {
  const slots: string[] = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const mins = currentMinutes % 60;
    const slotStart = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    
    const endMinutesSlot = currentMinutes + duration;
    const endHours = Math.floor(endMinutesSlot / 60);
    const endMins = endMinutesSlot % 60;
    const slotEnd = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
    
    slots.push(`${slotStart} - ${slotEnd}`);
    currentMinutes += duration;
  }
  
  return slots;
};

export const SlotPreview: React.FC<SlotPreviewProps> = ({
  dayName,
  slotDuration,
  onlineEnabled,
  onlineStart,
  onlineEnd,
  inPersonEnabled,
  inPersonStart,
  inPersonEnd,
  inPersonLocation,
  blockedSlots = [],
  onBlockSlot,
  onUnblockSlot,
}) => {
  const [blockMode, setBlockMode] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());

  const onlineSlots = onlineEnabled ? generateTimeSlots(onlineStart, onlineEnd, slotDuration) : [];
  const inPersonSlots = inPersonEnabled ? generateTimeSlots(inPersonStart, inPersonEnd, slotDuration) : [];
  const totalSlots = onlineSlots.length + inPersonSlots.length;
  const blockedCount = blockedSlots.length;
  const availableCount = totalSlots - blockedCount;

  const isSlotBlocked = (slot: string) => blockedSlots.includes(slot);
  const isSlotSelected = (slot: string) => selectedSlots.has(slot);

  const toggleSlotSelection = (slot: string) => {
    const newSelected = new Set(selectedSlots);
    if (newSelected.has(slot)) {
      newSelected.delete(slot);
    } else {
      newSelected.add(slot);
    }
    setSelectedSlots(newSelected);
  };

  const handleSlotClick = (slot: string, type: 'online' | 'inPerson') => {
    if (!blockMode) return;
    
    if (isSlotBlocked(slot)) {
      onUnblockSlot?.(slot, type);
    } else {
      onBlockSlot?.(slot, type);
    }
  };

  const blockSelectedSlots = () => {
    selectedSlots.forEach(slot => {
      if (!isSlotBlocked(slot)) {
        const type = onlineSlots.includes(slot) ? 'online' : 'inPerson';
        onBlockSlot?.(slot, type);
      }
    });
    setSelectedSlots(new Set());
  };

  const unblockSelectedSlots = () => {
    selectedSlots.forEach(slot => {
      if (isSlotBlocked(slot)) {
        const type = onlineSlots.includes(slot) ? 'online' : 'inPerson';
        onUnblockSlot?.(slot, type);
      }
    });
    setSelectedSlots(new Set());
  };

  const selectAllSlots = (type: 'online' | 'inPerson' | 'all') => {
    const newSelected = new Set<string>();
    if (type === 'online' || type === 'all') {
      onlineSlots.forEach(slot => newSelected.add(slot));
    }
    if (type === 'inPerson' || type === 'all') {
      inPersonSlots.forEach(slot => newSelected.add(slot));
    }
    setSelectedSlots(newSelected);
  };

  const clearSelection = () => {
    setSelectedSlots(new Set());
  };

  return (
    <div className="mt-6 p-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border-2 border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {dayName} - Slot Management
          </h3>
          <p className="text-sm text-gray-600">{slotDuration} minute appointment slots</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="default" className="text-sm px-3 py-1">
            {availableCount} Available
          </Badge>
          {blockedCount > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              {blockedCount} Blocked
            </Badge>
          )}
        </div>
      </div>

      {/* Slot Management Controls */}
      <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={blockMode ? "default" : "outline"}
            onClick={() => {
              setBlockMode(!blockMode);
              setSelectedSlots(new Set());
            }}
            className={blockMode ? "bg-orange-600 hover:bg-orange-700" : ""}
          >
            {blockMode ? (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                Block Mode Active
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-1" />
                Enable Block Mode
              </>
            )}
          </Button>

          {blockMode && (
            <>
              <div className="h-6 w-px bg-gray-300" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => selectAllSlots('all')}
              >
                Select All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => selectAllSlots('online')}
                disabled={!onlineEnabled}
              >
                Select Online
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => selectAllSlots('inPerson')}
                disabled={!inPersonEnabled}
              >
                Select In-Person
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearSelection}
              >
                Clear
              </Button>
              
              {selectedSlots.size > 0 && (
                <>
                  <div className="h-6 w-px bg-gray-300" />
                  <span className="text-sm text-gray-600 font-medium">{selectedSlots.size} selected</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={blockSelectedSlots}
                  >
                    <Ban className="h-4 w-4 mr-1" />
                    Block Selected
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={unblockSelectedSlots}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Unblock Selected
                  </Button>
                </>
              )}
            </>
          )}
        </div>
        
        {blockMode && (
          <p className="mt-2 text-xs text-gray-600">
            💡 Click slots to toggle block/unblock, or select multiple and use bulk actions
          </p>
        )}
      </div>

      {totalSlots === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-600 font-medium">No consultation types enabled</p>
          <p className="text-sm text-gray-500 mt-1">Enable Online or In-Person consultation to see available slots</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Online Consultation Slots */}
          {onlineEnabled && onlineSlots.length > 0 && (
            <div className="bg-white p-4 rounded-lg border-2 border-blue-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-blue-600" />
                  <h4 className="font-semibold text-blue-800">Online Consultation</h4>
                </div>
                <Badge variant="default" className="bg-blue-600">
                  {onlineSlots.filter(s => !isSlotBlocked(s)).length}/{onlineSlots.length}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {onlineStart} to {onlineEnd}
              </p>
              <div className="flex flex-wrap gap-2">
                {onlineSlots.map((slot, index) => {
                  const blocked = isSlotBlocked(slot);
                  const selected = isSlotSelected(slot);
                  return (
                    <Badge
                      key={index}
                      variant={blocked ? "destructive" : "outline"}
                      className={`
                        transition-all
                        ${blocked 
                          ? 'bg-red-100 text-red-700 border-red-300 line-through opacity-60 hover:opacity-80' 
                          : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                        }
                        ${selected && blockMode ? 'ring-2 ring-orange-500 ring-offset-1' : ''}
                        ${blockMode ? 'cursor-pointer hover:scale-105' : ''}
                      `}
                      onClick={() => {
                        if (blockMode) {
                          if (selectedSlots.size > 0 || !blocked && !selected) {
                            toggleSlotSelection(slot);
                          } else {
                            handleSlotClick(slot, 'online');
                          }
                        }
                      }}
                    >
                      {blocked && <X className="h-3 w-3 mr-1" />}
                      {slot}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* In-Person Consultation Slots */}
          {inPersonEnabled && inPersonSlots.length > 0 && (
            <div className="bg-white p-4 rounded-lg border-2 border-green-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-green-600" />
                  <h4 className="font-semibold text-green-800">In-Person Consultation</h4>
                </div>
                <Badge variant="default" className="bg-green-600">
                  {inPersonSlots.filter(s => !isSlotBlocked(s)).length}/{inPersonSlots.length}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {inPersonStart} to {inPersonEnd}
                {inPersonLocation && ` • ${inPersonLocation}`}
              </p>
              <div className="flex flex-wrap gap-2">
                {inPersonSlots.map((slot, index) => {
                  const blocked = isSlotBlocked(slot);
                  const selected = isSlotSelected(slot);
                  return (
                    <Badge
                      key={index}
                      variant={blocked ? "destructive" : "outline"}
                      className={`
                        transition-all
                        ${blocked 
                          ? 'bg-red-100 text-red-700 border-red-300 line-through opacity-60 hover:opacity-80' 
                          : 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                        }
                        ${selected && blockMode ? 'ring-2 ring-orange-500 ring-offset-1' : ''}
                        ${blockMode ? 'cursor-pointer hover:scale-105' : ''}
                      `}
                      onClick={() => {
                        if (blockMode) {
                          if (selectedSlots.size > 0 || !blocked && !selected) {
                            toggleSlotSelection(slot);
                          } else {
                            handleSlotClick(slot, 'inPerson');
                          }
                        }
                      }}
                    >
                      {blocked && <X className="h-3 w-3 mr-1" />}
                      {slot}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {totalSlots > 0 && (
        <div className="mt-4 text-center text-sm text-gray-600 bg-white p-3 rounded-lg">
          <span className="font-medium">Each slot is {slotDuration} minutes</span>
          <span className="mx-2">•</span>
          {onlineEnabled && <span>{onlineSlots.filter(s => !isSlotBlocked(s)).length} Online</span>}
          {onlineEnabled && inPersonEnabled && <span className="mx-2">+</span>}
          {inPersonEnabled && <span>{inPersonSlots.filter(s => !isSlotBlocked(s)).length} In-Person</span>}
          <span className="mx-2">=</span>
          <span className="font-semibold text-green-700">{availableCount} Available</span>
          {blockedCount > 0 && (
            <>
              <span className="mx-2">•</span>
              <span className="font-semibold text-red-700">{blockedCount} Blocked</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SlotPreview;
