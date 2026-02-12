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
        tabBarStyle: { display: 'none' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '제어',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="sports-esports" color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="preset-manage"
        options={{
          title: '프리셋',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="bookmark" color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="person" color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="settings" color={color} size={size ?? 24} />,
        }}
      />
    </Tabs>
  );
}
