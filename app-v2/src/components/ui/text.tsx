import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useColors } from '@/theme';

type Variant =
  | 'hero' // big numbers on summary cards
  | 'display' // page titles
  | 'title' // card titles
  | 'heading'
  | 'body'
  | 'bodyMedium'
  | 'label'
  | 'caption'
  | 'captionMedium';

export type TextProps = RNTextProps & {
  variant?: Variant;
  color?: string;
};

export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  const colors = useColors();
  return <RNText style={[styles[variant], { color: color ?? colors.text }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  hero: { fontFamily: Fonts.display, fontSize: 48, lineHeight: 58, letterSpacing: -2 },
  display: { fontFamily: Fonts.display, fontSize: 32, lineHeight: 40, letterSpacing: -1.2 },
  title: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 24 },
  heading: { fontFamily: Fonts.bold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: Fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: Fonts.semibold, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: Fonts.semibold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20 },
  captionMedium: { fontFamily: Fonts.semibold, fontSize: 13, lineHeight: 18 },
});
