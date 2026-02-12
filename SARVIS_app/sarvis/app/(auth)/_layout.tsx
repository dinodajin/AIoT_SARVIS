import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: '#f8f9fa' }
    }} initialRouteName="login">
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="login-id" options={{ headerShown: false }} />
      <Stack.Screen name="login-face" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="signup-info" options={{ headerShown: false }} />
      <Stack.Screen name="face-capture" options={{ headerShown: false }} />
      <Stack.Screen name="voice-register" options={{ headerShown: false }} />
      <Stack.Screen name="find-id" options={{ headerShown: false }} />
      <Stack.Screen name="find-password" options={{ headerShown: false }} />
      <Stack.Screen name="preset-selection" options={{ headerShown: false }} />
    </Stack>
  );
}
