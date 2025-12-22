import { createContext, useContext, useState, ReactNode } from "react";

interface AppointmentBookingContextType {
  isBookingModalOpen: boolean;
  openBookingModal: () => void;
  closeBookingModal: () => void;
}

const AppointmentBookingContext = createContext<AppointmentBookingContextType | undefined>(undefined);

export const AppointmentBookingProvider = ({ children }: { children: ReactNode }) => {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  const openBookingModal = () => setIsBookingModalOpen(true);
  const closeBookingModal = () => setIsBookingModalOpen(false);

  return (
    <AppointmentBookingContext.Provider
      value={{
        isBookingModalOpen,
        openBookingModal,
        closeBookingModal,
      }}
    >
      {children}
    </AppointmentBookingContext.Provider>
  );
};

export const useAppointmentBooking = () => {
  const context = useContext(AppointmentBookingContext);
  if (context === undefined) {
    throw new Error("useAppointmentBooking must be used within AppointmentBookingProvider");
  }
  return context;
};
