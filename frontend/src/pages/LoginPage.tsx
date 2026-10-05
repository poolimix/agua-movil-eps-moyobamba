import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, appleProvider } from '../firebase/firebase';
import { useAuth } from '../context/AuthContext';
import PoliticaPrivacidadModal from '../components/legal/PoliticaPrivacidadModal';
import TerminosServicioModal from '../components/legal/TerminosServicioModal';
import AguaTrackLogo from '../components/AguaTrackLogo';
import './LoginPage.css';

export default function LoginPage() {
  const { authError, loginWithEmailDirect } = useAuth();
  const [localError, setLocalError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | 'email' | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Entrada de correo textual
  const [textEmail, setTextEmail] = useState('');
  const [appleRelayDetected, setAppleRelayDetected] = useState(false);
  const [pendingAppleId, setPendingAppleId] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    try {
      setLocalError(null);
      setAppleRelayDetected(false);
      setLoadingProvider('google');
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        setLocalError(error.message || 'No se pudo completar el inicio de sesión con Google.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleAppleLogin = async () => {
    try {
      setLocalError(null);
      setAppleRelayDetected(false);
      setLoadingProvider('apple');
      const result = await signInWithPopup(auth, appleProvider);
      
      // Verificar si Apple devolvió un correo privado o nulo
      const user = result.user;
      if (user?.email && user.email.includes('privaterelay.appleid.com')) {
        setAppleRelayDetected(true);
        setPendingAppleId(user.uid || null);
        setLocalError(
          'Apple ha ocultado su correo real con un alias privado (@privaterelay.appleid.com). Por favor, ingrese abajo su correo registrado en EPS Moyobamba para vincular su cuenta.'
        );
      }
    } catch (error: any) {
      console.error('Error signing in with Apple:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        setLocalError(error.message || 'No se pudo completar el inicio de sesión con Apple.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleDirectEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = textEmail.trim().toLowerCase();
    if (!clean) {
      setLocalError('Por favor ingrese su correo electrónico.');
      return;
    }

    try {
      setLocalError(null);
      setLoadingProvider('email');
      await loginWithEmailDirect(clean, pendingAppleId || undefined);
    } catch (error: any) {
      console.error('Error ingresando con correo textual:', error);
      const msg = error.response?.data?.message || error.message || 'No se pudo verificar el correo ingresado.';
      setLocalError(msg);
      if (error.response?.data?.isAppleRelay) {
        setAppleRelayDetected(true);
        if (error.response?.data?.appleId) {
          setPendingAppleId(error.response.data.appleId);
        }
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const displayedError = authError || localError;

  return (
    <div className="login-wrapper">
      <div className="login-card">
        {/* Logo Institucional AguaTrack */}
        <div className="login-logo" style={{ marginBottom: 16 }}>
          <AguaTrackLogo
            variant="vertical"
            size="lg"
            showSubtitle={true}
            theme="dark"
            subtitleText="EPS Moyobamba • PNSU"
          />
        </div>

        <div className="login-divider">
          <span>Autenticación Federada Segura</span>
        </div>

        {/* Alerta de Error de Acceso o Cuenta no autorizada */}
        {displayedError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            color: '#fca5a5',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '12.5px',
            textAlign: 'center',
            width: '100%',
            lineHeight: 1.4,
          }}>
            🚫 {displayedError}
          </div>
        )}

        {/* AVISO ESPECIAL SI APPLE OCULTÓ EL CORREO */}
        {appleRelayDetected && (
          <div className="apple-relay-alert">
            <strong>🔒 Apple ocultó tu dirección de correo:</strong>
            <div style={{ marginTop: 4 }}>
              Escribe a continuación tu correo institucional registrado en EPS Moyobamba para vincular tu acceso de Apple permanentemente.
            </div>
          </div>
        )}

        {/* BOTÓN OFICIAL: GOOGLE SIGN-IN */}
        <button
          className="google-btn"
          onClick={handleGoogleLogin}
          disabled={loadingProvider !== null}
          aria-label="Iniciar sesión con Google"
        >
          {loadingProvider === 'google' ? (
            <span>Conectando con Google...</span>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Iniciar sesión con Google
            </>
          )}
        </button>

        {/* BOTÓN OFICIAL: SIGN IN WITH APPLE (Cumplimiento Apple HIG & Legal) */}
        <button
          className="apple-btn"
          onClick={handleAppleLogin}
          disabled={loadingProvider !== null}
          aria-label="Iniciar sesión con Apple"
        >
          {loadingProvider === 'apple' ? (
            <span>Conectando con Apple...</span>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 170 170" fill="#ffffff">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.06-7.69-7.85-12.01-14.36-6.09-9.18-10.88-19.53-14.37-31.06-3.48-11.52-5.23-22.18-5.23-31.98 0-14.36 3.6-26.06 10.79-35.1 7.19-9.04 16.22-13.62 27.09-13.74 5.23 0 10.85 1.41 16.86 4.23 6.01 2.82 9.77 4.29 11.28 4.41 1.74-.24 5.79-1.88 12.14-4.93 6.35-3.05 11.83-4.46 16.44-4.23 12.63.65 22.54 5.37 29.74 14.16-11.1 6.75-16.54 16.02-16.32 27.81.22 9.36 3.92 17.2 11.11 23.52 7.19 6.32 15.69 10.02 25.5 11.1-2.18 6.53-4.8 12.96-7.87 19.29zM119.22 33.15c0-6.97 2.5-13.62 7.51-19.95 5.01-6.32 11.33-10.45 18.96-12.39.22 1.31.33 2.61.33 3.92 0 6.97-2.61 13.84-7.84 20.6-5.23 6.75-11.66 10.78-19.3 12.09-.43-1.42-.66-2.84-.66-4.27z" />
              </svg>
              Iniciar sesión con Apple
            </>
          )}
        </button>

        {/* SEPARADOR: ACCESO DIRECTO CON CORREO */}
        <div className="login-divider">
          <span>O ingresa tu correo registrado</span>
        </div>

        {/* FORMULARIO DE INGRESO MANUAL DE CORREO TEXTUAL */}
        <form onSubmit={handleDirectEmailSubmit} className="direct-email-section">
          <div className="direct-email-input-wrap">
            <span className="direct-email-icon">✉️</span>
            <input
              type="email"
              className="direct-email-input"
              placeholder="correo@epsmoyobamba.gob.pe o personal"
              value={textEmail}
              onChange={(e) => setTextEmail(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="false"
            />
          </div>

          <button
            type="submit"
            className="direct-email-submit"
            disabled={loadingProvider !== null}
          >
            {loadingProvider === 'email' ? (
              <span>Verificando cuenta...</span>
            ) : (
              <span>Continuar con este Correo ➔</span>
            )}
          </button>
        </form>

        {/* Aviso de Privacidad y Cumplimiento de Políticas de Plataforma */}
        <p className="login-footer">
          Plataforma de fiscalización oficial EPS Moyobamba y Ministerio de Vivienda (PNSU). Acceso restringido exclusivamente a cuadrillas y operadores autorizados.
        </p>

        {/* Enlaces Legales Requeridos por Apple y Google */}
        <div className="login-legal-row">
          <button
            type="button"
            className="login-legal-btn"
            onClick={() => setShowPrivacy(true)}
          >
            Política de Privacidad
          </button>
          <span className="login-legal-dot">•</span>
          <button
            type="button"
            className="login-legal-btn"
            onClick={() => setShowTerms(true)}
          >
            Términos del Servicio
          </button>
        </div>
      </div>

      {/* Modales Legales */}
      <PoliticaPrivacidadModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <TerminosServicioModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
    </div>
  );
}
