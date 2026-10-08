import { useWindowDimensions } from 'react-native';

import { WideBreakpoint } from '@/constants/theme';

/** True on tablet/desktop widths, where the app uses a sidebar and multi-column layouts. */
export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WideBreakpoint;
}
