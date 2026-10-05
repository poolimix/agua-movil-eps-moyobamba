import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../firebase/firebase';
import api from '../config/api';

export type RolUsuario = 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'CONDUCTOR' | 'GESTOR_ENTREGA' | 'OPERADOR_CAMPO';

export interface AppUser {
  id: number;
  email: string;
  nombres: string;
  rol: RolUsuario;
  estado: string;
  photoURL?: string;
  personal_id?: number | null;
}

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: User | null;
  token: string | null;
  loading: boolean;
  authError: string | null;
  isSuperAdmin: boolean;
  isSupervisor: boolean;
  canManageUsers: boolean;
  loginWithEmailDirect: (email: string, appleId?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  token: null,
  loading: true,
  authError: null,
  isSuperAdmin: false,
  isSupervisor: false,
  canManageUsers: false,
  loginWithEmailDirect: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      setAuthError(null);

      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          // Authenticate with backend
          const res = await api.post('/auth/google', { idToken });
          const { token: jwtToken, user: dbUser } = res.data;
          
          setToken(jwtToken);
          localStorage.setItem('token', jwtToken);
          setUser({
            ...dbUser,
            photoURL: currentUser.photoURL || undefined,
          });
        } catch (err: any) {
          console.error('Error authenticating with backend:', err);
          const errorMsg = err.response?.data?.message || 'Usuario no registrado en el sistema. Contacte al administrador.';
          setAuthError(errorMsg);
          setUser(null);
          setToken(null);
          localStorage.removeItem('token');
          await signOut(auth);
        }
      } else {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const loginWithEmailDirect = async (emailText: string, appleId?: string) => {
    setAuthError(null);
    const cleanEmail = emailText.trim().toLowerCase();
    if (!cleanEmail) throw new Error('Por favor ingrese su correo electrónico.');

    const res = await api.post('/auth/google', {
      email: cleanEmail,
      idToken: 'direct_web_auth',
      appleId: appleId || undefined,
    });
    const { token: jwtToken, user: dbUser } = res.data;

    setToken(jwtToken);
    localStorage.setItem('token', jwtToken);
    setUser(dbUser);
  };

  const logout = async () => {
    localStorage.removeItem('token');
    setUser(null);
    setToken(null);
    await signOut(auth);
  };

  const rol = (user?.rol || '').toUpperCase();
  const isSuperAdmin = rol === 'SUPER_ADMIN' || rol === 'ADMIN';
  const isSupervisor = rol === 'SUPERVISOR';
  const canManageUsers = isSuperAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        token,
        loading,
        authError,
        isSuperAdmin,
        isSupervisor,
        canManageUsers,
        loginWithEmailDirect,
        logout,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
