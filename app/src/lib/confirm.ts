import { Alert } from 'react-native';

/** Yes/no dialog. Web uses `confirm.web.ts`, since Alert has no buttons there. */
export function confirm(title: string, message: string, confirmLabel: string) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Болих', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
