import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type BackendMode = 'cloud' | 'self-hosted';

interface BackendModeConfig {
  mode: BackendMode;
  selfHostedUrl: string;
}

interface BackendModeContextType {
  config: BackendModeConfig;
  setMode: (mode: BackendMode) => void;
  setSelfHostedUrl: (url: string) => void;
  getApiBaseUrl: () => string;
  isCloud: boolean;
  isSelfHosted: boolean;
}

const STORAGE_KEY = 'nanobackup-backend-config';

const defaultConfig: BackendModeConfig = {
  mode: 'cloud',
  selfHostedUrl: 'http://localhost:3000',
};

const BackendModeContext = createContext<BackendModeContextType | undefined>(undefined);

export function BackendModeProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<BackendModeConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error loading backend config:', e);
    }
    return defaultConfig;
  });

  // Persist config changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const setMode = (mode: BackendMode) => {
    setConfig(prev => ({ ...prev, mode }));
  };

  const setSelfHostedUrl = (url: string) => {
    // Normalize URL - remove trailing slash
    const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    setConfig(prev => ({ ...prev, selfHostedUrl: normalizedUrl }));
  };

  const getApiBaseUrl = () => {
    if (config.mode === 'self-hosted') {
      return `${config.selfHostedUrl}/api`;
    }
    // For cloud mode, return empty string (uses Supabase functions)
    return '';
  };

  return (
    <BackendModeContext.Provider
      value={{
        config,
        setMode,
        setSelfHostedUrl,
        getApiBaseUrl,
        isCloud: config.mode === 'cloud',
        isSelfHosted: config.mode === 'self-hosted',
      }}
    >
      {children}
    </BackendModeContext.Provider>
  );
}

export function useBackendMode() {
  const context = useContext(BackendModeContext);
  if (!context) {
    throw new Error('useBackendMode must be used within a BackendModeProvider');
  }
  return context;
}
