import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiClient } from '@/utils/api';

type AuthUser = {
  uid?: string;
  nickname: string;
  loginId: string;
  email: string;
  accessToken?: string;
  refreshToken?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (user: AuthUser) => void;
  signInWithPassword: (loginId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const signIn = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    
    // 토큰 저장
    if (nextUser.accessToken) {
      apiClient.setAccessToken(nextUser.accessToken);
    }
  }, []);

  const signInWithPassword = useCallback(async (loginId: string, password: string) => {
    try {
      const response = await apiClient.loginWithPassword(loginId, password);
      
      const authUser: AuthUser = {
        uid: response.uid,
        nickname: response.nickname,
        loginId: response.login_id,
        email: response.email,
        accessToken: response.access,
        refreshToken: response.refresh,
      };
      
      signIn(authUser);
    } catch (error) {
      console.error('Password login error:', error);
      throw error;
    }
  }, [signIn]);

  const signOut = useCallback(async () => {
    try {
      if (user?.refreshToken) {
        await apiClient.logout(user.refreshToken);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      apiClient.clearAccessToken();
    }
  }, [user]);

  const isAuthenticated = useMemo(() => user !== null, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated, signIn, signInWithPassword, signOut }),
    [user, isAuthenticated, signIn, signInWithPassword, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
