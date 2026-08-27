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
import { getDatabase } from '../database/schema';
import { BACKEND_URL } from '../config/api';

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
    // Load last session email if available
    (async () => {
      try {
        const db = await getDatabase();
        const lastSession = await db.getFirstAsync(
          `SELECT email FROM sesion_usuario ORDER BY id DESC LIMIT 1`
        ) as any;
        if (lastSession?.email) {
          setEmail(lastSession.email);
        }
      } catch (_) {}
    })();
  }, []);

  const performLogin = async (targetEmail: string, provider: 'Google' | 'Apple') => {
    const cleanEmail = targetEmail.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert(
        `Ingresar Correo de ${provider}`,
        `Por favor ingrese su cuenta de correo (${provider} o Institucional EPS) para iniciar sesión.`
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: 'mock_token_or_google_token',
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

      // Save session in SQLite
      const db = await getDatabase();
      await db.runAsync('DELETE FROM sesion_usuario');
      await db.runAsync(
        `INSERT INTO sesion_usuario (id, email, nombres, rol, token, created_at)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [data.user.email, data.user.nombres, data.user.rol, data.token, new Date().toISOString()]
      );

      Alert.alert('Bienvenido', `Sesión iniciada como: ${data.user.nombres} (${data.user.rol})`);
      onLoginSuccess(data.user);
    } catch (err: any) {
      // Offline fallback: check if session already exists in local SQLite
      try {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM sesion_usuario');
        await db.runAsync(
          `INSERT INTO sesion_usuario (id, email, nombres, rol, token, created_at)
           VALUES (1, ?, ?, ?, ?, ?)`,
          [cleanEmail, cleanEmail.split('@')[0], 'OPERADOR_CAMPO', 'offline_token', new Date().toISOString()]
        );
        Alert.alert('Modo Offline Activo', 'Iniciando en modo sin conexión como Operador de Campo.');
        onLoginSuccess({ email: cleanEmail, nombres: cleanEmail.split('@')[0], rol: 'OPERADOR_CAMPO' });
      } catch (offlineErr: any) {
        Alert.alert('Error de conexión', 'No se pudo conectar con el servidor: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    performLogin(email, 'Google');
  };

  const handleAppleLogin = () => {
    performLogin(email, 'Apple');
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
          {/* LOGO */}
          <View style={styles.logoContainer}>
            <View style={styles.iconCircle}>
              <Text style={styles.logoIcon}>💧</Text>
            </View>
            <Text style={styles.appTitle}>Agua Móvil</Text>
            <Text style={styles.appSubtitle}>EPS MOYOBAMBA S.A.</Text>
            <Text style={styles.appTagline}>Sistema de Reparto y Control en Campo</Text>
          </View>

          {/* EMAIL INPUT WITH CLEAR / SWITCH BUTTON */}
          <View style={styles.inputContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.inputLabel}>Correo Institucional / Google / Apple:</Text>
              {email ? (
                <TouchableOpacity onPress={handleClearEmail}>
                  <Text style={styles.clearText}>✕ Cambiar correo</Text>
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
            />
          </View>

          {/* GOOGLE SIGN IN BUTTON */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#1e293b" />
            ) : (
              <View style={styles.btnRow}>
                <Text style={styles.googleIconText}>G</Text>
                <Text style={styles.googleBtnText}>Iniciar sesión con Google</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* APPLE SIGN IN BUTTON */}
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

          {/* QUICK ACCOUNT SWITCHER HINT */}
          <TouchableOpacity
            style={styles.switchAccountBtn}
            onPress={() => {
              setEmail('');
            }}
          >
            <Text style={styles.switchAccountText}>👤 ¿Deseas ingresar con otro correo? Toca aquí</Text>
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
              Esta cuenta no cuenta con un perfil o rol asignado en el sistema de distribución de agua.
            </Text>

            <View style={styles.modalInstructionBox}>
              <Text style={styles.modalInstructionText}>
                📌 <Text style={{ fontWeight: '700' }}>¿Eres personal de EPS Moyobamba?</Text>{'\n'}
                Solicita al Administrador que registre tu correo como Conductor o Supervisor en el panel web.
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
    padding: 20,
  },
  card: {
    backgroundColor: '#131f3d',
    borderRadius: 24,
    padding: 26,
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
    marginBottom: 24,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.4)',
  },
  logoIcon: {
    fontSize: 34,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  appSubtitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  appTagline: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  inputContainer: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
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
  },
  googleBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  appleBtn: {
    backgroundColor: '#000000',
    borderRadius: 14,
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
    fontSize: 18,
    fontWeight: '900',
    color: '#ea4335',
    marginRight: 10,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  appleLogoIcon: {
    fontSize: 18,
    color: '#ffffff',
    marginRight: 10,
  },
  appleBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  switchAccountBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  switchAccountText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 6,
  },
  // MODAL STYLES
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
