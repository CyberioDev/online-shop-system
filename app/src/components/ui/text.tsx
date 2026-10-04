import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

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

export function Text({ variant = 'body', color = Colors.text, style, ...rest }: TextProps) {
  return <RNText style={[styles[variant], { color }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  hero: { fontFamily: Fonts.display, fontSize: 38, lineHeight: 46, letterSpacing: -0.5 },
  display: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  title: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 24 },
  heading: { fontFamily: Fonts.bold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: Fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: Fonts.semibold, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: Fonts.semibold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20 },
  captionMedium: { fontFamily: Fonts.semibold, fontSize: 13, lineHeight: 18 },
});
