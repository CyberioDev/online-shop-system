import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="product/new" />
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="review/[id]" />
      <Stack.Screen name="preorder/[id]" />
    </Stack>
  );
}
