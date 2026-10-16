import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { feedback } from '@/lib/haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPress={(ev) => {
        if (!props.disabled) feedback('selection');
        props.onPress?.(ev);
      }}
    />
  );
}
