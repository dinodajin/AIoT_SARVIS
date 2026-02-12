// TODO: Phase 6 진행 중, NetInfo 타입 이슈 해결 필요

import React, { createContext, useContext, useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface ConnectivityContextType {
    isConnected: boolean;
    isWifi: boolean;
    ssid: string | null;
}

const ConnectivityContext = createContext<ConnectivityContextType>({
    isConnected: false,
    isWifi: false,
    ssid: null,
});

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isWifi, setIsWifi] = useState(false);
    const [ssid, setSsid] = useState<string | null>(null);

    useEffect(() => {
        // 초기 상태를 즉시 확인
        NetInfo.fetch().then((initialState: NetInfoState) => {
            const connected = !!initialState.isConnected;
            const wifi = initialState.type === 'wifi';
            const currentSsid = (initialState.details as any)?.ssid || null;

            setIsConnected(connected);
            setIsWifi(wifi);
            setSsid(currentSsid);
        });

        // 상태 변경 감지
        const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
            const connected = !!state.isConnected;
            const wifi = state.type === 'wifi';
            const currentSsid = (state.details as any)?.ssid || null;

            setIsConnected(connected);
            setIsWifi(wifi);
            setSsid(currentSsid);
        });

        return () => unsubscribe();
    }, []);

    return (
        <ConnectivityContext.Provider value={{ isConnected, isWifi, ssid }}>
            {children}
        </ConnectivityContext.Provider>
    );
};

export const useConnectivity = () => useContext(ConnectivityContext);
