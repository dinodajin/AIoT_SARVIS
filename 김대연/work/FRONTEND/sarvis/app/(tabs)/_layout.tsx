
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import React from 'react';

import { SarvisTheme } from '@/constants/sarvis-theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: SarvisTheme.colors.primary,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '제어',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="sports-esports" color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="softap-test"
        options={{
          title: 'SoftAP',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="wifi-tethering" color={color} size={size ?? 24} />,
        }}
      />
    </Tabs>
  );
}

