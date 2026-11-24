import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';

/** A link already opened, so the launch link and the live listener never both navigate. */
let handled: string | null = null;

/** "saanpaw://report?kind=lost&id=..." -> { kind, id }; anything else -> null. */
export function parseReportLink(url: string | null): { kind: 'lost' | 'found'; id: string } | null {
  if (!url || !url.startsWith('saanpaw://report')) return null;
  const kind = /[?&]kind=(lost|found)\b/.exec(url)?.[1] as 'lost' | 'found' | undefined;
  const id = /[?&]id=([a-f0-9]{24})\b/i.exec(url)?.[1];
  return kind && id ? { kind, id } : null;
}

/**
 * Opens a report shared outside the app (a SaanPaw link on Facebook, Messenger...) straight on its
 * page, signed in or not. `rootScreen` is the navigator this runs in, under the root stack.
 */
export function useReportLinks(rootScreen: 'Auth' | 'User' | 'Shelter') {
  const navigation = useNavigation<any>();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (url: string | null) => {
      const link = parseReportLink(url);
      if (!link || handled === url) return;
      handled = url;
      navigation.navigate(rootScreen, { screen: 'PublicReport', params: link });
    };
    void Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, [navigation, rootScreen]);
}
