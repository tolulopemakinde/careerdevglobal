export type DashboardRole = 'client' | 'coach';
export type DashboardDestination = { id: string; label: string; icon: string };

// Fragments address existing dashboard segments; no new feature routes.
export const dashboardNavigation: Record<DashboardRole, DashboardDestination[]> = {
  client: [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'profile', label: 'My profile', icon: 'user' },
    { id: 'bookings', label: 'Bookings & payments', icon: 'calendar' },
    { id: 'journey', label: 'My career journey', icon: 'journey' },
  ],
  coach: [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'earnings', label: 'Earnings & payouts', icon: 'wallet' },
    { id: 'profile', label: 'My profile', icon: 'user' },
    { id: 'credentials', label: 'Credentials', icon: 'badge' },
    { id: 'calendly', label: 'Calendly', icon: 'calendar' },
    { id: 'services', label: 'Service offerings', icon: 'briefcase' },
    { id: 'insights', label: 'Publish Career Insight', icon: 'edit' },
    { id: 'bookings', label: 'Bookings & sessions', icon: 'calendar' },
    { id: 'availability', label: 'Add availability', icon: 'clock' },
    { id: 'current-availability', label: 'Current availability', icon: 'clock' },
  ],
};
