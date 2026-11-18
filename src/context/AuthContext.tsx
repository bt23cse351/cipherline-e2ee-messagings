import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { computeSafetyNumber, generateIdentityKeyBundle } from '../crypto/e2ee';
import {
  exportEncryptedVaultBackup,
  getVerifiedContacts,
  hasEncryptedVault,
  importEncryptedVaultBackup,
  removeVerifiedContact,
  saveEncryptedVault,
  saveVerifiedContact,
  unlockEncryptedVault,
} from '../crypto/keyVault';
import { api, ApiError } from '../services/api';
import type {
  IdentityKeyBundle,
  UserProfile,
  VerifiedContactRecord,
} from '../types/messaging';

const SESSION_TOKEN_KEY = 'cipherline_session_jwt';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  expiresAt: string | null;
  identityKeys: IdentityKeyBundle | null;
  vaultExists: boolean;
  needsVaultUnlock: boolean;
  loading: boolean;
  verifiedContacts: Record<string, VerifiedContactRecord>;
  registerAccount: (params: {
    username: string;
    email: string;
    password: string;
    vaultPassphrase?: string;
  }) => Promise<void>;
  loginAccount: (params: { identifier: string; password: string }) => Promise<void>;
  logoutAccount: () => Promise<void>;
  unlockVault: (passphrase: string) => Promise<void>;
  generateAndPublishKeys: (vaultPassphrase: string) => Promise<void>;
  importBackupAndUnlock: (backupJson: string, passphrase: string) => Promise<void>;
  exportVaultBackup: () => Promise<string>;
  lockVault: () => void;
  refreshUser: () => Promise<void>;
  markContactVerified: (peer: UserProfile) => Promise<void>;
  unverifyContact: (peerUserId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [identityKeys, setIdentityKeys] = useState<IdentityKeyBundle | null>(null);
  const [vaultExists, setVaultExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifiedContacts, setVerifiedContacts] = useState<
    Record<string, VerifiedContactRecord>
  >({});

  const persistSessionToken = useCallback((nextToken: string | null) => {
    setToken(nextToken);
    try {
      if (nextToken) {
        sessionStorage.setItem(SESSION_TOKEN_KEY, nextToken);
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }
    } catch {
      // Ignore sessionStorage restrictions
    }
  }, []);

  const syncVaultPresence = useCallback(async (userId: string) => {
    const exists = await hasEncryptedVault(userId);
    setVaultExists(exists);
    setVerifiedContacts(getVerifiedContacts(userId));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const { user: fetchedUser } = await api.getMe(token);
    setUser(fetchedUser);
    await syncVaultPresence(fetchedUser.id);
  }, [token, syncVaultPresence]);

  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      if (!token) {
        if (active) setLoading(false);
        return;
      }
      try {
        const { user: fetchedUser } = await api.getMe(token);
        if (!active) return;
        setUser(fetchedUser);
        await syncVaultPresence(fetchedUser.id);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
          persistSessionToken(null);
          setUser(null);
          setIdentityKeys(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void hydrateSession();
    return () => {
      active = false;
    };
  }, [token, persistSessionToken, syncVaultPresence]);

  const registerAccount = useCallback(
    async (params: {
      username: string;
      email: string;
      password: string;
      vaultPassphrase?: string;
    }) => {
      const bundle = await generateIdentityKeyBundle(1);
      const response = await api.register({
        username: params.username,
        email: params.email,
        password: params.password,
        encryptionPublicKey: bundle.encryptionPublicKey,
        signingPublicKey: bundle.signingPublicKey,
        fingerprint: bundle.fingerprint,
      });

      const passphrase = (params.vaultPassphrase || '').trim() || params.password;
      await saveEncryptedVault(response.user.id, bundle, passphrase);

      persistSessionToken(response.token);
      setExpiresAt(response.expiresAt);
      setUser(response.user);
      setIdentityKeys(bundle);
      setVaultExists(true);
      setVerifiedContacts(getVerifiedContacts(response.user.id));
    },
    [persistSessionToken]
  );

  const loginAccount = useCallback(
    async (params: { identifier: string; password: string }) => {
      const response = await api.login(params);
      persistSessionToken(response.token);
      setExpiresAt(response.expiresAt);
      setUser(response.user);
      setVerifiedContacts(getVerifiedContacts(response.user.id));

      const exists = await hasEncryptedVault(response.user.id);
      setVaultExists(exists);

      if (exists) {
        try {
          const unlocked = await unlockEncryptedVault(response.user.id, params.password);
          setIdentityKeys(unlocked);
        } catch {
          setIdentityKeys(null);
        }
      } else {
        setIdentityKeys(null);
      }
    },
    [persistSessionToken]
  );

  const logoutAccount = useCallback(async () => {
    if (token) {
      await api.logout(token).catch(() => {});
    }
    persistSessionToken(null);
    setExpiresAt(null);
    setUser(null);
    setIdentityKeys(null);
    setVaultExists(false);
    setVerifiedContacts({});
  }, [token, persistSessionToken]);

  const unlockVault = useCallback(
    async (passphrase: string) => {
      if (!user) throw new Error('No active user session');
      const bundle = await unlockEncryptedVault(user.id, passphrase);
      setIdentityKeys(bundle);

      if (
        token &&
        (!user.encryptionPublicKey ||
          user.encryptionPublicKey !== bundle.encryptionPublicKey ||
          user.signingPublicKey !== bundle.signingPublicKey)
      ) {
        const published = await api.publishKeys(token, {
          encryptionPublicKey: bundle.encryptionPublicKey,
          signingPublicKey: bundle.signingPublicKey,
          fingerprint: bundle.fingerprint,
        });
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
      }
    },
    [user, token]
  );

  const generateAndPublishKeys = useCallback(
    async (vaultPassphrase: string) => {
      if (!user || !token) throw new Error('Active authenticated session required');
      const nextVersion = Math.max(1, (user.keyVersion || 0) + (user.encryptionPublicKey ? 1 : 0));
      const bundle = await generateIdentityKeyBundle(nextVersion);

      const published = await api.publishKeys(token, {
        encryptionPublicKey: bundle.encryptionPublicKey,
        signingPublicKey: bundle.signingPublicKey,
        fingerprint: bundle.fingerprint,
      });

      const finalBundle: IdentityKeyBundle = {
        ...bundle,
        keyVersion: published.keyVersion,
      };
      await saveEncryptedVault(user.id, finalBundle, vaultPassphrase);

      setIdentityKeys(finalBundle);
      setVaultExists(true);
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
    [user, token]
  );

  const importBackupAndUnlock = useCallback(
    async (backupJson: string, passphrase: string) => {
      if (!user || !token) throw new Error('Active authenticated session required');
      const bundle = await importEncryptedVaultBackup(user.id, backupJson, passphrase);

      if (
        user.encryptionPublicKey !== bundle.encryptionPublicKey ||
        user.signingPublicKey !== bundle.signingPublicKey
      ) {
        const published = await api.publishKeys(token, {
          encryptionPublicKey: bundle.encryptionPublicKey,
          signingPublicKey: bundle.signingPublicKey,
          fingerprint: bundle.fingerprint,
        });
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
      }

      setIdentityKeys(bundle);
      setVaultExists(true);
    },
    [user, token]
  );

  const exportVaultBackup = useCallback(async () => {
    if (!user) throw new Error('No authenticated user');
    return exportEncryptedVaultBackup(user.id);
  }, [user]);

  const lockVault = useCallback(() => {
    setIdentityKeys(null);
  }, []);

  const markContactVerified = useCallback(
    async (peer: UserProfile) => {
      if (!user) return;
      const myFingerprint = identityKeys?.fingerprint || user.fingerprint;
      const safetyNumber = await computeSafetyNumber(myFingerprint, peer.fingerprint);
      const next = saveVerifiedContact(user.id, {
        userId: peer.id,
        username: peer.username,
        fingerprint: peer.fingerprint,
        safetyNumber,
        verifiedAt: new Date().toISOString(),
      });
      setVerifiedContacts(next);
    },
    [user, identityKeys]
  );

  const unverifyContact = useCallback(
    (peerUserId: string) => {
      if (!user) return;
      const next = removeVerifiedContact(user.id, peerUserId);
      setVerifiedContacts(next);
    },
    [user]
  );

  const needsVaultUnlock = Boolean(user && !identityKeys);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        expiresAt,
        identityKeys,
        vaultExists,
        needsVaultUnlock,
        loading,
        verifiedContacts,
        registerAccount,
        loginAccount,
        logoutAccount,
        unlockVault,
        generateAndPublishKeys,
        importBackupAndUnlock,
        exportVaultBackup,
        lockVault,
        refreshUser,
        markContactVerified,
        unverifyContact,
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
