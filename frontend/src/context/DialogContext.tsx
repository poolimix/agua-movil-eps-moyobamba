import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

export type DialogType = 'danger' | 'warning' | 'info' | 'success';

export interface DialogOptions {
  title?: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
}

interface DialogState extends DialogOptions {
  isOpen: boolean;
  isConfirm: boolean;
  resolve: (value: boolean) => void;
}

interface DialogContextType {
  confirm: (options: DialogOptions | string) => Promise<boolean>;
  alert: (options: DialogOptions | string) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

// Standalone global ref so functions can be called anywhere
let globalDialogDispatcher: DialogContextType | null = null;

export function dialogConfirm(options: DialogOptions | string): Promise<boolean> {
  if (globalDialogDispatcher) {
    return globalDialogDispatcher.confirm(options);
  }
  // Fallback if not mounted yet
  const msg = typeof options === 'string' ? options : options.message;
  return Promise.resolve(window.confirm(msg));
}

export function dialogAlert(options: DialogOptions | string): Promise<void> {
  if (globalDialogDispatcher) {
    return globalDialogDispatcher.alert(options);
  }
  // Fallback if not mounted yet
  const msg = typeof options === 'string' ? options : options.message;
  window.alert(msg);
  return Promise.resolve();
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback((options: DialogOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      const opts: DialogOptions = typeof options === 'string' ? { message: options } : options;
      setDialog({
        ...opts,
        title: opts.title || (opts.type === 'danger' ? '¿Estás seguro?' : 'Confirmación'),
        type: opts.type || 'warning',
        confirmText: opts.confirmText || 'Aceptar',
        cancelText: opts.cancelText || 'Cancelar',
        isOpen: true,
        isConfirm: true,
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: DialogOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      const opts: DialogOptions = typeof options === 'string' ? { message: options } : options;
      let defaultTitle = 'Aviso del Sistema';
      let defaultType: DialogType = opts.type || 'info';

      if (opts.message.startsWith('✅')) {
        defaultTitle = 'Operación Exitosa';
        defaultType = 'success';
      } else if (opts.message.startsWith('❌') || opts.message.toLowerCase().includes('error')) {
        defaultTitle = 'Atención / Error';
        defaultType = 'danger';
      }

      setDialog({
        ...opts,
        title: opts.title || defaultTitle,
        type: opts.type || defaultType,
        confirmText: opts.confirmText || 'Entendido',
        isOpen: true,
        isConfirm: false,
        resolve: () => resolve(),
      });
    });
  }, []);

  useEffect(() => {
    globalDialogDispatcher = { confirm, alert };
    const originalAlert = window.alert;
    window.alert = (msg?: any) => {
      alert(String(msg ?? ''));
    };

    return () => {
      globalDialogDispatcher = null;
      window.alert = originalAlert;
    };
  }, [confirm, alert]);

  // Handle ESC and auto-focus
  useEffect(() => {
    if (!dialog?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [dialog?.isOpen]);

  const handleClose = (result: boolean) => {
    if (!dialog) return;
    dialog.resolve(result);
    setDialog(null);
  };

  const getTheme = (type?: DialogType) => {
    switch (type) {
      case 'danger':
        return {
          icon: '🗑️',
          badgeBg: '#fee2e2',
          badgeBorder: '#fca5a5',
          btnBg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          btnHover: '#b91c1c',
          btnColor: '#ffffff',
          accentColor: '#dc2626',
        };
      case 'warning':
        return {
          icon: '⚠️',
          badgeBg: '#fef3c7',
          badgeBorder: '#fde68a',
          btnBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          btnHover: '#b45309',
          btnColor: '#ffffff',
          accentColor: '#d97706',
        };
      case 'success':
        return {
          icon: '✅',
          badgeBg: '#dcfce7',
          badgeBorder: '#86efac',
          btnBg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          btnHover: '#047857',
          btnColor: '#ffffff',
          accentColor: '#059669',
        };
      case 'info':
      default:
        return {
          icon: 'ℹ️',
          badgeBg: '#e0f2fe',
          badgeBorder: '#bae6fd',
          btnBg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          btnHover: '#075985',
          btnColor: '#ffffff',
          accentColor: '#0284c7',
        };
    }
  };

  const theme = getTheme(dialog?.type);
  const icon = dialog?.icon || theme.icon;

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}

      {dialog?.isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 16,
            animation: 'dialogFadeIn 0.2s ease-out',
          }}
          onClick={() => handleClose(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 20,
              padding: '28px 26px 24px',
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.8)',
              textAlign: 'center',
              animation: 'dialogScaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ICON BADGE */}
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                backgroundColor: theme.badgeBg,
                border: `2px solid ${theme.badgeBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                margin: '0 auto 16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              }}
            >
              {icon}
            </div>

            {/* TITLE */}
            <h3
              style={{
                margin: '0 0 10px',
                fontSize: 19,
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.02em',
              }}
            >
              {dialog.title}
            </h3>

            {/* MESSAGE */}
            <div
              style={{
                fontSize: 14,
                color: '#475569',
                lineHeight: 1.55,
                margin: '0 0 24px',
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}
            >
              {dialog.message}
            </div>

            {/* ACTIONS */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'center',
              }}
            >
              {dialog.isConfirm && (
                <button
                  type="button"
                  onClick={() => handleClose(false)}
                  style={{
                    flex: 1,
                    padding: '11px 18px',
                    borderRadius: 12,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                >
                  {dialog.cancelText}
                </button>
              )}

              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => handleClose(true)}
                style={{
                  flex: 1,
                  padding: '11px 18px',
                  borderRadius: 12,
                  border: 'none',
                  background: theme.btnBg,
                  color: theme.btnColor,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: `0 4px 12px ${theme.badgeBorder}`,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes dialogFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes dialogScaleUp {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </DialogContext.Provider>
  );
}
