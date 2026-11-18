import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { generateIdentityKeyBundle } from '../crypto/e2ee';
import {
  encryptAndSaveVault,
  getVerifiedContacts,
  hasLocalVault,
  importEncryptedVaultBackup,
  removeContactVerification,
  setContactVerified,
  unlockLocalVault,
} from '../crypto/keyVault';
import { api } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import type {
  ClientKeyBundle,
  PublicUser,
  VerifiedContactRecord,
} from '../types/messaging';
import type { Socket } from 'socket.io-client';

const SESSION_TOKEN_KEY = 'cipherline_session_jwt';

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  keyBundle: ClientKeyBundle | null;
  vaultStatus: 'locked' | 'unlocked' | 'missing';
  socket: Socket | null;
  socketConnected: boolean;
  initializing: boolean;
  verifiedContacts: Record<string, VerifiedContactRecord>;
  register: (params: { username: string; email: string; password: string }) => Promise<void>;
  login: (params: { identifier: string; password: string }) => Promise<void>;
  unlockVaultWithPassword: (password: string) => Promise<void>;
  generateAndPublishFreshKeys: (vaultPassword: string) => Promise<void>;
  importVaultBackup: (
    backupString: string,
    backupPassphrase: string,
    localVaultPassword: string
  ) => Promise<void>;
  markContactVerified: (contact: PublicUser) => void;
  revokeContactVerification: (contactUserId: string) => void;
  logout: () => Promise<void>;
  lockVaultMemory: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(SESSION_TOKEN_KEY)
  );
  const [keyBundle, setKeyBundle] = useState<ClientKeyBundle | null>(null);
  const [vaultStatus, setVaultStatus] = useState<'locked' | 'unlocked' | 'missing'>('locked');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [verifiedContacts, setVerifiedContacts] = useState<
    Record<string, VerifiedContactRecord>
  >({});

  const clearSessionState = useCallback(() => {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    disconnectSocket();
    setSocket(null);
    setSocketConnected(false);
    setToken(null);
    setUser(null);
    setKeyBundle(null);
    setVaultStatus('locked');
    setVerifiedContacts({});
  }, []);

  const attachSocketListeners = useCallback((sock: Socket) => {
    sock.on('connect', () => setSocketConnected(true));
    sock.on('disconnect', () => setSocketConnected(false));
    sock.on('connect_error', (err) => {
      if (err.message.toLowerCase().includes('token')) {
        clearSessionState();
      }
    });
  }, [clearSessionState]);

  // Restore session on page refresh (vault stays locked until user enters password,
  // because unencrypted private keys are never persisted to disk)
  useEffect(() => {
    let active = true;
    const restore = async () => {
      const savedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (!savedToken) {
        if (active) setInitializing(false);
        return;
      }

      try {
        const { user: fetchedUser } = await api.getMe(savedToken);
        if (!active) return;

        setUser(fetchedUser);
        setToken(savedToken);
        setVerifiedContacts(getVerifiedContacts(fetchedUser.id));

        const exists = await hasLocalVault(fetchedUser.id);
        setVaultStatus(exists ? 'locked' : 'missing');

        const sock = connectSocket(savedToken);
        attachSocketListeners(sock);
        setSocket(sock);
      } catch {
        if (active) clearSessionState();
      } finally {
        if (active) setInitializing(false);
      }
    };

    restore();
    return () => {
      active = false;
    };
  }, [attachSocketListeners, clearSessionState]);

  const register = useCallback(
    async ({
      username,
      email,
      password,
    }: {
      username: string;
      email: string;
      password: string;
    }) => {
      // 1. Generate X25519 + Ed25519 keys purely on the client device
      const bundle = await generateIdentityKeyBundle(1);

      // 2. Register user & publish ONLY public keys + SHA-256 fingerprint
      const result = await api.register({
        username,
        email,
        password,
        encryptionPublicKey: bundle.encryptionPublicKey,
        signingPublicKey: bundle.signingPublicKey,
        fingerprint: bundle.fingerprint,
      });

      // 3. Encrypt private keys locally in IndexedDB/storage using password-derived AES-GCM key
      await encryptAndSaveVault(result.user.id, password, bundle);

      sessionStorage.setItem(SESSION_TOKEN_KEY, result.token);
      setToken(result.token);
      setUser(result.user);
      setKeyBundle(bundle);
      setVaultStatus('unlocked');
      setVerifiedContacts(getVerifiedContacts(result.user.id));

      const sock = connectSocket(result.token);
      attachSocketListeners(sock);
      setSocket(sock);
    },
    [attachSocketListeners]
  );

  const login = useCallback(
    async ({ identifier, password }: { identifier: string; password: string }) => {
      const result = await api.login({ identifier, password });

      sessionStorage.setItem(SESSION_TOKEN_KEY, result.token);
      setToken(result.token);
      setUser(result.user);
      setVerifiedContacts(getVerifiedContacts(result.user.id));

      const exists = await hasLocalVault(result.user.id);
      if (exists) {
        try {
          const unlocked = await unlockLocalVault(result.user.id, password);
          setKeyBundle(unlocked);
          setVaultStatus('unlocked');
        } catch {
          setKeyBundle(null);
          setVaultStatus('locked');
        }
      } else {
        setKeyBundle(null);
        setVaultStatus('missing');
      }

      const sock = connectSocket(result.token);
      attachSocketListeners(sock);
      setSocket(sock);
    },
    [attachSocketListeners]
  );

  const unlockVaultWithPassword = useCallback(
    async (password: string) => {
      if (!user) throw new Error('No active user');
      const unlocked = await unlockLocalVault(user.id, password);
      setKeyBundle(unlocked);
      setVaultStatus('unlocked');
    },
    [user]
  );

  const generateAndPublishFreshKeys = useCallback(
    async (vaultPassword: string) => {
      if (!user || !token) throw new Error('Not authenticated');
      const nextVersion = (user.keyVersion || 0) + 1;
      const freshBundle = await generateIdentityKeyBundle(nextVersion);

      const published = await api.publishKeys(token, {
        encryptionPublicKey: freshBundle.encryptionPublicKey,
        signingPublicKey: freshBundle.signingPublicKey,
        fingerprint: freshBundle.fingerprint,
      });

      const syncedBundle: ClientKeyBundle = {
        ...freshBundle,
        keyVersion: published.keyVersion,
      };

      await encryptAndSaveVault(user.id, vaultPassword, syncedBundle);
      setKeyBundle(syncedBundle);
      setVaultStatus('unlocked');
      setUser((prev) =>
        prev
          ? {
              ...prev,
              encryptionPublicKey: published.encryptionPublicKey,
              signingPublicKey: published.signingPublicKey,
              fingerprint: published.fingerprint,
              keyVersion: published.keyVersion,
            }
          : prev
      );
    },
    [token, user]
  );

  const importVaultBackup = useCallback(
    async (backupString: string, backupPassphrase: string, localVaultPassword: string) => {
      if (!user) throw new Error('Not authenticated');
      const imported = await importEncryptedVaultBackup(
        user.id,
        backupPassphrase,
        backupString,
        localVaultPassword
      );
      setKeyBundle(imported);
      setVaultStatus('unlocked');
    },
    [user]
  );

  const markContactVerified = useCallback(
    (contact: PublicUser) => {
      if (!user) return;
      const next = setContactVerified(user.id, {
        userId: contact.id,
        username: contact.username,
        fingerprint: contact.fingerprint,
        keyVersion: contact.keyVersion,
        verifiedAt: new Date().toISOString(),
      });
      setVerifiedContacts(next);
    },
    [user]
  );

  const revokeContactVerification = useCallback(
    (contactUserId: string) => {
      if (!user) return;
      const next = removeContactVerification(user.id, contactUserId);
      setVerifiedContacts(next);
    },
    [user]
  );

  const lockVaultMemory = useCallback(() => {
    setKeyBundle(null);
    setVaultStatus('locked');
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await api.logout(token);
      }
    } catch {
      // Always clear local session even if server unreachable
    } finally {
      clearSessionState();
    }
  }, [clearSessionState, token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        keyBundle,
        vaultStatus,
        socket,
        socketConnected,
        initializing,
        verifiedContacts,
        register,
        login,
        unlockVaultWithPassword,
        generateAndPublishFreshKeys,
        importVaultBackup,
        markContactVerified,
        revokeContactVerification,
        logout,
        lockVaultMemory,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
