import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';

import { Colors } from '@/constants/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({
  name,
  size = 20,
  color = Colors.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} />;
}
