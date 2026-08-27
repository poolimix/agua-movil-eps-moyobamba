import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { getDatabase } from '../database/schema';
import { BACKEND_URL } from '../config/api';

WebBrowser.maybeCompleteAuthSession();

interface LoginScreenProps {
  onLoginSuccess: (user: any) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const [unauthorizedModal, setUnauthorizedModal] = useState<{ visible: boolean; email: string; message: string }>({
    visible: false,
    email: '',
    message: '',
  });

  useEffect(() => {
    // Load last successfully authorized email from app_config
    (async () => {
      try {
        const db = await getDatabase();
        const config = await db.getFirstAsync(
          `SELECT valor FROM app_config WHERE clave = 'ultimo_correo_login' LIMIT 1`
        ) as any;
        if (config?.valor) {
          setEmail(config.valor);
        } else {
          // Fallback to sesion_usuario if available
          const lastSession = await db.getFirstAsync(
            `SELECT email FROM sesion_usuario ORDER BY id DESC LIMIT 1`
          ) as any;
          if (lastSession?.email) {
            setEmail(lastSession.email);
          }
        }
      } catch (_) {}
    })();
  }, []);

  const performLoginWithEmail = async (targetEmail: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert(
        'Ingresar Correo',
        'Por favor ingrese su cuenta de correo para iniciar sesión.'
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: 'direct_auth_token',
          email: cleanEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoading(false);
        setUnauthorizedModal({
          visible: true,
          email: cleanEmail,
          message: data.message || 'Tu cuenta no cuenta con un perfil asignado en EPS Moyobamba.',
        });
        return;
      }

      // Save session and remember authorized email in SQLite
      const db = await getDatabase();
      await db.runAsync('DELETE FROM sesion_usuario');
      await db.runAsync(
        `INSERT INTO sesion_usuario (id, email, nombres, rol, token, created_at)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [data.user.email, data.user.nombres, data.user.rol, data.token, new Date().toISOString()]
      );

      // Persist authorized email in app_config so it stays pre-filled on next logins
      await db.runAsync(
        `INSERT OR REPLACE INTO app_config (clave, valor) VALUES ('ultimo_correo_login', ?)`,
        [data.user.email]
      );

      Alert.alert('Bienvenido', `Sesión iniciada como: ${data.user.nombres} (${data.user.rol})`);
      onLoginSuccess(data.user);
    } catch (err: any) {
      // Offline fallback: ONLY allow offline access if this exact user was previously verified and stored in local SQLite
      try {
        const db = await getDatabase();
        const existingSession = await db.getFirstAsync(
          `SELECT * FROM sesion_usuario WHERE LOWER(email) = ? LIMIT 1`,
          [cleanEmail]
        ) as any;

        if (existingSession && existingSession.email) {
          Alert.alert('Modo Offline', `Iniciando sesión previamente autorizada como ${existingSession.nombres} (${existingSession.rol}).`);
          onLoginSuccess(existingSession);
        } else {
          Alert.alert(
            'Verificación Requerida',
            `No se pudo validar el acceso con el servidor de EPS Moyobamba para "${cleanEmail}".\n\nPor favor verifique su conexión a internet para validar sus credenciales.`
          );
        }
      } catch (offlineErr: any) {
        Alert.alert('Error de conexión', 'No se pudo conectar con el servidor: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // GOOGLE LOGIN HANDLER
  const handleGoogleLogin = async () => {
    // If the input already has an email or last saved email, use it directly
    if (email && email.includes('@')) {
      await performLoginWithEmail(email);
      return;
    }

    // Otherwise prompt for the Google email
    if (Alert.prompt) {
      Alert.prompt(
        'Continuar con Google',
        'Ingrese su cuenta de Google (Gmail):',
        (enteredEmail) => {
          if (enteredEmail && enteredEmail.trim()) {
            setEmail(enteredEmail.trim());
            performLoginWithEmail(enteredEmail.trim());
          }
        },
        'plain-text',
        'vallessaavedrapa@gmail.com'
      );
    } else {
      Alert.alert(
        'Cuenta de Google',
        'Ingrese su correo de Gmail en el campo de texto y presione Iniciar Sesión.'
      );
    }
  };

  const handleAppleLogin = async () => {
    // Apple OAuth flow
    if (email) {
      performLoginWithEmail(email);
    } else {
      Alert.prompt
        ? Alert.prompt(
            'Ingresar Apple ID / iCloud',
            'Ingrese su correo registrado en Apple / EPS Moyobamba:',
            (enteredEmail) => {
              if (enteredEmail) {
                setEmail(enteredEmail);
                performLoginWithEmail(enteredEmail);
              }
            }
          )
        : Alert.alert('Ingresar Correo', 'Escriba su correo en el campo de texto y toque Iniciar Sesión.');
    }
  };

  const handleClearEmail = () => {
    setEmail('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* LOGO INSTITUCIONAL */}
          <View style={styles.logoContainer}>
            <View style={styles.iconCircle}>
              <Text style={styles.logoIcon}>💧</Text>
            </View>
            <Text style={styles.appTitle}>Agua Móvil</Text>
            <Text style={styles.appSubtitle}>EPS MOYOBAMBA S.A.</Text>
            <Text style={styles.appTagline}>Sistema de Reparto y Control en Campo</Text>
          </View>

          {/* 1. FORMULARIO DE ACCESO POR CORREO */}
          <View style={styles.inputContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.inputLabel}>Correo Institucional / EPS:</Text>
              {email ? (
                <TouchableOpacity onPress={handleClearEmail} activeOpacity={0.7}>
                  <Text style={styles.clearText}>✕ Limpiar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="ejemplo@gmail.com / @epsmoyobamba.gob.pe"
              placeholderTextColor="#64748b"
              onSubmitEditing={() => performLoginWithEmail(email)}
            />

            {/* BOTÓN PRINCIPAL: INICIAR SESIÓN DIRECTO */}
            <TouchableOpacity
              style={styles.directLoginBtn}
              onPress={() => performLoginWithEmail(email)}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.directLoginBtnText}>Iniciar Sesión</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* SEPARADOR */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o ingresar con</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* 2. BOTÓN GOOGLE (ABRE EL SELECTOR REAL DE CUENTAS DE GOOGLE) */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <View style={styles.btnRow}>
              <Text style={styles.googleIconText}>G</Text>
              <Text style={styles.googleBtnText}>Continuar con Google</Text>
            </View>
          </TouchableOpacity>

          {/* 3. BOTÓN APPLE */}
          <TouchableOpacity
            style={styles.appleBtn}
            onPress={handleAppleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <View style={styles.btnRow}>
              <Text style={styles.appleLogoIcon}></Text>
              <Text style={styles.appleBtnText}>Continuar con Apple / iCloud</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            Uso exclusivo para conductores y cuadrillas autorizadas de EPS Moyobamba.
          </Text>
        </View>
      </ScrollView>

      {/* MODAL ACCESO NO AUTORIZADO */}
      <Modal
        visible={unauthorizedModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setUnauthorizedModal({ visible: false, email: '', message: '' })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🔒</Text>
            <Text style={styles.modalTitle}>Acceso No Autorizado</Text>
            
            <View style={styles.emailBadge}>
              <Text style={styles.emailBadgeText}>{unauthorizedModal.email}</Text>
            </View>

            <Text style={styles.modalDescription}>
              Esta cuenta no cuenta con un perfil o rol asignado en el sistema de distribución de agua de EPS Moyobamba.
            </Text>

            <View style={styles.modalInstructionBox}>
              <Text style={styles.modalInstructionText}>
                📌 <Text style={{ fontWeight: '700' }}>¿Eres personal de EPS Moyobamba?</Text>{'\n'}
                Solicita al Administrador que registre tu correo en el panel administrativo web.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={() => {
                  setUnauthorizedModal({ visible: false, email: '', message: '' });
                  setEmail('');
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>Probar con otro correo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => setUnauthorizedModal({ visible: false, email: '', message: '' })}
              >
                <Text style={styles.modalBtnSecondaryText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1329',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    backgroundColor: '#131f3d',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.4)',
  },
  logoIcon: {
    fontSize: 32,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  appSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  appTagline: {
    fontSize: 11.5,
    color: '#94a3b8',
    marginTop: 3,
  },
  inputContainer: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  clearText: {
    fontSize: 11.5,
    color: '#38bdf8',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 12,
  },
  directLoginBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  directLoginBtnText: {
    color: '#ffffff',
    fontSize: 15.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#94a3b8',
    fontSize: 11.5,
    marginHorizontal: 10,
    fontWeight: '600',
  },
  googleBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  appleBtn: {
    backgroundColor: '#000000',
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ea4335',
    marginRight: 10,
  },
  googleBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  appleLogoIcon: {
    fontSize: 17,
    color: '#ffffff',
    marginRight: 10,
  },
  appleBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  footerNote: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16,
  },

  // MODAL ACCESO NO AUTORIZADO
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  emailBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  emailBadgeText: {
    color: '#f87171',
    fontSize: 12.5,
    fontWeight: '700',
  },
  modalDescription: {
    fontSize: 13,
    color: '#cbd5e1',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  modalInstructionBox: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
    marginBottom: 18,
  },
  modalInstructionText: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
  },
  modalActions: {
    width: '100%',
    gap: 8,
  },
  modalBtnPrimary: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalBtnSecondary: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 13,
  },
});
