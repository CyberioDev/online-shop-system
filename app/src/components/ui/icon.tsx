import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';

import { useColors } from '@/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const colors = useColors();
  return <Feather name={name} size={size} color={color ?? colors.text} />;
}
