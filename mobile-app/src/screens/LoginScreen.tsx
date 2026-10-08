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
  Image,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Ionicons } from '@expo/vector-icons';
import { getDatabase } from '../database/schema';
import { BACKEND_URL } from '../config/api';

WebBrowser.maybeCompleteAuthSession();

// Official Native Google OAuth Credentials for EPS Moyobamba
const GOOGLE_CONFIG = {
  webClientId: '764046725831-mhk7ojia6n283cpo75dtq1sptn24hj71.apps.googleusercontent.com',
  androidClientId: '764046725831-bu5ac6rek7g74qgufuv205ht01gk8hb4.apps.googleusercontent.com',
  iosClientId: '764046725831-u2roba84uajspj94seei09aoaoqq78t4.apps.googleusercontent.com',
};

interface LoginScreenProps {
  onLoginSuccess: (user: any) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Official PKCE Compliant Native Google OAuth Request Hook
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CONFIG.webClientId,
    webClientId: GOOGLE_CONFIG.webClientId,
    iosClientId: GOOGLE_CONFIG.iosClientId,
    androidClientId: GOOGLE_CONFIG.androidClientId,
  });

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

  // Handle successful Google OAuth callback response
  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.accessToken) {
        setLoading(true);
        fetch('https://www.googleapis.com/userinfo/v2/me', {
          headers: { Authorization: `Bearer ${authentication.accessToken}` },
        })
          .then((res) => res.json())
          .then(async (googleUser) => {
            if (googleUser?.email) {
              setEmail(googleUser.email);
              await performLoginWithEmail(googleUser.email);
            }
          })
          .catch((err) => {
            console.error('Error fetching Google user info:', err);
            Alert.alert('Error', 'No se pudo obtener el perfil de Google.');
          })
          .finally(() => setLoading(false));
      }
    }
  }, [response]);

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
      const candidateUrls = __DEV__
        ? [
            `${BACKEND_URL}/auth/google`,
            'http://10.0.2.2:3000/api/v1/auth/google',
            'http://localhost:3000/api/v1/auth/google',
          ]
        : [`${BACKEND_URL}/auth/google`];
      const uniqueUrls = Array.from(new Set(candidateUrls));

      let response: Response | null = null;
      let lastNetworkErr: any = null;

      for (const url of uniqueUrls) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: 'direct_auth_token',
              email: cleanEmail,
            }),
          });
          if (res) {
            response = res;
            break;
          }
        } catch (e) {
          lastNetworkErr = e;
        }
      }

      if (!response) {
        throw lastNetworkErr || new Error('No se pudo establecer conexión con el servidor.');
      }

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

  // NATIVE GOOGLE LOGIN (OPENS NATIVE GOOGLE ACCOUNT PICKER)
  const handleGoogleLogin = async () => {
    try {
      await promptAsync();
    } catch (err: any) {
      console.error('Google Auth prompt error:', err);
      Alert.alert('Error con Google', 'No se pudo abrir el selector de Google: ' + err.message);
    }
  };

  const handleAppleLogin = async () => {
    if (email) {
      performLoginWithEmail(email);
    } else {
      Alert.alert('Ingresar Correo', 'Escriba su correo en el campo de texto y presione Iniciar Sesión.');
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
          {/* LOGO INSTITUCIONAL AGUATRACK */}
          <View style={styles.logoContainer}>
            <View style={[styles.iconCircle, { width: 88, height: 88, borderRadius: 24, padding: 0, overflow: 'hidden', borderWidth: 2, borderColor: '#38bdf8' }]}>
              <Image
                source={require('../../assets/icon.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 10 }}>
              <Text style={[styles.appTitle, { color: '#38bdf8' }]}>Agua</Text>
              <Text style={[styles.appTitle, { color: '#ffffff' }]}>Track</Text>
              <View style={{ backgroundColor: '#0284c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>GPS</Text>
              </View>
            </View>
            <Text style={styles.appSubtitle}>EPS MOYOBAMBA S.A.</Text>
            <Text style={styles.appTagline}>Trazabilidad y Control en Campo</Text>
          </View>

          {/* 1. FORMULARIO DE ACCESO POR CORREO */}
          <View style={styles.inputContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.inputLabel}>Correo Institucional / EPS:</Text>
              {email ? (
                <TouchableOpacity onPress={handleClearEmail} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="close-circle-outline" size={13} color="#38bdf8" />
                  <Text style={styles.clearText}>Limpiar</Text>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="log-in-outline" size={18} color="#ffffff" />
                  <Text style={styles.directLoginBtnText}>Iniciar Sesión</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* SEPARADOR */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o ingresar con</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* 2. BOTÓN GOOGLE (NATIVO CON ID DE IOS Y ANDROID) */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleLogin}
            disabled={loading || !request}
            activeOpacity={0.85}
          >
            <View style={styles.btnRow}>
              <Ionicons name="logo-google" size={18} color="#ea4335" style={{ marginRight: 8 }} />
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
              <Ionicons name="logo-apple" size={18} color="#ffffff" style={{ marginRight: 8 }} />
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
            <Ionicons name="lock-closed-outline" size={36} color="#ef4444" style={{ marginBottom: 8 }} />
            <Text style={styles.modalTitle}>Acceso No Autorizado</Text>
            
            <View style={styles.emailBadge}>
              <Text style={styles.emailBadgeText}>{unauthorizedModal.email}</Text>
            </View>

            <Text style={styles.modalDescription}>
              Esta cuenta no cuenta con un perfil o rol asignado en el sistema de distribución de agua de EPS Moyobamba.
            </Text>

            <View style={styles.modalInstructionBox}>
              <Text style={styles.modalInstructionText}>
                <Ionicons name="information-circle-outline" size={13} color="#0284c7" /> <Text style={{ fontWeight: '700' }}>¿Eres personal de EPS Moyobamba?</Text>{'\n'}
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
    borderRadius: 32,
    padding: 26,
    borderWidth: 1.5,
    borderColor: '#1e293b',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
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
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 14,
  },
  directLoginBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  directLoginBtnText: {
    color: '#ffffff',
    fontSize: 15.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
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
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  appleBtn: {
    backgroundColor: '#000000',
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
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
  quickChip: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickChipText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
});
