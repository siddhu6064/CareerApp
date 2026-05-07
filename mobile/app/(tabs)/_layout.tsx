import { Tabs } from "expo-router";
import { colors } from "@/lib/theme";
import { TabIcon } from "@/components/TabIcon";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: ({ color }) => <TabIcon name="briefcase" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tracker"
        options={{
          title: "Tracker",
          tabBarIcon: ({ color }) => <TabIcon name="kanban" color={color} />,
        }}
      />
      <Tabs.Screen
        name="resume"
        options={{
          title: "Resume",
          tabBarIcon: ({ color }) => <TabIcon name="file" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tailored"
        options={{
          title: "Tailored",
          tabBarIcon: ({ color }) => <TabIcon name="sparkles" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => <TabIcon name="chart" color={color} />,
        }}
      />
    </Tabs>
  );
}
