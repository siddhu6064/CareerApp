import { Redirect } from "expo-router";

export default function Index() {
  // Auth gate in _layout will route us correctly. This is just a fallback.
  return <Redirect href="/(tabs)/jobs" />;
}
