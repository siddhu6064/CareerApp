// Brand tokens shared across screens/components. PRD §4 colors.
export const colors = {
  brand: "#5B21B6",
  brandLt: "#7C3AED",
  brandBg: "#EDE9FE",

  ink: "#111827",
  inkSoft: "#4B5563",
  inkMuted: "#9CA3AF",
  border: "#E5E7EB",
  bg: "#F9FAFB",
  card: "#FFFFFF",

  // Status colors (8 stages — same families as web globals.css)
  status: {
    saved:        { bg: "#F3F4F6", fg: "#374151" },
    applied:      { bg: "#DBEAFE", fg: "#1E40AF" },
    phone_screen: { bg: "#FEF3C7", fg: "#92400E" },
    technical:    { bg: "#FCE7F3", fg: "#9D174D" },
    onsite:       { bg: "#E0E7FF", fg: "#3730A3" },
    offer:        { bg: "#D1FAE5", fg: "#065F46" },
    accepted:     { bg: "#BBF7D0", fg: "#14532D" },
    rejected:     { bg: "#FEE2E2", fg: "#991B1B" },
  } as const,

  score: (n: number) =>
    n >= 70 ? "#10B981" : n >= 40 ? "#F59E0B" : "#EF4444",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 8, lg: 12, pill: 999 };
export const fontSize = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26 };
