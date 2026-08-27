import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../firebase/firebase';
import axios from 'axios';

export interface AppUser {
  id: number;
  email: string;
  nombres: string;
  rol: 'ADMIN' | 'SUPERVISOR' | 'OPERADOR_CAMPO' | 'CONDUCTOR';
  estado: string;
  photoURL?: string;
}

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: User | null;
  token: string | null;
  loading: boolean;
  authError: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  token: null,
  loading: true,
  authError: null,
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
          const res = await axios.post('http://localhost:3000/api/v1/auth/google', { idToken });
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

  const logout = async () => {
    localStorage.removeItem('token');
    setUser(null);
    setToken(null);
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, token, loading, authError, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
