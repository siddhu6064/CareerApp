// SwipeableApplicationCard — wraps ApplicationCard with gesture-based
// stage moves using react-native-gesture-handler's Swipeable.
//
// Swipe right → advance to next stage (or stays at final stage)
// Swipe left  → move to "rejected"
// Long press  → opens ActionSheet to pick any stage
//
// react-native-gesture-handler is already installed (v2.20.2) and
// GestureHandlerRootView is in _layout.tsx.

import { useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { Swipeable } from "react-native-gesture-handler";
import type { Application, ApplicationStatus } from "@/lib/types";
import { APPLICATION_STATUSES } from "@/lib/types";
import { ApplicationCard } from "./ApplicationCard";
import { colors, space, fontSize } from "@/lib/theme";

const NEXT_STATUS: Record<ApplicationStatus, ApplicationStatus | null> = {
  saved:        "applied",
  applied:      "phone_screen",
  phone_screen: "technical",
  technical:    "onsite",
  onsite:       "offer",
  offer:        "accepted",
  accepted:     null,
  rejected:     null,
};

function getNextStatus(current: ApplicationStatus): ApplicationStatus | null {
  return NEXT_STATUS[current];
}

interface Props {
  app: Application;
  onMove: (status: ApplicationStatus) => void;
  onDelete: () => void;
}

export function SwipeableApplicationCard({ app, onMove, onDelete }: Props) {
  const swipeRef = useRef<Swipeable>(null);

  function closeSwipe() {
    swipeRef.current?.close();
  }

  // ── Right action: advance stage ──────────────────────────────────
  function renderRightAction() {
    const next = getNextStatus(app.status);
    if (!next) return null;
    return (
      <Animated.View style={[s.action, s.actionAdvance]}>
        <Text style={s.actionIcon}>→</Text>
        <Text style={s.actionLabel}>{next.replace("_", " ")}</Text>
      </Animated.View>
    );
  }

  // ── Left action: reject ──────────────────────────────────────────
  function renderLeftAction() {
    if (app.status === "rejected") return null;
    return (
      <Animated.View style={[s.action, s.actionReject]}>
        <Text style={s.actionIcon}>✕</Text>
        <Text style={s.actionLabel}>Reject</Text>
      </Animated.View>
    );
  }

  function onSwipeRight() {
    const next = getNextStatus(app.status);
    if (next) {
      onMove(next);
    }
    closeSwipe();
  }

  function onSwipeLeft() {
    if (app.status !== "rejected") {
      onMove("rejected");
    }
    closeSwipe();
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightAction}
      renderLeftActions={renderLeftAction}
      onSwipeableOpen={(direction) => {
        if (direction === "right") onSwipeLeft();
        if (direction === "left") onSwipeRight();
      }}
      friction={2}
      overshootFriction={8}
      leftThreshold={80}
      rightThreshold={80}
    >
      <ApplicationCard app={app} onMove={onMove} onDelete={onDelete} />
    </Swipeable>
  );
}

const s = StyleSheet.create({
  action: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 12,
    marginVertical: 2,
    gap: space.xs,
  },
  actionAdvance: {
    backgroundColor: colors.status.applied.bg,
  },
  actionReject: {
    backgroundColor: colors.status.rejected.bg,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionLabel: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
});
