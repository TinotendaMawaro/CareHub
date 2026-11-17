import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * React Native Web ships Alert.alert as a no-op, so confirmations and error popups would silently vanish
 * in the browser build. Map it onto window.alert / window.confirm. Native platforms are untouched.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = buttons ?? [];
    const cancel = actions.find((b) => b.style === 'cancel');
    const confirmButton = actions.find((b) => b !== cancel);
    if (actions.length > 1 && confirmButton) {
      if (window.confirm(text)) confirmButton.onPress?.();
      else cancel?.onPress?.();
      return;
    }
    window.alert(text);
    (actions[0] ?? confirmButton)?.onPress?.();
  };
}
