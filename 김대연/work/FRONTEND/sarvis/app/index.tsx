import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { user } = useAuth();

  if (user) {
    return <Redirect href={{ pathname: '/(tabs)' } as any} />;
  }

  return <Redirect href={{ pathname: '/(auth)/login' } as any} />;
}
